---
title: Genesis 冷启动部署（Ubuntu 24.04）
summary: 在全新 Ubuntu 24.04 服务器上重复部署 OpenClaw + Genesis，并接起 provider、QQ、heartbeat 与完整线上验收。
---

# Genesis 冷启动部署（Ubuntu 24.04）

这份文档是我们已经实际跑通的一条最小可复现路径，目标不是只把 Gateway 装起来，而是尽量一次性把下面几条链接好：

- OpenClaw + Genesis 能正常构建
- `pnpm genesis:verify` 全绿
- provider 可用
- QQ 可用
- heartbeat 可用
- 外部发布链具备继续接入的底座

如果你只想先跑最快路径，直接看：

- [Genesis 10 分钟最短路径](/install/genesis-10-minute-quickstart)

推荐环境：

- Ubuntu 24.04 LTS
- `root` 或具备 `sudo` 的用户
- 已能通过 SSH 登录服务器

## 1. 最短路径

如果你想先把基础部署跑通，按这 4 步走：

1. 同步仓库到服务器
2. 运行 `scripts/bootstrap-genesis-ubuntu.sh`
3. 运行 `scripts/setup-genesis-server-config.sh`
4. 安装 gateway、QQ 插件、heartbeat 并做验收

下面是完整步骤。

## 2. 同步仓库

Windows 本机示例：

```powershell
rsync -av --delete -e "ssh -i C:\Users\Administrator\.ssh\id_ed25519" C:\Users\Administrator\openclaw.clean\ root@YOUR_HOST:/opt/openclaw-genesis/
```

如果本机没有 `rsync`，也可以先用 `scp`：

```powershell
scp -i C:\Users\Administrator\.ssh\id_ed25519 -r C:\Users\Administrator\openclaw.clean root@YOUR_HOST:/opt/openclaw-genesis
```

## 3. 基础部署脚本

服务器上执行：

```bash
cd /opt/openclaw-genesis
bash scripts/bootstrap-genesis-ubuntu.sh
```

这个脚本会完成：

- 安装系统依赖
- 安装 Node `v24.9.0`
- 激活 `pnpm 10.32.1`
- 安装依赖
- 修复 `scripts/*.sh` 可执行位
- 运行 `build:docker`
- 运行 `pnpm genesis:verify`

通过标准：

- `build:docker` 成功
- `pnpm genesis:verify` 成功

## 4. 生成运行配置

先准备这些值：

- `OPENCLAW_GATEWAY_TOKEN`
- `GENESIS_PROVIDER_BASE_URL`
- `GENESIS_PROVIDER_API_KEY`
- `GENESIS_PROVIDER_MODEL_ID`
- `OPENCLAW_QQBOT_APP_ID`
- `OPENCLAW_QQBOT_CLIENT_SECRET`

服务器上执行：

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

如果 QQ 插件使用本地 tarball 安装，再补：

```bash
OPENCLAW_QQBOT_SOURCE_PATH="/opt/openclaw-genesis/tencent-connect-openclaw-qqbot-1.6.3.tgz"
```

脚本会写入：

- `~/.openclaw/openclaw.json`

## 5. 安装 QQ 插件

如果直接从远端插件源安装受限流影响，推荐走 npm tarball：

```bash
cd /opt/openclaw-genesis
npm pack @tencent-connect/openclaw-qqbot@1.6.3
node openclaw.mjs plugins install ./tencent-connect-openclaw-qqbot-1.6.3.tgz
node openclaw.mjs plugins list
```

## 6. 安装并启动 Gateway

```bash
cd /opt/openclaw-genesis
node openclaw.mjs gateway install --runtime node --port 18789 --token "$OPENCLAW_GATEWAY_TOKEN" --force
node openclaw.mjs gateway start
node openclaw.mjs gateway status
```

建议补一遍：

```bash
cd /opt/openclaw-genesis
node openclaw.mjs doctor --fix
```

## 7. 安装 heartbeat 定时器

先准备一份用户画像，例如：

- `/root/USER.md`

然后执行：

```bash
cd /opt/openclaw-genesis
REPO_DIR=/opt/openclaw-genesis \
OPENCLAW_STATE_DIR=/root/.openclaw \
OPENCLAW_GENESIS_USER_PROFILE_PATH=/root/USER.md \
GENESIS_HEARTBEAT_INTERVAL=15min \
bash scripts/install-genesis-heartbeat-systemd.sh
```

验证：

```bash
systemctl status openclaw-genesis-heartbeat.timer --no-pager
systemctl list-timers --all | grep openclaw-genesis-heartbeat
```

## 8. 完整线上验收

### 8.1 Gateway / provider

```bash
cd /opt/openclaw-genesis
node openclaw.mjs gateway probe
node openclaw.mjs models status --plain
node openclaw.mjs agent --to +8613800000000 --message "只回复 OK" --json
```

通过标准：

- Gateway `RPC probe: ok`
- 默认模型正确
- agent 能真实返回 `OK`

### 8.2 QQ

```bash
cd /opt/openclaw-genesis
node openclaw.mjs channels status --json
```

通过标准：

- `configured = true`
- `running = true`
- `connected = true`

### 8.3 Genesis heartbeat

```bash
cd /opt/openclaw-genesis
corepack pnpm genesis:heartbeat -- --trigger heartbeat --state-dir /root/.openclaw
```

通过标准：

- 返回 `status = ran`

### 8.4 Genesis smoke

```bash
cd /opt/openclaw-genesis
pnpm genesis:verify
```

通过标准：

- `verdict = ok`

## 9. 外部发布链怎么接

基础部署成功后，继续接：

1. 用户画像 `USER.md`
2. history 累积
3. 登录态池 / 账号池
4. 微博 / 微头条等平台登录态
5. 外部执行器

这部分已经有底座，但在新服务器上通常还需要：

- 重新绑定登录态
- 或同步可复用的登录态池

完整说明看：

- [Genesis 外部发布链重新接入](/install/genesis-external-publish-reconnect)

## 10. 常见坑

### `scripts/*.sh` 无法执行

从 Windows 拷到 Linux 后很常见，直接执行：

```bash
chmod +x scripts/*.sh
```

### provider 已配好但模型命令改坏配置

如果你已经用 `scripts/setup-genesis-server-config.sh` 生成了完整配置，后面不要再随手跑：

```bash
node openclaw.mjs models set ...
```

优先重新跑配置脚本，而不是混用两套写配置方式。

### QQ 插件远程安装失败

优先走：

```bash
npm pack @tencent-connect/openclaw-qqbot@1.6.3
node openclaw.mjs plugins install ./tencent-connect-openclaw-qqbot-1.6.3.tgz
```

## 11. 当前这条路径已验证的结果

这份文档对应的流程已经在全新 Ubuntu 24.04 上跑通过：

- `build:docker`
- `pnpm genesis:verify`
- provider 可用
- QQ 可用
- heartbeat 可用

所以这不是理论说明，而是一条已经实际验证过的冷启动路径。
