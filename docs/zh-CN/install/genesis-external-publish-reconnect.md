---
title: Genesis 外部发布链重新接入
summary: 在新服务器上重新接起微博、微头条等外部发布链，说明登录态池、账号池、浏览器发现、迁移与重新绑定的正确方式。
---

# Genesis 外部发布链重新接入

这份文档专门解决一个问题：

**新服务器基础部署已经完成后，如何把微博 / 微头条等外部发布链重新接起来。**

它覆盖：

- 登录态池怎么理解
- 哪些账号记录可以跨机器迁移
- 哪些不能迁
- 如何重新绑定
- 如何验证外部发布链真的恢复了

## 1. 先理解两类登录态

当前 Genesis 登录态池里，最重要的是这两类：

### A. `browser_popup + storage_state`

典型来源：

- `genesis:login`

特征：

- `source = browser_popup` 或 `manual_bootstrap`
- `authMode = storage_state`
- 依赖一个 `storageStatePath` JSON 文件

这类是**优先推荐迁移**的，因为它更便携。

### B. `browser_scan + profile_dir`

典型来源：

- `genesis:discover-logins`

特征：

- `source = browser_scan`
- `authMode = profile_dir`
- 依赖浏览器 profile 目录

这类适合**本机直接发现和本机直接用**，但**不适合直接跨机器迁移**，因为：

- profile 路径是机器相关的
- 浏览器内部文件结构和登录状态依赖本机环境
- Windows profile 目录不能直接当 Linux profile 用

一句话：

- **跨服务器迁移，优先迁 `storage_state`**
- **不要指望 `browser_scan/profile_dir` 直接跨机器复用**

## 2. 推荐接入顺序

在新服务器上，外部发布链建议按这个顺序接：

1. 先保证基础链通
   - provider
   - QQ
   - heartbeat
   - `pnpm genesis:verify`
2. 再处理登录态池
3. 再验证账号池可用性
4. 最后跑真实发布

## 3. 方案一：在目标机重新绑定登录态

这是最稳的方案。

如果目标机能打开浏览器，就直接在目标机重新做：

```bash
cd /opt/openclaw-genesis
corepack pnpm genesis:login -- --platform weibo --state-dir /root/.openclaw
```

或者：

```bash
cd /opt/openclaw-genesis
corepack pnpm genesis:login -- --platform toutiao --state-dir /root/.openclaw
```

登录完成后，检查：

```bash
cd /opt/openclaw-genesis
node openclaw.mjs agent --message "/accounts" --json
```

你应该能在输出里看到：

- `platform=weibo` 或 `platform=toutiao`
- `status=ready`

## 4. 方案二：从旧机器迁移可移植登录态

如果旧机器上已经有 `browser_popup/storage_state` 记录，可以迁。

### 4.1 先定位旧机器的 Genesis 状态目录

常见位置：

- Windows：
  - `C:\Users\Administrator\.openclaw\genesis`
- Linux：
  - `~/.openclaw/genesis`

重点文件：

- `login-state-pool.json`
- `login-storage/`

### 4.2 只迁移这类记录

优先迁：

- `source = browser_popup`
- `source = manual_bootstrap`
- `authMode = storage_state`

不要直接迁：

- `source = browser_scan`
- `authMode = profile_dir`

### 4.3 同步文件到新服务器

Windows 本机示例：

```powershell
scp -i C:\Users\Administrator\.ssh\id_ed25519 -r C:\Users\Administrator\.openclaw\genesis\login-storage root@YOUR_HOST:/root/.openclaw/genesis/
scp -i C:\Users\Administrator\.ssh\id_ed25519 C:\Users\Administrator\.openclaw\genesis\login-state-pool.json root@YOUR_HOST:/root/.openclaw/genesis/
```

### 4.4 迁移时的关键提醒

即使文件都拷过去了，`login-state-pool.json` 里的绝对路径也可能还是旧机器路径。

所以迁移后必须做两件事：

1. 只保留 `storage_state` 记录
2. 重新核对或修复 `storageStatePath`

如果你不想手动处理路径，**更推荐重新跑一次 `genesis:login`**，因为那样最稳。

## 5. 方案三：在新机器直接发现已登录浏览器

如果新机器本身就已经登录过微博、头条等平台，可以直接扫描：

