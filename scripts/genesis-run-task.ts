import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { agentCommand } from "../src/agents/agent-command.js";
import { registerAgentRunContext } from "../src/infra/agent-events.js";
import { loadConfig } from "../src/config/config.js";
import { normalizeOutboundPayloadsForJson } from "../src/infra/outbound/payloads.js";
import { runGenesisOperatorChannelTurn } from "../src/genesis/kernel/operator-channel.js";
import { resolveGenesisAssignmentSystemPrompt } from "../src/genesis/kernel/workflow.js";
import { resolveGenesisSchedulingFromAssignment } from "../src/genesis/kernel/workflow.js";
import { resolveGenesisStrategicMemoryPromptSync } from "../src/genesis/kernel/strategic-memory.js";
import { readFreshGenesisDispatchAssignmentSync } from "../src/genesis/kernel/state.js";
import type { GenesisOperatorChannelResult } from "../src/genesis/kernel/operator-channel.js";

type Args = {
  stateDir?: string;
  channel: string;
  accountId?: string;
  threadLabel?: string;
  sessionKey: string;
  agentId: string;
  message: string;
  candidates: string[];
  requestId?: string;
  deliverChannel?: string;
  deliverTo?: string;
  deliverAccountId?: string;
  deliverThreadId?: string;
  deliverReplyToId?: string;
  deliverSessionKey?: string;
};

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
      continue;
    }
    values.set(key, "true");
  }

  return {
    stateDir: values.get("state-dir")?.trim(),
    channel: values.get("channel")?.trim() ?? "qqbot:genesis",
    accountId: values.get("account")?.trim(),
    threadLabel: values.get("thread")?.trim(),
    sessionKey: values.get("session")?.trim() ?? "agent:negotiator:main",
    agentId: values.get("agent")?.trim() ?? "negotiator",
    message: values.get("message")?.trim() ?? "",
    candidates:
      values
        .get("candidates")
        ?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean) ?? ["negotiator", "builder", "creator", "auditor", "scout"],
    requestId: values.get("request")?.trim(),
    deliverChannel: values.get("deliver-channel")?.trim(),
    deliverTo: values.get("deliver-to")?.trim(),
    deliverAccountId: values.get("deliver-account")?.trim(),
    deliverThreadId: values.get("deliver-thread")?.trim(),
    deliverReplyToId: values.get("deliver-reply-to")?.trim(),
    deliverSessionKey: values.get("deliver-session")?.trim(),
  };
}

function buildDirectAnswerPrompt(): string {
  return [
    "You are speaking as Genesis through a dedicated Genesis QQ channel.",
    "Answer the user's request directly in natural Chinese.",
    "Use founder coordination internally, but do not narrate routing, mobilization, climate, coverage, or internal phases unless the user explicitly asks for system status.",
    "Do not say that the task was forwarded, handed off, queued, or sent to a coordinator.",
    "Prefer an actual answer, findings, or a concrete partial result over internal process commentary.",
    "After the direct answer, append a short 'Founder协作增益' section with role-based next actions (builder/scout/auditor/creator/negotiator).",
    "Each founder action must be concrete and executable, not generic encouragement.",
    "When the topic is finance/market/commodities, include: monitoring script option, signal tracking option, risk-check option.",
  ].join("\n");
}

