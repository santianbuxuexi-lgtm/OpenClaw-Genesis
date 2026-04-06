/**
 * Genesis QQ Router — 通过 OpenClaw Plugin Hook 接入，dispatch patch 兜底。
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 互斥保证（防双命中）                                    │
 * │                                                         │
 * │ plugin 启动时设置环境变量：                              │
 * │   OPENCLAW_GENESIS_PLUGIN_ACTIVE = "1"                  │
 * │                                                         │
 * │ dispatch patch 检测到该变量 → 直接跳过，不执行。        │
 * │                                                         │
 * │ 这确保 plugin 和 patch 不会同时处理同一条消息。         │
 * └─────────────────────────────────────────────────────────┘
 */

import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { buildGenesisEnv, resolveGenesisPaths, DEFAULT_RESOURCE_LIMITS } from "./genesis-env-sandbox.mjs";

/**
 * 互斥信号：plugin 启动时设为 "1"，dispatch patch 读到则跳过。
 * 这是跨模块的确定性信号，不依赖 hookRunner.hasHooks() 的运行时状态。
 */
export const GENESIS_MUTEX_ENV_KEY = "OPENCLAW_GENESIS_PLUGIN_ACTIVE";
const GENESIS_DEDICATED_ENV_KEY = "OPENCLAW_GENESIS_DEDICATED";

const GENESIS_ACCOUNT_ID = "genesis";

function isGenesisAccount(value) {
  return typeof value === "string" && value.trim().toLowerCase() === GENESIS_ACCOUNT_ID;
}

function isGenesisDedicatedMode() {
  return process.env[GENESIS_DEDICATED_ENV_KEY] === "1";
}

function shouldHandleGenesisMessage(ctx) {
  if (isGenesisDedicatedMode()) {
    return true;
  }
  return isGenesisAccount(ctx?.AccountId);
}

function extractBody(ctx) {
  return (
    ctx?.BodyForCommands?.trim() ||
    ctx?.CommandBody?.trim() ||
    ctx?.Body?.trim() ||
    ""
  );
}

function buildGenesisInput(ctx) {
  const { stateDir, configPath, scriptDir } = resolveGenesisPaths();
  return {
    body: extractBody(ctx),
    sessionKey: ctx?.SessionKey,
    accountId: ctx?.AccountId,
    senderLabel:
      ctx?.SenderName?.trim() ||
      ctx?.SenderUsername?.trim() ||
      undefined,
    senderId:
      typeof ctx?.SenderId === "string" && ctx.SenderId.trim()
        ? ctx.SenderId.trim()
        : undefined,
    threadLabel:
      ctx?.ThreadLabel?.trim() ||
      (typeof ctx?.MessageThreadId === "string" ? ctx.MessageThreadId : undefined),
    messageThreadId:
      ctx?.MessageThreadId != null ? String(ctx.MessageThreadId) : undefined,
    replyToId:
      typeof ctx?.ReplyToId === "string" && ctx.ReplyToId.trim()
        ? ctx.ReplyToId.trim()
        : undefined,
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
}

/**
 * 同步执行 Genesis 回复脚本（dispatch patch 用）
 */
function callGenesisReplySync(input) {
  const { scriptDir } = resolveGenesisPaths();
  const replyScript = path.join(scriptDir, "scripts", "qqbot-genesis-reply.mjs");
  const env = buildGenesisEnv();
  const limits = DEFAULT_RESOURCE_LIMITS;

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
}

/**
 * 异步执行 Genesis 回复脚本（plugin hook 用）
 */
function callGenesisReplyAsync(input) {
  const { scriptDir } = resolveGenesisPaths();
  const replyScript = path.join(scriptDir, "scripts", "qqbot-genesis-reply.mjs");
  const env = buildGenesisEnv();
  const limits = DEFAULT_RESOURCE_LIMITS;

  return new Promise((resolve) => {
    const child = spawn("node", [replyScript], { env, stdio: ["pipe", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ text: "Genesis 处理超时，已终止。任务已记录。" });
    }, limits.timeoutMs);

    let stdout = "";
    let stderr = "";

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    child.stdout.on("data", (data) => {
      stdout += data;
      if (Buffer.byteLength(stdout, "utf8") > limits.maxBufferBytes) {
        child.kill("SIGKILL");
        clearTimeout(timer);
        resolve({ text: "Genesis 输出过大，已截断。" });
      }
    });

    child.stderr.on("data", (data) => { stderr += data; });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        resolve({ text: `Genesis 处理异常 (exit ${code})：${stderr.slice(0, 200) || "无错误详情"}` });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed?.ok && parsed?.payload && typeof parsed.payload === "object") {
          resolve(parsed.payload);
        } else {
          resolve({ text: "Genesis 通道已接入，但这条消息还没有形成可返回结果。" });
        }
      } catch {
        resolve({ text: "Genesis 返回格式异常，任务已记录。" });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ text: `Genesis 启动失败：${err.message}` });
    });
  });
}

/**
 * dispatch patch 兼容入口 — 同步，返回 null 或 reply payload。
 *
 * 关键：如果检测到 OPENCLAW_GENESIS_PLUGIN_ACTIVE=1（plugin 已加载），
 * 立即返回 null，让 plugin 处理。绝不双命中。
 */
export function runGenesisDedicatedAccountReply(params) {
  // ── 互斥检查：plugin 活跃时，patch 必须让路 ──
  if (process.env[GENESIS_MUTEX_ENV_KEY] === "1") {
    return null;
  }

  if (!shouldHandleGenesisMessage(params?.ctx)) {
    return null;
  }

  try {
    return callGenesisReplySync(buildGenesisInput(params.ctx));
  } catch (error) {
    return {
      text: `Genesis 通道已接入，但处理未完成：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * plugin hook 入口 — 异步，返回 null 或 reply payload。
 *
 * plugin 加载时会在 process.env 上设置互斥信号，
 * 这样 dispatch patch 检测到后绝对不会重复执行。
 */
export async function handleGenesisMessage(ctx) {
  if (!shouldHandleGenesisMessage(ctx)) {
    return null;
  }
  return callGenesisReplyAsync(buildGenesisInput(ctx));
}
