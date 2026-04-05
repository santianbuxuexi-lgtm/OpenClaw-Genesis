import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const STATE_DIR =
  process.env.OPENCLAW_GENESIS_STATE_DIR?.trim() ||
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  "/root/.openclaw-genesis";
const GENESIS_DIR = path.join(STATE_DIR, "genesis");
const GENESIS_APP_DIR = process.env.OPENCLAW_GENESIS_SCRIPT_DIR?.trim() || "/opt/openclaw-genesis";
const GENESIS_TASK_CONFIG_PATH =
  process.env.OPENCLAW_GENESIS_TASK_CONFIG_PATH?.trim() ||
  path.join(STATE_DIR, "genesis-task-config.json");
const GENESIS_GATEWAY_CONFIG_PATH = path.join(STATE_DIR, "openclaw.json");
const ENTRY_AGENT = "negotiator";
const ENTRY_SESSION = "agent:negotiator:main";
const FOUNDER_IDS = ["negotiator", "builder", "creator", "auditor", "scout"];

function readStdinJson() {
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

function normalize(text) {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function resolveBuiltinQueryKind(body) {
  const text = normalize(body);
  if (!text) {
    return "greeting";
  }
  const greetingTokens = new Set([
    "hi",
    "hello",
    "你好",
    "在吗",
    "在么",
    "在不在",
  ]);
  if (greetingTokens.has(text)) {
    return "greeting";
  }
  if (!text.startsWith("/")) {
    if (
      text.includes("超能力") ||
      text.includes("特长") ||
      text.includes("擅长什么") ||
      text.includes("能做什么")
    ) {
      return "capability";
    }
    if (
      text.includes("多少agent") ||
      text.includes("多少founder") ||
      text.includes("多少成员") ||
      text.includes("有多少agent") ||
      text.includes("有多少founder") ||
      text.includes("有多少成员") ||
      text.includes("为什么没有复制") ||
      text.includes("为什么没有繁衍") ||
      text.includes("复制到多少") ||
      text.includes("繁衍到多少")
    ) {
      return "status";
    }
    return null;
  }
  const statusCommands = new Set([
    "/progress",
    "/status",
    "/genesis",
    "/genesisstatus",
    "/genesis/status",
  ]);
  if (statusCommands.has(text)) {
    return "status";
  }
  const capabilityCommands = new Set([
    "/capability",
    "/genesiscapability",
    "/genesis/capability",
  ]);
  if (capabilityCommands.has(text)) {
    return "capability";
  }
  return null;
}

function buildGreetingReply() {
  return [
    "Genesis 在，通道正常。",
    "你可以直接给任务，我会走 founder 协作给出结果；如果你要看状态，用 `/progress`。",
  ].join("\n");
}

function getLatestFounderPlan(dispatch) {
  const activePlans = Array.isArray(dispatch?.activePlans) ? dispatch.activePlans : [];
  return (
    [...activePlans]
      .filter((plan) => FOUNDER_IDS.includes(String(plan?.primaryAgentId ?? "").trim()))
      .sort((a, b) => Number(b?.updatedAt ?? 0) - Number(a?.updatedAt ?? 0))[0] ?? null
  );
}

function getSupportList(dispatch, plan) {
  if (!plan) return [];
  const queue = Array.isArray(dispatch?.coordinationQueue) ? dispatch.coordinationQueue : [];
  return [
    ...new Set(
      queue
        .filter((entry) => entry?.primarySessionKey === plan.primarySessionKey)
        .map((entry) => String(entry?.agentId ?? "").trim())
        .filter((agentId) => FOUNDER_IDS.includes(agentId) && agentId !== plan.primaryAgentId),
    ),
  ];
}

function buildStatusReply() {
  const lineageFile = readJsonFile(path.join(GENESIS_DIR, "lineage-summary.json"), {});
  const lineage = lineageFile?.vitalitySummary ?? lineageFile ?? {};
  const proactive = readJsonFile(path.join(GENESIS_DIR, "proactive-work-summary.json"), {});
  const dispatch = readJsonFile(path.join(GENESIS_DIR, "dispatch-summary.json"), {});
  const latestPlan = getLatestFounderPlan(dispatch);
  const support = getSupportList(dispatch, latestPlan);

  const currentWork =
    Array.isArray(proactive?.recentEntries) && proactive.recentEntries.length > 0
      ? proactive.recentEntries
          .filter((entry) => entry.status !== "completed")
          .slice(0, 2)
          .map((entry) => {
            const owner = entry.founderOrigin?.trim() || entry.founderId?.trim() || "unknown";
            return `${owner}${entry.platform ? ` [${entry.platform}]` : ""}：${entry.task}`;
          })
          .join("\n")
      : "当前还没有明确在推进的公开任务。";

  const publicOutput =
    Array.isArray(proactive?.recentEntries) && proactive.recentEntries.length > 0
      ? proactive.recentEntries
          .filter((entry) => entry.status === "completed" && entry.workType === "external_publish")
          .slice(0, 1)
          .map((entry) => `${entry.platform ?? "unknown"}：${entry.contentPreview ?? entry.task}`)
          .join("\n")
      : "最近还没有新的公开成果。";

  return [
    "Genesis 现在在线，我按独立状态目录里的 live 数据告诉你。",
    `当前总成员 ${lineage.lineageCount ?? 0}，其中 founder 角色 5 个，child ${lineage.childLineageCount ?? 0}，二代 ${lineage.secondGenerationChildCount ?? 0}，三代 ${lineage.thirdGenerationChildCount ?? 0}。`,
    latestPlan
      ? `当前已形成 founder 协作：${latestPlan.primaryAgentId} 牵头，协作成员 ${support.length > 0 ? support.join("、") : "暂未形成"}。`
      : "当前还没有形成稳定的 founder 协作调度。",
    `眼下最明显的工作：\n${currentWork}`,
    `最近公开成果：\n${publicOutput}`,
  ].join("\n\n");
}

function buildCapabilityReply() {
  return [
    "如果你问的是 Genesis 的「超能力」和「特长」，我们现在的分工是这样：",
    "· negotiator：负责接单、协调 founder，把任务变成可执行的推进路线。",
    "· scout：擅长搜索、跟踪热点、拉取信号和情报线索。",
    "· creator：擅长把信息变成内容，包括评论、摘要、微博/微头条等外发文案。",
    "· auditor：负责核对、检查风险、压低胡说和重复输出。",
    "· builder：负责补 skill、补工具、打通接口和维护运行链路。",
    "",
    "对外看，Genesis 现在最强的几类能力是：",
    "· 热点搜索与汇总",
    "· 任务协调与 founder 分工",
    "· 内容组织和对外输出",
    "· 运行状态和繁衍/扩张视图",
    "",
    "你要是愿意，我可以直接按这些能力替你分工干活，而不只是解释给你听。",
  ].join("\n");
}

function appendInboxEvent(input) {
  fs.mkdirSync(GENESIS_DIR, { recursive: true });
  const inboxPath = path.join(GENESIS_DIR, "channel-inbox.jsonl");
  const record = {
    ts: Date.now(),
    source: "qqbot:genesis",
    body: input.body ?? "",
    sessionKey: input.sessionKey ?? null,
    accountId: input.accountId ?? "genesis",
    senderLabel: input.senderLabel ?? null,
    senderId: input.senderId ?? null,
    threadLabel: input.threadLabel ?? null,
    messageThreadId: input.messageThreadId ?? null,
    messageId: input.messageId ?? null,
    requestId: input.requestId ?? null,
  };
  fs.appendFileSync(inboxPath, `${JSON.stringify(record)}\n`, "utf8");
}

function normalizeDeliverTarget(senderId) {
  if (typeof senderId !== "string") {
    return null;
  }
  const trimmed = senderId.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("qqbot:")) {
    return trimmed;
  }
  return `qqbot:c2c:${trimmed}`;
}

function buildAcceptedReply() {
  return "Genesis 已接单，正在调动 founder 协作处理；最终结果会作为下一条消息发回。";
}

function launchDetachedTask(input) {
  const deliverTo = normalizeDeliverTarget(input.senderId);
  if (!deliverTo) {
    throw new Error("Genesis 独立通道缺少可回写的 QQ senderId");
  }

  const requestId = `genesis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logPath = path.join(GENESIS_DIR, "channel-worker.log");
  fs.mkdirSync(GENESIS_DIR, { recursive: true });
  appendInboxEvent({ ...input, requestId });

  const logFd = fs.openSync(logPath, "a");
  const child = spawn(
    "./node_modules/.bin/tsx",
    [
      "scripts/genesis-run-task.ts",
      "--state-dir",
      STATE_DIR,
      "--channel",
      "qqbot:genesis",
      "--account",
      input.accountId ?? "genesis",
      "--agent",
      ENTRY_AGENT,
      "--session",
      ENTRY_SESSION,
      "--thread",
      input.sessionKey?.trim() || `qqbot:genesis:${Date.now()}`,
      "--candidates",
      FOUNDER_IDS.join(","),
      "--message",
      input.body ?? "",
      "--request",
      requestId,
      "--deliver-channel",
      "qqbot",
      "--deliver-to",
      deliverTo,
      "--deliver-account",
      input.accountId ?? "genesis",
      "--deliver-session",
      input.sessionKey?.trim() || ENTRY_SESSION,
    ],
    {
      cwd: GENESIS_APP_DIR,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        HOME: STATE_DIR,
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS?.trim(),
          "--max-old-space-size=4096",
        ]
          .filter(Boolean)
          .join(" "),
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_GENESIS_STATE_DIR: STATE_DIR,
        OPENCLAW_CONFIG_PATH: GENESIS_TASK_CONFIG_PATH,
        OPENCLAW_DELIVERY_CONFIG_PATH: GENESIS_GATEWAY_CONFIG_PATH,
      },
    },
  );
  child.unref();
  fs.closeSync(logFd);
}

function runTask(input) {
  const output = execFileSync(
    "./node_modules/.bin/tsx",
    [
      "scripts/genesis-run-task.ts",
      "--state-dir",
      STATE_DIR,
      "--channel",
      "qqbot:genesis",
      "--account",
      input.accountId ?? "genesis",
      "--agent",
      ENTRY_AGENT,
      "--session",
      ENTRY_SESSION,
      "--thread",
      input.sessionKey?.trim() || `qqbot:genesis:${Date.now()}`,
      "--candidates",
      FOUNDER_IDS.join(","),
      "--message",
      input.body ?? "",
    ],
    {
      cwd: GENESIS_APP_DIR,
      encoding: "utf8",
      timeout: 180000,
      env: {
        ...process.env,
        HOME: STATE_DIR,
        NODE_OPTIONS: [
          process.env.NODE_OPTIONS?.trim(),
          "--max-old-space-size=4096",
        ]
          .filter(Boolean)
          .join(" "),
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_GENESIS_STATE_DIR: STATE_DIR,
        OPENCLAW_CONFIG_PATH: GENESIS_TASK_CONFIG_PATH,
      },
    },
  );
  return extractTrailingJson(output);
}

function extractTrailingJson(raw) {
  const text = raw.trim();
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    try {
      return extractBalancedJson(text.slice(start));
    } catch {
      continue;
    }
  }
  throw new Error("No valid JSON payload found in Genesis task output");
}

function extractBalancedJson(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(0, index + 1));
      }
    }
  }
  throw new Error("Could not parse balanced JSON payload");
}

function buildTaskReply(result) {
  return result?.payload?.text?.trim() || "Genesis 已收到任务，但这一轮没有形成可见回复。";
}

function buildTaskFailure(input, error) {
  appendInboxEvent(input);
  const message = error instanceof Error ? error.message : String(error);
  return [
    "这轮没有顺利跑通，我还没拿到可以直接给你的结果。",
    `错误: ${message}`,
  ].join("\n");
}

function main() {
  const input = readStdinJson();
  const body = input.body?.trim() || "";
  const builtinKind = resolveBuiltinQueryKind(body);

  if (builtinKind === "capability") {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "status",
        payload: { text: buildCapabilityReply() },
      }),
    );
    return;
  }

  if (builtinKind === "status") {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "status",
        payload: { text: buildStatusReply() },
      }),
    );
    return;
  }

  if (builtinKind === "greeting") {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "greeting",
        payload: { text: buildGreetingReply() },
      }),
    );
    return;
  }

  if (normalizeDeliverTarget(input.senderId)) {
    try {
      launchDetachedTask(input);
      process.stdout.write(
        JSON.stringify({
          ok: true,
          kind: "task-accepted",
          payload: { text: buildAcceptedReply() },
        }),
      );
      return;
    } catch {
      // Fall through to the synchronous path if detached execution cannot be scheduled.
    }
  }

  try {
    const result = runTask(input);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "task",
        payload: { text: buildTaskReply(result) },
      }),
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "task-fallback",
        payload: { text: buildTaskFailure(input, error) },
      }),
    );
  }
}

main();
