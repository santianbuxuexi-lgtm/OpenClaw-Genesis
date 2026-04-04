import { randomUUID } from "node:crypto";
import { agentCommand } from "../src/agents/agent-command.js";
import { registerAgentRunContext } from "../src/infra/agent-events.js";
import { loadConfig } from "../src/config/config.js";
import { normalizeOutboundPayloadsForJson } from "../src/infra/outbound/payloads.js";
import { runGenesisOperatorChannelTurn } from "../src/genesis/kernel/operator-channel.js";
import { resolveGenesisAssignmentSystemPrompt } from "../src/genesis/kernel/workflow.js";
import { resolveGenesisSchedulingFromAssignment } from "../src/genesis/kernel/workflow.js";
import { resolveGenesisStrategicMemoryPromptSync } from "../src/genesis/kernel/strategic-memory.js";
import { readFreshGenesisDispatchAssignmentSync } from "../src/genesis/kernel/state.js";

type Args = {
  stateDir?: string;
  channel: string;
  accountId?: string;
  threadLabel?: string;
  sessionKey: string;
  agentId: string;
  message: string;
  candidates: string[];
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
  };
}

function buildDirectAnswerPrompt(): string {
  return [
    "You are speaking as Genesis through a dedicated Genesis QQ channel.",
    "Answer the user's request directly in natural Chinese.",
    "Use founder coordination internally, but do not narrate routing, mobilization, climate, coverage, or internal phases unless the user explicitly asks for system status.",
    "Do not say that the task was forwarded, handed off, queued, or sent to a coordinator.",
    "Prefer an actual answer, findings, or a concrete partial result over internal process commentary.",
  ].join("\n");
}

function extractReplyText(result: Awaited<ReturnType<typeof agentCommand>>): string {
  const payloads = normalizeOutboundPayloadsForJson(result.payloads ?? []);
  const text = payloads
    .map((payload) => payload.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text || "\u0047\u0065\u006e\u0065\u0073\u0069\u0073\u0020\u5df2\u6536\u5230\u4efb\u52a1\uff0c\u4f46\u8fd9\u4e00\u8f6e\u6ca1\u6709\u5f62\u6210\u53ef\u89c1\u56de\u590d\u3002";
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

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        kind: "task",
        payload: {
          text: extractReplyText(result),
        },
      },
      null,
      2,
    )}\n`,
  );
}

void main();
