import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const STATE_DIR = "/root/.openclaw-genesis";
const GENESIS_DIR = path.join(STATE_DIR, "genesis");
const GENESIS_APP_DIR = "/opt/openclaw-genesis";
const ENTRY_AGENT = "negotiator";
const ENTRY_SESSION = "agent:negotiator:main";
const FOUNDER_IDS = ["negotiator", "builder", "creator", "auditor", "scout"];

function zh(text) {
  return text;
}

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

function looksLikeStatusQuery(body) {
  const text = normalize(body);
  const tokens = [
    "founder",
    "\u6210\u5458",
    "\u590d\u5236",
    "\u7e41\u884d",
    "\u751f\u6001",
    "\u56e2\u961f",
    "\u72b6\u6001",
    "\u72b6\u51b5",
    "\u8c01\u5728\u5de5\u4f5c",
    "\u591a\u5c11agent",
    "\u591a\u5c11\u6210\u5458",
    "\u591a\u5c11founder",
    "progress",
  ];
  return body.startsWith("/") || tokens.some((token) => text.includes(token));
}

function looksLikeCapabilityQuery(body) {
  const text = normalize(body);
  return (
    text.includes("\u8d85\u80fd\u529b") ||
    text.includes("\u7279\u957f") ||
    text.includes("\u64c5\u957f\u4ec0\u4e48") ||
    text.includes("\u80fd\u505a\u4ec0\u4e48")
  );
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
            return `${owner}${entry.platform ? ` [${entry.platform}]` : ""}\uff1a${entry.task}`;
          })
          .join("\n")
      : zh("\u5f53\u524d\u8fd8\u6ca1\u6709\u660e\u786e\u5728\u63a8\u8fdb\u7684\u516c\u5f00\u4efb\u52a1\u3002");

  const publicOutput =
    Array.isArray(proactive?.recentEntries) && proactive.recentEntries.length > 0
      ? proactive.recentEntries
          .filter((entry) => entry.status === "completed" && entry.workType === "external_publish")
          .slice(0, 1)
          .map((entry) => `${entry.platform ?? "unknown"}\uff1a${entry.contentPreview ?? entry.task}`)
          .join("\n")
      : zh("\u6700\u8fd1\u8fd8\u6ca1\u6709\u65b0\u7684\u516c\u5f00\u6210\u679c\u3002");

  return [
    zh("Genesis \u73b0\u5728\u5728\u7ebf\uff0c\u6211\u6309\u72ec\u7acb\u72b6\u6001\u76ee\u5f55\u91cc\u7684 live \u6570\u636e\u544a\u8bc9\u4f60\u3002"),
    `\u5f53\u524d\u603b\u6210\u5458 ${lineage.lineageCount ?? 0}\uff0c\u5176\u4e2d founder \u89d2\u8272 5 \u4e2a\uff0cchild ${lineage.childLineageCount ?? 0}\uff0c\u4e8c\u4ee3 ${lineage.secondGenerationChildCount ?? 0}\uff0c\u4e09\u4ee3 ${lineage.thirdGenerationChildCount ?? 0}\u3002`,
    latestPlan
      ? `\u5f53\u524d\u5df2\u5f62\u6210 founder \u534f\u4f5c\uff1a${latestPlan.primaryAgentId} \u7275\u5934\uff0c\u534f\u4f5c\u6210\u5458 ${support.length > 0 ? support.join("\u3001") : "\u6682\u672a\u5f62\u6210"}\u3002`
      : zh("\u5f53\u524d\u8fd8\u6ca1\u6709\u5f62\u6210\u7a33\u5b9a\u7684 founder \u534f\u4f5c\u8c03\u5ea6\u3002"),
    `\u773c\u4e0b\u6700\u660e\u663e\u7684\u5de5\u4f5c\uff1a\n${currentWork}`,
    `\u6700\u8fd1\u516c\u5f00\u6210\u679c\uff1a\n${publicOutput}`,
  ].join("\n\n");
}