```bash
cd /opt/openclaw-genesis
corepack pnpm genesis:discover-logins -- --platforms weibo,toutiao,github --state-dir /root/.openclaw
```

这条链适合：

- 本机浏览器已登录
- 想快速把账号池建起来

但要注意：

- 这类记录多为 `browser_scan/profile_dir`
- 更适合 `browse`
- 对 `publish` 来说，优先级通常不如 `browser_popup/storage_state`

## 6. 如何验证账号池已经接上

### 6.1 看账号池

```bash
cd /opt/openclaw-genesis
node openclaw.mjs agent --message "/accounts" --json
```

重点看：

- `ready`
- `relogin_needed`
- `platform`
- `capability`
- `evidence`
- `id`

### 6.2 看工作板

```bash
cd /opt/openclaw-genesis
node openclaw.mjs agent --message "/progress" --json
```

重点看：

- 当前是否出现：
  - `creator:external_publish`
  - `scout:external_signal`
- 最近 evidence 是否有：
  - `platform=weibo capability=publish`
  - `platform=toutiao capability=publish`

## 7. 如何验证外部发布链真的恢复了

### 微博

恢复成功时，evidence 应该是帖子级：

- `evidenceType = post_id`
- `evidenceValue = https://weibo.com/...`
- `externalId = 某个微博 post_id`

不是首页级：

- `https://weibo.com/`

### 微头条

恢复成功时，evidence 应该是帖子级：

- `evidenceType = thread_id`
- `evidenceValue = https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=...`
- `externalId = 某个 thread_id`

不是旧的发布页：

- `graphic/publish`

## 8. 常见坑

### 坑 1：旧机器的 `browser_scan` 记录直接拷到新机器

这通常不可靠，因为：

- profile 目录是机器相关的
- 路径也会变

### 坑 2：账号池看起来有记录，但全是 `relogin_needed`

这说明：

- 登录态存在
- 但实际已经失效

此时不要继续硬跑发布，直接重绑对应平台登录态。

### 坑 3：平台能浏览，不能发布

这通常意味着：

- `browse` 能力来自 `browser_scan`
- `publish` 最好还是重新用 `genesis:login` 绑定一次可复用的登录态

## 9. 推荐实践

如果目标是让微博 / 微头条在新服务器上尽快恢复工作，我建议：

1. 微博和头条都优先重新跑一次 `genesis:login`
2. `browser_scan` 只作为补充发现，不当主发布账号
3. `/accounts` 先看到 `ready`
4. `/progress` 再看到：
   - `creator:external_publish`
   - 真实帖子级 evidence

## 10. 当前这套系统的最佳理解方式

现在的登录态池不是“把账号密码打进代码包里”，而是：

- 包里带能力和适配器
- 登录态保存在本地状态目录
- founder 从账号池里拿资源去执行

这也是为什么：

- **包可分发**
- **登录态不应该打包进仓库**
- **账号池应该按环境重建或迁移**


## 11. 导出 / 导入脚本（推荐）
如果旧机器已经有可用的微博 / 头条登录态，优先直接用脚本迁移，不要手工改 JSON。

旧机器导出：
`powershell
cd C:\Users\Administrator\openclaw.clean
corepack pnpm genesis:export-logins -- --platforms weibo,toutiao --output-dir C:\Users\Administrator\Documents\New project\genesis-login-export --state-dir C:\Users\Administrator\.openclaw
`

同步到新服务器：
`powershell
scp -i C:\Users\Administrator\.ssh\id_ed25519 -r C:\Users\Administrator\Documents\New project\genesis-login-export root@YOUR_HOST:/root/
`

新服务器导入：
`ash
cd /opt/openclaw-genesis
node --import tsx scripts/genesis-import-login-states.ts --import-dir /root/genesis-login-export --state-dir /root/.openclaw
`

导入后建议立刻验证：
`ash
cd /opt/openclaw-genesis
corepack pnpm genesis:heartbeat -- --trigger heartbeat --state-dir /root/.openclaw
`

重点看：
- /root/.openclaw/genesis/login-state-pool.json 里账号是否变成 ready
- /root/.openclaw/genesis/proactive-work-summary.json 里是否开始出现新的 publication 或 browse evidence