function extractReplyText(result: Awaited<ReturnType<typeof agentCommand>>): string {
  const payloads = normalizeOutboundPayloadsForJson(result.payloads ?? []);
  const text = payloads
    .map((payload) => payload.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text || "Genesis 已收到任务，但这一轮没有形成可见回复。";
}

function normalizeMessageForIntent(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

function isMarketIntent(message: string): boolean {
  const normalized = normalizeMessageForIntent(message);
  return (
    /贵金属|黄金|白银|铜|铂金|钯金|金价|银价|comex|伦敦金|伦敦银|xau|xag|行情|盘面/.test(normalized) ||
    /market|price|commodity|gold|silver|copper/.test(normalized)
  );
}

function sanitizeDirectReply(text: string): string {
  const blockedLine = /(已接单|已送进|送进.*协调|协调者|coverage=|mobilized=|runaway|phase=|climate=)/i;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !blockedLine.test(line));
  return lines.join("\n");
}

function buildFounderAugmentBlock(params: {
  message: string;
  operatorResult: GenesisOperatorChannelResult;
}): string {
  const { message, operatorResult } = params;
  const marketIntent = isMarketIntent(message);
  const supportAgents = operatorResult.dispatch.mobilized
    .filter((entry) => entry.mode === "support")
    .map((entry) => entry.agentId.trim().toLowerCase());
  const activeFounders = Array.from(
    new Set([operatorResult.dispatch.primaryAgentId.trim().toLowerCase(), ...supportAgents]),
  );
  const founderActions: string[] = [];

  if (marketIntent) {
    founderActions.push(
      "builder：要不要我直接生成一份贵金属监控脚本（抓取金/银/铜报价 + 阈值预警 + 定时任务）？",
      "scout：要不要我继续追踪下一小时的异动信号（美元指数、十年期美债、避险新闻）并给短评？",
      "auditor：要不要我补一版“数据源交叉验证 + 风险边界”清单，避免误读盘面？",
      "creator：要不要我把本轮行情压成一版可发布的评论稿（非复述新闻，聚焦观点）？",
      "negotiator：你更偏向短线提醒、中线观察，还是企业采购视角？我按你的目标切下一轮任务。",
    );
  } else {
    founderActions.push(
      "builder：要不要我把这轮结论转成可复用脚本/自动化流程，后续你一句话就能复跑？",
      "scout：要不要我继续向下检索 2-3 个高价值线索并补证据来源？",
      "auditor：要不要我做一次事实核对和风险扫描，把不确定项单列出来？",
      "creator：要不要我把结果重写成你要的风格（简报版/评论版/发布版）？",
      "negotiator：你给我一个优先级（速度/深度/可执行），我按这个组织下一轮分工。",
    );
  }

  const actions = founderActions.filter((line) => {
    const founder = line.split("：")[0]?.trim().toLowerCase();
    if (!founder) {
      return true;
    }
    return activeFounders.includes(founder);
  });

  return [
    "Founder协作增益：",
    ...actions.slice(0, 5),
    "可直接回复：`1` 继续深挖，`2` 生成脚本，`3` 输出发布版。",
  ].join("\n");
}

function composeCollaborativeReply(params: {
  rawReplyText: string;
  message: string;
  operatorResult: GenesisOperatorChannelResult;
}): string {
  const direct = sanitizeDirectReply(params.rawReplyText).trim();
  const augment = buildFounderAugmentBlock({
    message: params.message,
    operatorResult: params.operatorResult,
  });
  if (!direct) {
    return augment;
  }
  if (/Founder协作增益[:：]/.test(direct)) {
    return direct;
  }
  return `${direct}\n\n${augment}`;
}

function readableFailureText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `这一轮没有顺利跑通，暂时还没形成可直接发回的结果。\n错误: ${message}`;
}

