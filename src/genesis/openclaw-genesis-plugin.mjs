#!/usr/bin/env node
/**
 * OpenClaw Genesis Plugin — 基于 before_dispatch hook 接入。
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 设计约束                                                │
 * │                                                         │
 * │ 1. 只注册 before_dispatch，不注册 inbound_claim          │
 * │    → 避免同一个 plugin 被两个 hook 同时调用导致双回复    │
 * │                                                         │
 * │ 2. priority = 0（最高优先级，数字越小越早执行）          │
 * │    → 确保比其他 plugin 更早拿到 genesis 消息             │
 * │                                                         │
 * │ 3. 启动时设置互斥环境变量 GENESIS_MUTEX_ENV_KEY         │
 * │    → dispatch patch 检测到后自动跳过，绝不双命中         │
 * │                                                         │
 * │ 4. 非 genesis 账户 → 立即返回 handled: false            │
 * │    → 零开销，不影响其他账户的正常流水线                   │
 * └─────────────────────────────────────────────────────────┘
 */

import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { buildSandboxEnv, resolveGenesisPaths, DEFAULT_RESOURCE_LIMITS } from "../../server-patches/genesis-env-sandbox.mjs";

// 导入互斥信号常量（与 genesis-qq-router.mjs 保持一致）
const GENESIS_MUTEX_ENV_KEY = "OPENCLAW_GENESIS_PLUGIN_ACTIVE";

// ── plugin 加载时设置互斥信号 ──
// dispatch patch 检测到这个值就会跳过
process.env[GENESIS_MUTEX_ENV_KEY] = "1";

// ─── 环境变量白名单（最小权限） ────────────────────────────────────────────────
const DEFAULT_ALLOWED_ENV_PREFIXES = [
  "OPENCLAW_GENESIS_",
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_CONFIG_PATH",
  "PATH",
  "HOME",
  "NODE_",
  "LANG",
  "LC_",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
];

function buildSandboxEnvForPlugin(targetStateDir, targetConfigPath) {
  const clean = {};
  for (const key of Object.keys(process.env)) {
    const allowed = DEFAULT_ALLOWED_ENV_PREFIXES.some(
      (prefix) => key === prefix || key.startsWith(prefix),
    );
    if (!allowed) continue;
    if (process.env[key] == null) continue;
    clean[key] = process.env[key];
  }
  clean.HOME = targetStateDir;
  clean.OPENCLAW_STATE_DIR = targetStateDir;
  clean.OPENCLAW_GENESIS_STATE_DIR = targetStateDir;
  clean.OPENCLAW_CONFIG_PATH = targetConfigPath;
  clean.OPENCLAW_GENESIS_CHANNEL_FEEDBACK_ENABLED = "1";
  return clean;
}

function isGenesisAccount(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "genesis";
}

function extractBody(ctx) {
  return (
    ctx?.BodyForCommands?.trim() ||
    ctx?.CommandBody?.trim() ||
    ctx?.Body?.trim() ||
    ""
  );
}

function dispatchGenesisReply(ctx) {
  const { stateDir, configPath, scriptDir } = resolveGenesisPaths();

  const input = {
    body: extractBody(ctx),
    sessionKey: ctx?.SessionKey,
    accountId: ctx?.AccountId,
    senderLabel:
      ctx?.SenderName?.trim() ||
      ctx?.SenderUsername?.trim() ||
      undefined,
    threadLabel:
      ctx?.ThreadLabel?.trim() ||
      (typeof ctx?.MessageThreadId === "string" ? ctx.MessageThreadId : undefined),
    messageId:
      ctx?.MessageSidFull ||
      ctx?.MessageSid ||
      ctx?.MessageSidFirst ||
      ctx?.MessageSidLast ||
      undefined,
    timestamp:
      typeof ctx?.Timestamp === "number" && Number.isFinite(ctx.Timestamp)
        ? ctx.Timestamp
        : undefined,
    surface: ctx?.Surface,
    provider: ctx?.Provider,
    mediaPaths: Array.isArray(ctx?.MediaPaths) ? ctx.MediaPaths : [],
    configPath,
    genesisStateDir: stateDir,
  };

  const env = buildSandboxEnvForPlugin(stateDir, configPath);
  const limits = DEFAULT_RESOURCE_LIMITS;
  const replyScript = path.join(scriptDir, "scripts", "qqbot-genesis-reply.mjs");

  try {
    const stdout = execFileSync("node", [replyScript], {
      input: JSON.stringify(input),
      encoding: "utf8",
      maxBuffer: limits.maxBufferBytes,
      timeout: limits.timeoutMs,
      env,
    });

    const parsed = JSON.parse(stdout);
    if (parsed?.ok && parsed?.payload && typeof parsed.payload === "object") {
      return parsed.payload;
    }
    return { text: "Genesis 通道已接入，但这条消息还没有形成可返回结果。" };
  } catch (error) {
    return {
      text: `Genesis 通道已接入，但处理未完成：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Plugin 只注册 before_dispatch（唯一 hook 点）
// ═══════════════════════════════════════════════════════════════════════════════

const plugin = {
  id: "openclaw-genesis",
  name: "OpenClaw Genesis Plugin",
  version: "1.1.0",
  description:
    "Routes genesis account messages to isolated colony process. " +
    "Sets OPENCLAW_GENESIS_PLUGIN_ACTIVE mutex to prevent dispatch patch double-hit.",
  status: "loaded",

  before_dispatch: {
    // priority = 0 是最高优先级（OpenClaw hook 按 priority 升序执行）
    priority: 0,

    async handler(event, context) {
      // 非 genesis 账户 → 零开销放行
      if (!isGenesisAccount(context.accountId)) {
        return { handled: false };
      }

      // genesis 账户 → 拦截并处理
      const reply = dispatchGenesisReply(event);
      if (!reply?.text) {
        // 没有有效回复 → 放行给正常流水线（不应发生）
        return { handled: false };
      }

      return {
        handled: true,
        text: reply.text,
      };
    },
  },
};

export default plugin;
