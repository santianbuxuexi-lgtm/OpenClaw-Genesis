---
title: Genesis 10 分钟最短路径
summary: 第一次对接时，按最短路径在 Ubuntu 24.04 上拉起 OpenClaw + Genesis + provider + QQ + heartbeat。
---

# Genesis 10 分钟最短路径

这份文档适合第一次对接的人直接照抄命令。

目标只有一个：

- 在全新 Ubuntu 24.04 服务器上，把 `OpenClaw + Genesis + provider + QQ + heartbeat` 跑起来

如果你要完整背景说明，看：

- [Genesis 冷启动部署（Ubuntu 24.04）](/install/genesis-cold-start-ubuntu)

## 0. 你需要先准备

- 一台 Ubuntu 24.04 服务器
- SSH 已能登录
- 本地源码目录：
  - `C:\Users\Administrator\openclaw.clean`
- provider 参数：
  - `OPENCLAW_GATEWAY_TOKEN`
  - `GENESIS_PROVIDER_BASE_URL`
  - `GENESIS_PROVIDER_API_KEY`
  - `GENESIS_PROVIDER_MODEL_ID`
- QQ 参数：
  - `OPENCLAW_QQBOT_APP_ID`
  - `OPENCLAW_QQBOT_CLIENT_SECRET`

## 1. 同步代码到服务器

Windows PowerShell：

```powershell
rsync -av --delete -e "ssh -i C:\Users\Administrator\.ssh\id_ed25519" C:\Users\Administrator\openclaw.clean\ root@YOUR_HOST:/opt/openclaw-genesis/
```

## 2. 一键跑基础部署

服务器上：

```bash
cd /opt/openclaw-genesis
bash scripts/bootstrap-genesis-ubuntu.sh
```

跑完以后，这两项必须通过：

```bash
node -v
pnpm -v
```

以及：

```bash
cd /opt/openclaw-genesis
pnpm build:docker
pnpm genesis:verify
```

## 3. 生成配置

服务器上：

```bash
cd /opt/openclaw-genesis
OPENCLAW_GATEWAY_TOKEN="REPLACE_ME" \
GENESIS_PROVIDER_BASE_URL="https://gpt.qt.cool/v1" \
GENESIS_PROVIDER_API_KEY="REPLACE_ME" \
GENESIS_PROVIDER_MODEL_ID="MiniMax-M2.5" \
OPENCLAW_QQBOT_APP_ID="REPLACE_ME" \
OPENCLAW_QQBOT_CLIENT_SECRET="REPLACE_ME" \
bash scripts/setup-genesis-server-config.sh
```

如果 QQ 插件走本地 tarball，再加：

```bash
OPENCLAW_QQBOT_SOURCE_PATH="/opt/openclaw-genesis/tencent-connect-openclaw-qqbot-1.6.3.tgz"
```

## 4. 装 QQ 插件

服务器上：

```bash
cd /opt/openclaw-genesis
npm pack @tencent-connect/openclaw-qqbot@1.6.3
node openclaw.mjs plugins install ./tencent-connect-openclaw-qqbot-1.6.3.tgz
node openclaw.mjs plugins list
```

## 5. 装 Gateway

服务器上：

```bash
cd /opt/openclaw-genesis
node openclaw.mjs gateway install --runtime node --port 18789 --token "$OPENCLAW_GATEWAY_TOKEN" --force
node openclaw.mjs doctor --fix
node openclaw.mjs gateway start
node openclaw.mjs gateway status
```

## 6. 装 heartbeat

先准备：

- `/root/USER.md`

然后服务器上：

```bash
cd /opt/openclaw-genesis
REPO_DIR=/opt/openclaw-genesis \
OPENCLAW_STATE_DIR=/root/.openclaw \
OPENCLAW_GENESIS_USER_PROFILE_PATH=/root/USER.md \
GENESIS_HEARTBEAT_INTERVAL=15min \
bash scripts/install-genesis-heartbeat-systemd.sh
```

## 7. 最小验收

### Gateway

```bash
cd /opt/openclaw-genesis
node openclaw.mjs gateway probe
```

### provider

```bash
cd /opt/openclaw-genesis
node openclaw.mjs models status --plain
node openclaw.mjs agent --to +8613800000000 --message "只回复 OK" --json
```

### QQ

```bash
cd /opt/openclaw-genesis
node openclaw.mjs channels status --json
```

### heartbeat

```bash
cd /opt/openclaw-genesis
corepack pnpm genesis:heartbeat -- --trigger heartbeat --state-dir /root/.openclaw
```

### Genesis

```bash
cd /opt/openclaw-genesis
pnpm genesis:verify
```

## 8. 成功标准

你至少要看到这些：

- `build:docker` 成功
- `pnpm genesis:verify` 成功
- gateway `RPC probe: ok`
- 模型调用返回 `OK`
- QQ `configured/running/connected = true`
- heartbeat 返回 `status = ran`

## 9. 下一步

如果基础链已经通了，下一步直接看：

- [Genesis 外部发布链重新接入](/install/genesis-external-publish-reconnect)

