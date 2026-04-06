"""Research-layer implementation skeleton for the OpenClaw lineage lab."""

__version__ = "0.1.0"

from .message_queue import AtomicFileWriter, GenesisEventBus, GenesisQueue
from .io import append_jsonl, ensure_dir, load_json, load_yaml, write_json, write_yaml

__all__ = [
    "AtomicFileWriter",
    "GenesisEventBus",
    "GenesisQueue",
    "append_jsonl",
    "ensure_dir",
    "load_json",
    "load_yaml",
    "write_json",
    "write_yaml",
]