function buildCapabilityReply() {
  return [
    "\u5982\u679c\u4f60\u95ee\u7684\u662f Genesis \u7684\u300c\u8d85\u80fd\u529b\u300d\u548c\u300c\u7279\u957f\u300d\uff0c\u6211\u4eec\u73b0\u5728\u7684\u5206\u5de5\u662f\u8fd9\u6837\uff1a",
    "\u00b7 negotiator\uff1a\u8d1f\u8d23\u63a5\u5355\u3001\u534f\u8c03 founder\uff0c\u628a\u4efb\u52a1\u53d8\u6210\u53ef\u6267\u884c\u7684\u63a8\u8fdb\u8def\u7ebf\u3002",
    "\u00b7 scout\uff1a\u64c5\u957f\u641c\u7d22\u3001\u8ddf\u8e2a\u70ed\u70b9\u3001\u62c9\u53d6\u4fe1\u53f7\u548c\u60c5\u62a5\u7ebf\u7d22\u3002",
    "\u00b7 creator\uff1a\u64c5\u957f\u628a\u4fe1\u606f\u53d8\u6210\u5185\u5bb9\uff0c\u5305\u62ec\u8bc4\u8bba\u3001\u6458\u8981\u3001\u5fae\u535a/\u5fae\u5934\u6761\u7b49\u5916\u53d1\u6587\u6848\u3002",
    "\u00b7 auditor\uff1a\u8d1f\u8d23\u6838\u5bf9\u3001\u68c0\u67e5\u98ce\u9669\u3001\u538b\u4f4e\u80e1\u8bf4\u548c\u91cd\u590d\u8f93\u51fa\u3002",
    "\u00b7 builder\uff1a\u8d1f\u8d23\u8865 skill\u3001\u8865\u5de5\u5177\u3001\u6253\u901a\u63a5\u53e3\u548c\u7ef4\u62a4\u8fd0\u884c\u94fe\u8def\u3002",
    "",
    "\u5bf9\u5916\u770b\uff0cGenesis \u73b0\u5728\u6700\u5f3a\u7684\u51e0\u7c7b\u80fd\u529b\u662f\uff1a",
    "\u00b7 \u70ed\u70b9\u641c\u7d22\u4e0e\u6c47\u603b",
    "\u00b7 \u4efb\u52a1\u534f\u8c03\u4e0e founder \u5206\u5de5",
    "\u00b7 \u5185\u5bb9\u7ec4\u7ec7\u548c\u5bf9\u5916\u8f93\u51fa",
    "\u00b7 \u8fd0\u884c\u72b6\u6001\u548c\u7e41\u884d/\u6269\u5f20\u89c6\u56fe",
    "",
    "\u4f60\u8981\u662f\u613f\u610f\uff0c\u6211\u53ef\u4ee5\u76f4\u63a5\u6309\u8fd9\u4e9b\u80fd\u529b\u66ff\u4f60\u5206\u5de5\u5e72\u6d3b\uff0c\u800c\u4e0d\u53ea\u662f\u89e3\u91ca\u7ed9\u4f60\u542c\u3002",
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
    threadLabel: input.threadLabel ?? null,
    messageId: input.messageId ?? null,
  };
  fs.appendFileSync(inboxPath, `${JSON.stringify(record)}\n`, "utf8");
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
        OPENCLAW_CONFIG_PATH: "/root/.openclaw-genesis/openclaw.json",
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
  return result?.payload?.text?.trim() || zh("Genesis \u5df2\u6536\u5230\u4efb\u52a1\uff0c\u4f46\u8fd9\u4e00\u8f6e\u6ca1\u6709\u5f62\u6210\u53ef\u89c1\u56de\u590d\u3002");
}

function buildTaskFailure(input, error) {
  appendInboxEvent(input);
  return [
    zh("Genesis \u5df2\u6536\u5230\u8fd9\u6761\u6d88\u606f\uff0c\u4f46\u8fd9\u8f6e\u4efb\u52a1\u6267\u884c\u6ca1\u6709\u8dd1\u901a\u3002"),
    zh("\u6211\u5148\u628a\u6d88\u606f\u5199\u8fdb\u4e86 Genesis inbox\uff0c\u4e0d\u5047\u88c5\u5df2\u7ecf\u5b8c\u6210\u3002"),
    `${zh("\u9519\u8bef")}: ${error instanceof Error ? error.message : String(error)}`,
  ].join("\n");
}

function main() {
  const input = readStdinJson();
  const body = input.body?.trim() || "";

  if (looksLikeCapabilityQuery(body)) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "status",
        payload: { text: buildCapabilityReply() },
      }),
    );
    return;
  }

  if (looksLikeStatusQuery(body)) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        kind: "status",
        payload: { text: buildStatusReply() },
      }),
    );
    return;
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
