---
title: OpenClaw-Genesis 发行包
summary: 使用独立状态目录和首次启动自动生成 Genesis 配置的方式，快速启动 OpenClaw-Genesis。
---

# OpenClaw-Genesis 发行包

这条路线不先追求完美插件化，而是先做一个可运行、可移植、可演示的 Genesis 发行包。

## 发行包目标

- 保留 OpenClaw 启动内核
- 使用独立状态目录 `~/.openclaw-genesis`
- 首次启动自动生成 Genesis 配置和 `USER.md`
- 默认带上 Genesis 运行配置

## 入口

安装或在源码目录下构建后，使用：

```bash
openclaw-genesis gateway run
```

如果是源码目录，也可以：

```bash
node openclaw-genesis.mjs gateway run
```

## 首次启动会做什么

第一次运行 `openclaw-genesis` 时，如果下面两个文件不存在，会自动生成：

- `~/.openclaw-genesis/openclaw.json`
- `~/.openclaw-genesis/USER.md`

同时会默认设置这些环境变量：

- `OPENCLAW_STATE_DIR=~/.openclaw-genesis`
- `OPENCLAW_CONFIG_PATH=~/.openclaw-genesis/openclaw.json`
- `OPENCLAW_GENESIS_USER_PROFILE_PATH=~/.openclaw-genesis/USER.md`

## 当前内置内容

这一版先把 Genesis 发行包壳层收出来，核心是：

- 独立启动入口
- 独立 heartbeat 入口
- 独立状态目录
- 首次启动自动生成 Genesis 配置
- Genesis 专用服务器配置脚本默认使用 `.openclaw-genesis`

## heartbeat 入口

现在发行包也有独立 heartbeat 入口：

```bash
openclaw-genesis-heartbeat --trigger heartbeat
```

如果是源码目录，也可以：

```bash
node openclaw-genesis-heartbeat.mjs --trigger heartbeat
```

## 当前边界

这一版先解决发行包壳层和独立状态目录，不做大规模插件化重构。

后续继续完善：

- 更完整的首次启动向导
- 外部发布链的一键重接

## 相关文档

- [Genesis 10 分钟最短路径](/install/genesis-10-minute-quickstart)
- [Genesis 冷启动部署（Ubuntu 24.04）](/install/genesis-cold-start-ubuntu)
- [Genesis 外部发布链重新接入](/install/genesis-external-publish-reconnect)
