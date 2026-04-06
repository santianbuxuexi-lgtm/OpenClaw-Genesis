#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const GENESIS_FOUNDER_CANDIDATES = ["negotiator", "builder", "creator", "auditor", "scout"];
const GENESIS_ENTRY_AGENT = "negotiator";
const GENESIS_ENTRY_SESSION = "agent:negotiator:main";

const TASK_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function readJsonStdin() {
  const raw = fs.readFileSync(0, "utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function compact(text) {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function resolveBuiltinQueryKind(body) {
  const normalized = compact(body);
  if (!normalized) return "greeting";

  const greetingTokens = new Set(["hi", "hello", "你好", "在吗", "在么"]);
  if (greetingTokens.has(normalized)) return "greeting";

  if (!normalized.startsWith("/")) {
    if (
      normalized.includes("超能力") ||
      normalized.includes("特长") ||
      normalized.includes("擅长什么") ||
      normalized.includes("能做什么")
    ) {
      return "capability";
    }
    if (
      normalized.includes("多少agent") ||
      normalized.includes("多少founder") ||
      normalized.includes("多少成员") ||
      normalized.includes("有多少agent") ||
      normalized.includes("有多少founder") ||
      normalized.includes("有多少成员") ||
      normalized.includes("复制到多少") ||
      normalized.includes("繁衍到多少")
    ) {
      return "status";
    }
    return null;
  }

  const statusCommands = new Set(["/progress", "/status", "/genesis", "/genesisstatus", "/genesis/status"]);
  if (statusCommands.has(normalized)) return "status";
  const capabilityCommands = new Set(["/capability", "/genesiscapability", "/genesis/capability"]);
  if (capabilityCommands.has(normalized)) return "capability";
  return null;
}

function appendInboxEvent(input) {
  const stateDir = input.genesisStateDir || process.env.OPENCLAW_GENESIS_STATE_DIR || "/root/.openclaw-genesis";
  const genesisDir = path.join(stateDir, "genesis");
  fs.mkdirSync(genesisDir, { recursive: true });
  const inboxPath = path.join(genesisDir, "channel-inbox.jsonl");
  const event = {
    ts: Date.now(),
    source: "qqbot:genesis",
    body: input.body ?? "",
    sessionKey: input.sessionKey ?? null,
    accountId: input.accountId ?? "genesis",
    senderLabel: input.senderLabel ?? null,
    threadLabel: input.threadLabel ?? null,
    messageId: input.messageId ?? null,
  };
  fs.appendFileSync(inboxPath, `${JSON.stringify(event)}\n`, "utf8");
}

function buildNaturalStatusReply(input) {
  const stateDir = input.genesisStateDir || process.env.OPENCLAW_GENESIS_STATE_DIR || "/root/.openclaw-genesis";
  const genesisDir = path.join(stateDir, "genesis");
  const lineage = readJsonFile(path.join(genesisDir, "lineage-summary.json"), {});
  const proactive = readJsonFile(path.join(genesisDir, "proactive-work-summary.json"), {});
  const dispatch = readJsonFile(path.join(genesisDir, "dispatch-summary.json"), {});

  const activePlans = Array.isArray(dispatch?.activePlans) ? dispatch.activePlans : [];
  const latestPlan = [...activePlans].sort((a, b) => Number(b?.updatedAt ?? 0) - Number(a?.updatedAt ?? 0))[0];
  const lead = latestPlan?.primaryAgentId ?? "none";

  const recentEntries = Array.isArray(proactive?.recentEntries) ? proactive.recentEntries : [];
  const currentWork = recentEntries
    .filter((entry) => entry?.status !== "completed")
    .slice(0, 2)
    .map((entry) => {
      const founder = entry?.founderOrigin || entry?.founderId || "unknown";
      const task = entry?.task || "未命名任务";
      return `${founder}: ${task}`;
    });

  const recentOutput = recentEntries
    .filter((entry) => entry?.status === "completed" && entry?.workType === "external_publish")
    .slice(0, 2)
    .map((entry) => {
      const platform = entry?.platform || "unknown";
      const preview = entry?.contentPreview || entry?.task || "无摘要";
      return `${platform}: ${preview}`;
    });

  return [
    "Genesis 已接管会话（独立通道）。",
    `当前成员=${lineage.lineageCount ?? 0}（founder=5, child=${lineage.childLineageCount ?? 0}, 二代=${lineage.secondGenerationChildCount ?? 0}, 三代=${lineage.thirdGenerationChildCount ?? 0}）`,
    `当前调度牵头=${lead}`,
    `当前工作=${currentWork.length > 0 ? currentWork.join(" | ") : "none"}`,
    `公开成果=${recentOutput.length > 0 ? recentOutput.join(" | ") : "none"}`,
  ].join("\n");
}

function buildCapabilityReply() {
  return [
    "Genesis founder 协作分工：",
    "negotiator: 任务编排、资源分配、冲突解算",
    "scout: 搜索、热点跟踪、外部信号收集",
    "creator: 内容生产、评论体表达、外发文案",
    "auditor: 风险审计、去重、合规检查",
    "builder: 工具链建设、执行链打通、系统修复",
  ].join("\n");
}

function buildGreetingReply() {
  return [
    "Genesis 通道在线。",
    "你可以直接下任务，我会返回执行结果；查状态可用 /progress。",
  ].join("\n");
}

function extractJsonObject(raw) {
  const text = String(raw ?? "");
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const ch = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("Task output does not contain valid JSON");
}

function shouldRetryWithNextInvoker(error) {
  const code = String(error?.code ?? "");
  const stderr = String(error?.stderr ?? "");
  const stdout = String(error?.stdout ?? "");
  const message = `${error?.message ?? String(error)}\n${stderr}\n${stdout}`;
  if (code === "ENOENT" || message.includes("ENOENT")) return true;
  if (message.includes('Command "tsx" not found')) return true;
  return false;
}

function runWithInvokers(invokers, taskArgs, options) {
  const failures = [];
  for (const invoker of invokers) {
    try {
      return execFileSync(invoker.cmd, [...invoker.prefixArgs, ...taskArgs], options);
    } catch (error) {
      failures.push(`${invoker.cmd}: ${error instanceof Error ? error.message : String(error)}`);
      if (shouldRetryWithNextInvoker(error)) continue;
      throw error;
    }
  }
  throw new Error(`No valid task invoker available. tried=${failures.join(" | ")}`);
}

function isTaskAppDirReady(appDir) {
  if (!fs.existsSync(path.join(appDir, "scripts", "genesis-run-task.ts"))) {
    return false;
  }
  const hasAgentCommandTs = fs.existsSync(path.join(appDir, "src", "agents", "agent-command.ts"));
  const hasAgentCommandJs = fs.existsSync(path.join(appDir, "src", "agents", "agent-command.js"));
  return hasAgentCommandTs || hasAgentCommandJs;
}

function resolveTaskAppDir(configuredAppDir) {
  const candidates = [configuredAppDir, "/opt/openclaw.prev", "/opt/openclaw"];
  for (const candidate of candidates) {
    if (candidate && isTaskAppDirReady(candidate)) {
      return candidate;
    }
  }
  return configuredAppDir;
}

function buildCompatConfigPathIfNeeded(configPath, appDir) {
  if (appDir !== "/opt/openclaw.prev") {
    return configPath;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (cfg && typeof cfg === "object" && cfg.channels && typeof cfg.channels === "object") {
      delete cfg.channels.qqbot;
    }
    if (cfg && typeof cfg === "object" && cfg.plugins && typeof cfg.plugins === "object") {
      if (cfg.plugins.entries && typeof cfg.plugins.entries === "object") {
        delete cfg.plugins.entries.qqbot;
      }
      if (Array.isArray(cfg.plugins.allow)) {
        cfg.plugins.allow = cfg.plugins.allow.filter((item) => String(item ?? "").trim() !== "qqbot");
      }
    }
    const compatPath = `/tmp/openclaw.genesis.compat.${process.pid}.json`;
    fs.writeFileSync(compatPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return compatPath;
  } catch {
    return configPath;
  }
}

function buildTaskEnv(input, appDir) {
  const stateDir = input.genesisStateDir || process.env.OPENCLAW_GENESIS_STATE_DIR || "/root/.openclaw-genesis";
  const configPathRaw = input.configPath || process.env.OPENCLAW_CONFIG_PATH || path.join(stateDir, "openclaw.json");
  const configPath = buildCompatConfigPathIfNeeded(configPathRaw, appDir);
  return {
    ...process.env,
    HOME: stateDir,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_GENESIS_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GENESIS_APP_DIR: appDir,
  };
}

function runGenesisTaskViaScript(input) {
  const stateDir = input.genesisStateDir || process.env.OPENCLAW_GENESIS_STATE_DIR || "/root/.openclaw-genesis";
  const configuredAppDir = process.env.OPENCLAW_GENESIS_SCRIPT_DIR || "/opt/openclaw-genesis";
  const appDir = resolveTaskAppDir(configuredAppDir);
  const sourceSessionKey = input.sessionKey?.trim() || `agent:genesis:qq:${Date.now()}`;
  const localTsx = path.join(appDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

  const taskArgs = [
    "scripts/genesis-run-task.ts",
    "--state-dir",
    stateDir,
    "--channel",
    "qqbot:genesis",
    "--account",
    input.accountId ?? "genesis",
    "--agent",
    GENESIS_ENTRY_AGENT,
    "--session",
    GENESIS_ENTRY_SESSION,
    "--thread",
    sourceSessionKey,
    "--candidates",
    GENESIS_FOUNDER_CANDIDATES.join(","),
    "--message",
    input.body ?? "",
  ];

  const invokers = [];
  if (fs.existsSync(localTsx)) invokers.push({ cmd: localTsx, prefixArgs: [] });
  invokers.push({ cmd: "pnpm", prefixArgs: ["tsx"] });
  invokers.push({ cmd: "npx", prefixArgs: ["-y", "tsx"] });

  const output = runWithInvokers(invokers, taskArgs, {
    cwd: appDir,
    encoding: "utf8",
    timeout: TASK_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: buildTaskEnv(input, appDir),
  });

  const parsed = extractJsonObject(output);
  const text = parsed?.payload?.text ?? parsed?.text;
  if (typeof text === "string" && text.trim()) {
    return text.trim();
  }

  if (typeof output === "string" && output.trim()) {
    return output.trim();
  }
  return "Genesis 任务已执行，但没有形成可返回文本。";
}

function deriveSyntheticTarget(input) {
  const raw = String(input?.senderId ?? input?.sessionKey ?? input?.accountId ?? "").replace(/\D/g, "");
  const padded = raw.length >= 11 ? raw : raw.padStart(11, "0");
  return `+86${padded.slice(-11) || "13700000000"}`;
}

function buildAgentPrompt(body) {
  return [
    body || "请给出可执行答案。",
    "",
    "[Genesis协作执行要求]",
    "1) 直接回答问题，先给结果，不要讲路由、接单、协调流程。",
    "2) 内容要具体可执行，必要时给下一步动作。",
    "3) 语气自然，避免模板化复述。",
  ].join("\n");
}

function buildCliConfigPath(configPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (cfg && typeof cfg === "object" && cfg.plugins && typeof cfg.plugins === "object") {
      if (cfg.plugins.entries && typeof cfg.plugins.entries === "object") {
        delete cfg.plugins.entries["openclaw-genesis"];
      }
      if (Array.isArray(cfg.plugins.allow)) {
        cfg.plugins.allow = cfg.plugins.allow.filter((item) => String(item ?? "").trim() !== "openclaw-genesis");
      }
    }
    const compatPath = `/tmp/openclaw.genesis.cli.compat.${process.pid}.json`;
    fs.writeFileSync(compatPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return compatPath;
  } catch {
    return configPath;
  }
}

function resolveAgentCliPath() {
  const candidates = ["/opt/openclaw/openclaw.mjs", "/opt/openclaw.prev/openclaw.mjs"];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "/opt/openclaw/openclaw.mjs";
}

function runGenesisTaskViaCli(input) {
  const stateDir = input.genesisStateDir || process.env.OPENCLAW_GENESIS_STATE_DIR || "/root/.openclaw-genesis";
  const configPathRaw = input.configPath || process.env.OPENCLAW_CONFIG_PATH || path.join(stateDir, "openclaw.json");
  const configPath = buildCliConfigPath(configPathRaw);
  const cliPath = resolveAgentCliPath();
  const target = deriveSyntheticTarget(input);
  const command = [
    cliPath,
    "agent",
    "--local",
    "--to",
    target,
    "--message",
    buildAgentPrompt(input.body ?? ""),
    "--json",
  ];

  const runOptions = {
    encoding: "utf8",
    timeout: TASK_TIMEOUT_MS,
    killSignal: "SIGKILL",
    maxBuffer: MAX_OUTPUT_BYTES,
    env: {
      ...process.env,
      HOME: stateDir,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_GENESIS_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_GENESIS_PLUGIN_ACTIVE: "1",
    },
  };
  let parsed;
  try {
    const output = execFileSync("node", command, runOptions);
    parsed = extractJsonObject(output);
  } catch (error) {
    const recovered = error?.stdout ? String(error.stdout) : "";
    if (recovered.trim()) {
      try {
        parsed = extractJsonObject(recovered);
      } catch {
        throw error;
      }
    } else {
      throw error;
    }
  }

  const payloads = Array.isArray(parsed?.payloads) ? parsed.payloads : [];
  const text = payloads
    .map((payload) => (typeof payload?.text === "string" ? payload.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (text) {
    return text;
  }
  if (typeof parsed?.payload?.text === "string" && parsed.payload.text.trim()) {
    return parsed.payload.text.trim();
  }
  throw new Error("CLI returned no text payload");
}

function runGenesisTask(input) {
  return runGenesisTaskViaCli(input);
}

function buildTaskFailureText(input, error) {
  appendInboxEvent(input);
  const raw = error instanceof Error ? error.message : String(error);
  const timeoutLike = /timed out|ETIMEDOUT|spawnSync/i.test(raw);
  const message = timeoutLike
    ? "模型链路超时（60s），任务已写入 Genesis inbox，可立即重试或切换模型。"
    : raw.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" | ");
  return [
    "Genesis 已收到这条消息，但这轮任务执行没有跑通。",
    "我先把消息写进了 Genesis inbox，不假装已经完成。",
    `错误: ${message}`,
  ].join("\n");
}

function main() {
  const input = readJsonStdin();
  const body = input.body?.trim() || "";
  const builtinKind = resolveBuiltinQueryKind(body);

  if (builtinKind === "status") {
    process.stdout.write(JSON.stringify({ ok: true, payload: { text: buildNaturalStatusReply(input) }, kind: "status" }));
    return;
  }
  if (builtinKind === "capability") {
    process.stdout.write(JSON.stringify({ ok: true, payload: { text: buildCapabilityReply() }, kind: "capability" }));
    return;
  }
  if (builtinKind === "greeting") {
    process.stdout.write(JSON.stringify({ ok: true, payload: { text: buildGreetingReply() }, kind: "greeting" }));
    return;
  }

  try {
    const text = runGenesisTask(input);
    process.stdout.write(JSON.stringify({ ok: true, payload: { text }, kind: "task" }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: true, payload: { text: buildTaskFailureText(input, error) }, kind: "task-fallback" }));
  }
}

main();