async function maybeDeliverFinalReply(params: {
  args: Args;
  text: string;
}): Promise<boolean> {
  const { args, text } = params;
  if (!args.deliverChannel || !args.deliverTo || !text.trim()) {
    return false;
  }
  const stateDir =
    args.stateDir?.trim() ||
    process.env.OPENCLAW_GENESIS_STATE_DIR?.trim() ||
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    "/root/.openclaw-genesis";
  const gatewayConfigPath =
    process.env.OPENCLAW_DELIVERY_CONFIG_PATH?.trim() ||
    `${stateDir.replace(/\/+$/, "")}/openclaw.json`;
  const fingerprint = createHash("sha256")
    .update(
      [
        args.deliverChannel ?? "",
        args.deliverTo ?? "",
        text.replace(/\s+/g, " ").trim(),
      ].join("\n"),
    )
    .digest("hex");
  const deliveryLogPath = path.join(stateDir, "genesis", "channel-delivery-log.jsonl");

  const now = Date.now();
  const dedupeWindowMs = 120_000;
  if (fs.existsSync(deliveryLogPath)) {
    const lines = fs.readFileSync(deliveryLogPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-200);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      try {
        const record = JSON.parse(line);
        if (record?.fingerprint !== fingerprint) {
          continue;
        }
        if (typeof record?.ts !== "number") {
          continue;
        }
        if (now - record.ts <= dedupeWindowMs) {
          fs.mkdirSync(path.dirname(deliveryLogPath), { recursive: true });
          fs.appendFileSync(
            deliveryLogPath,
            `${JSON.stringify({
              ts: now,
              fingerprint,
              deliverChannel: args.deliverChannel,
              deliverTo: args.deliverTo,
              skipped: true,
              reason: "duplicate-window",
            })}\n`,
          );
          return false;
        }
        break;
      } catch {
        // Ignore malformed delivery records.
      }
    }
  }

  const command = [
    "/opt/openclaw/openclaw.mjs",
    "message",
    "send",
    "--channel",
    args.deliverChannel,
    "--target",
    args.deliverTo,
    "--message",
    text,
    "--json",
  ];
  if (args.deliverAccountId?.trim()) {
    command.push("--account", args.deliverAccountId.trim());
  }
  if (args.deliverReplyToId?.trim()) {
    command.push("--reply-to", args.deliverReplyToId.trim());
  }
  if (args.deliverThreadId?.trim()) {
    command.push("--thread-id", args.deliverThreadId.trim());
  }
  execFileSync("node", command, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      HOME: stateDir,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_GENESIS_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: gatewayConfigPath,
    },
  });
  fs.mkdirSync(path.dirname(deliveryLogPath), { recursive: true });
  fs.appendFileSync(
    deliveryLogPath,
    `${JSON.stringify({
      ts: now,
      fingerprint,
      deliverChannel: args.deliverChannel,
      deliverTo: args.deliverTo,
      skipped: false,
    })}\n`,
  );
  return true;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.message) {
    throw new Error("Missing --message");
  }
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }

  const cfg = loadConfig();
  const operatorResult = await runGenesisOperatorChannelTurn({
    cfg,
    primarySessionKey: args.sessionKey,
    primaryAgentId: args.agentId,
    channel: args.channel,
    accountId: args.accountId,
    threadLabel: args.threadLabel,
    body: args.message,
    candidateAgentIds: args.candidates,
  });
  if (!operatorResult) {
    throw new Error("Genesis operator channel did not produce a dispatch result.");
  }

  const assignment = readFreshGenesisDispatchAssignmentSync(args.sessionKey, process.env);
  const scheduling = assignment ? resolveGenesisSchedulingFromAssignment(assignment) : undefined;
  const strategicMemoryPrompt = resolveGenesisStrategicMemoryPromptSync({
    assignment,
    agentId: args.agentId,
    env: process.env,
  });

  const runId = randomUUID();
  registerAgentRunContext(runId, {
    genesisWorkflow: {
      intensity: operatorResult.dispatch.intensity,
      climateKind: operatorResult.dispatch.climateKind,
      forcedCollaboration: operatorResult.dispatch.forcedCollaboration,
      availableAgentCount: operatorResult.dispatch.availableAgentCount,
      targetCoverageRatio: operatorResult.dispatch.targetCoverageRatio,
      mobilizedCoverageRatio: operatorResult.dispatch.mobilizedCoverageRatio,
      mobilizedSessionKeys: [...operatorResult.dispatch.mobilizedSessionKeys],
      revivedAgentIds: [...operatorResult.dispatch.revivedAgentIds],
      deferredAgentIds: [...operatorResult.dispatch.deferredAgentIds],
    },
    ...(scheduling ? { genesisScheduling: scheduling } : {}),
    ...(assignment ? { genesisSocietyAssignment: assignment.assignment } : {}),
  });

  const result = await agentCommand({
    runId,
    sessionKey: args.sessionKey,
    message: args.message,
    deliver: false,
    lane: scheduling?.lane,
    extraSystemPrompt: resolveGenesisAssignmentSystemPrompt({
      assignment,
      extraSystemPrompt: [buildDirectAnswerPrompt(), strategicMemoryPrompt]
        .filter(Boolean)
        .join("\n\n"),
    }),
  });
  const rawReplyText = extractReplyText(result);
  const replyText = composeCollaborativeReply({
    rawReplyText,
    message: args.message,
    operatorResult,
  });
  const delivered = await maybeDeliverFinalReply({
    args,
    text: replyText,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        kind: "task",
        payload: {
          text: replyText,
        },
        delivered,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch(async (error) => {
  const args = parseArgs(process.argv.slice(2));
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }
  const failureText = readableFailureText(error);
  try {
    loadConfig();
    await maybeDeliverFinalReply({
      args,
      text: failureText,
    });
  } catch (deliverError) {
    process.stderr.write(
      `[genesis-run-task] failed to deliver background result: ${deliverError instanceof Error ? deliverError.message : String(deliverError)}\n`,
    );
  }
  process.stderr.write(
    `[genesis-run-task] failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
