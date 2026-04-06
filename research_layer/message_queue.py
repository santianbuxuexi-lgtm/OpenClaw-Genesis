"""
Genesis 消息队列 — 替代文件锁的并发安全 IPC 机制。

解决的问题：
  - genesis_kernel.py / ecology.py 多处使用 load_json → modify → write_json，
    并发时会产生 last-write-wins 竞态。
  - lineage-registry 的 JSON 文件读写同样不安全。

设计：
  - 基于文件系统的 WAL（Write-Ahead Log）+ 原子 rename
  - 每个队列一个 .queue 目录，消息为 JSONL 文件
  - 消费者通过 rename 原子取走消息（OS 级原子操作）
  - 无需外部依赖（Redis / RabbitMQ 等），纯 stdlib 实现
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Callable

from .io import ensure_dir


class GenesisQueue:
    """基于文件系统的原子消息队列。

    生产者：enqueue() 写入待处理消息
    消费者：dequeue() 原子取走消息（保证只有单个消费者能取到）
    """

    def __init__(self, queue_dir: Path, prefix: str = "msg") -> None:
        self.queue_dir = queue_dir
        self.prefix = prefix
        ensure_dir(queue_dir)

    def enqueue(self, payload: Any, ttl_seconds: int = 3600) -> str:
        """将消息写入队列，返回消息 ID。"""
        msg_id = uuid.uuid4().hex[:12]
        pending_path = self.queue_dir / f".{self.prefix}-{msg_id}.pending"
        queue_path = self.queue_dir / f"{self.prefix}-{msg_id}.jsonl"

        record = {
            "id": msg_id,
            "enqueued_at": time.time(),
            "ttl": ttl_seconds,
            "payload": payload,
        }

        # 1. 写入临时文件
        with pending_path.open("w", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False))
            f.write("\n")

        # 2. 原子 rename 到队列（OS 保证原子性）
        pending_path.rename(queue_path)
        return msg_id

    def dequeue(self, timeout_seconds: float = 0.0) -> dict[str, Any] | None:
        """尝试取走一条消息。timeout_seconds > 0 时会轮询等待。"""
        deadline = time.monotonic() + timeout_seconds if timeout_seconds > 0 else 0

        while True:
            for entry in sorted(self.queue_dir.glob(f"{self.prefix}-*.jsonl")):
                try:
                    # 原子 rename 取走
                    processing_path = self.queue_dir / f".{entry.name}.processing"
                    entry.rename(processing_path)
                except FileNotFoundError:
                    # 另一个消费者已经取走了
                    continue
                except OSError:
                    continue

                try:
                    record = json.loads(processing_path.read_text(encoding="utf-8").strip())
                except (json.JSONDecodeError, OSError) as exc:
                    processing_path.unlink(missing_ok=True)
                    continue

                # TTL 检查
                ttl = record.get("ttl", 3600)
                age = time.time() - record.get("enqueued_at", time.time())
                if age > ttl:
                    processing_path.unlink(missing_ok=True)
                    continue

                return record

            if deadline > 0 and time.monotonic() < deadline:
                time.sleep(min(0.1, deadline - time.monotonic()))
                continue
            break

        return None

    def ack(self, record: dict[str, Any]) -> None:
        """确认消息已处理（删除处理中的文件）。"""
        msg_id = record.get("id", "")
        processing_path = self.queue_dir / f".{self.prefix}-{msg_id}.jsonl.processing"
        processing_path.unlink(missing_ok=True)

    def nack(self, record: dict[str, Any]) -> None:
        """消息处理失败，重新放回队列。"""
        msg_id = record.get("id", "")
        processing_path = self.queue_dir / f".{self.prefix}-{msg_id}.jsonl.processing"
        queue_path = self.queue_dir / f"{self.prefix}-{msg_id}.jsonl"
        try:
            processing_path.rename(queue_path)
        except FileNotFoundError:
            pass

    def pending_count(self) -> int:
        """返回待处理消息数量。"""
        return sum(1 for _ in self.queue_dir.glob(f"{self.prefix}-*.jsonl"))

    def purge_expired(self) -> int:
        """清除所有过期消息，返回清除数量。"""
        now = time.time()
        purged = 0
        for entry in self.queue_dir.glob(f"{self.prefix}-*.jsonl"):
            try:
                record = json.loads(entry.read_text(encoding="utf-8").strip())
                age = now - record.get("enqueued_at", now)
                if age > record.get("ttl", 3600):
                    entry.unlink()
                    purged += 1
            except (json.JSONDecodeError, OSError):
                entry.unlink(missing_ok=True)
                purged += 1
        return purged


class AtomicFileWriter:
    """原子文件写入器 — 通过 write-to-temp + rename 保证并发安全。

    并发读安全说明：
      - POSIX: os.replace() 是原子操作，读端要么读到旧内容要么读到新内容
      - Windows: os.replace() 同样是原子替换（Python 3.3+）
      - rename 瞬间极短（微秒级），即使读到空文件的极端情况，
        load_json 的 try/except ValueError 也能优雅降级

    对读端的要求：
      - load_json() 应使用 try/except 包裹，遇到解析失败返回 fallback
      - genesis_kernel._load_accounts() 已经这样做了
    """

    def __init__(self, target_path: Path, temp_dir: Path | None = None) -> None:
        self.target_path = target_path
        self.temp_dir = temp_dir or target_path.parent
        ensure_dir(self.temp_dir)

    def write_text(self, content: str, encoding: str = "utf-8") -> None:
        """原子写入文本内容。使用 os.replace 而非 Path.replace 确保跨平台原子性。"""
        temp_path = self.temp_dir / f".{self.target_path.name}.{uuid.uuid4().hex[:8]}.tmp"
        try:
            with temp_path.open("w", encoding=encoding) as f:
                f.write(content)
            # os.replace 是原子操作（Python 3.3+），跨平台保证
            os.replace(str(temp_path), str(self.target_path))
        except BaseException:
            temp_path.unlink(missing_ok=True)
            raise

    def write_json(self, payload: Any, indent: int = 2) -> None:
        """原子写入 JSON。"""
        content = json.dumps(payload, indent=indent, ensure_ascii=False) + "\n"
        self.write_text(content)

    def write_yaml(self, payload: Any, sort_keys: bool = False) -> None:
        """原子写入 YAML。"""
        import yaml

        content = yaml.safe_dump(payload, sort_keys=sort_keys, allow_unicode=True)
        self.write_text(content)


class GenesisEventBus:
    """Genesis 事件总线 — 基于 queue 的发布/订阅机制。

    替代 ecology.py / genesis_kernel.py 中直接追加 JSONL 文件的方式，
    提供解耦的事件通知机制。
    """

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.queues: dict[str, GenesisQueue] = {}

    def get_queue(self, channel: str) -> GenesisQueue:
        if channel not in self.queues:
            queue_dir = self.base_dir / "queues" / channel
            self.queues[channel] = GenesisQueue(queue_dir, prefix=channel)
        return self.queues[channel]

    def publish(self, channel: str, event: dict[str, Any]) -> str:
        """发布事件到指定频道。"""
        queue = self.get_queue(channel)
        return queue.enqueue(event)

    def subscribe(
        self,
        channel: str,
        handler: Callable[[dict[str, Any]], Any],
        timeout_seconds: float = 30.0,
        max_messages: int = 0,
    ) -> int:
        """订阅频道并处理消息。

        Args:
            channel: 频道名称
            handler: 消息处理函数
            timeout_seconds: 最大等待时间
            max_messages: 最大处理消息数（0=无限）

        Returns:
            处理的消息数
        """
        queue = self.get_queue(channel)
        processed = 0

        while max_messages == 0 or processed < max_messages:
            remaining = timeout_seconds if processed == 0 else min(0.5, timeout_seconds)
            if timeout_seconds > 0 and remaining <= 0:
                break

            record = queue.dequeue(timeout_seconds=remaining)
            if record is None:
                break

            try:
                handler(record["payload"])
                queue.ack(record)
                processed += 1
            except Exception:
                queue.nack(record)
                raise

        return processed

    def drain(self, channel: str) -> int:
        """清空频道中的所有消息。"""
        queue = self.get_queue(channel)
        count = 0
        while queue.pending_count() > 0:
            record = queue.dequeue()
            if record is None:
                break
            queue.ack(record)
            count += 1
        return count
