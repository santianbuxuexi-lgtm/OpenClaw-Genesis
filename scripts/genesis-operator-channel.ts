import { runGenesisOperatorChannelTurn } from "../src/genesis/kernel/operator-channel.js";

type Args = {
  sessionKey: string;
  agentId?: string;
  channel: string;
  sender?: string;
  accountId?: string;
  threadLabel?: string;
  message: string;
  requestId?: string;
  candidates?: string[];
  stateDir?: string;
};

const DEFAULT_GENESIS_CANDIDATES = ["main", "builder", "creator", "auditor", "negotiator", "scout"];

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
  const message = values.get("message")?.trim() ?? "";
  const sessionKey = values.get("session")?.trim() ?? "agent:main:main";
  const channel = values.get("channel")?.trim() ?? "operator";
  const candidates =
    values.get("candidates")?.split(",").map((entry) => entry.trim()).filter(Boolean) ??
    DEFAULT_GENESIS_CANDIDATES;
  return {
    sessionKey,
    agentId: values.get("agent")?.trim(),
    channel,
    sender: values.get("sender")?.trim(),
    accountId: values.get("account")?.trim(),
    threadLabel: values.get("thread")?.trim(),
    message,
    requestId: values.get("request")?.trim(),
    candidates,
    stateDir: values.get("state-dir")?.trim(),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.message) {
    throw new Error("Missing --message for Genesis operator channel input");
  }
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }
  const result = await runGenesisOperatorChannelTurn({
    cfg: { session: { mainKey: "main" } } as never,
    primarySessionKey: args.sessionKey,
    primaryAgentId: args.agentId,
    channel: args.channel,
    senderLabel: args.sender,
    accountId: args.accountId,
    threadLabel: args.threadLabel,
    body: args.message,
    requestId: args.requestId,
    candidateAgentIds: args.candidates,
  });
  if (!result) {
    throw new Error("Genesis operator channel turn did not produce a dispatch result");
  }
  const output = {
    climateKind: result.climateKind,
    intensity: Number(result.intensity.toFixed(3)),
    report: result.report,
    mobilized: result.dispatch.mobilized.map((entry) => ({
      agentId: entry.agentId,
      mode: entry.mode,
      ecologyState: entry.ecologyState,
      queued: entry.queued,
    })),
    leaders: {
      replication: result.summary.learningSummary?.highestReplicationQualificationFounderOrigin ?? null,
      recovery: result.summary.learningSummary?.highestRecoveryQualificationFounderOrigin ?? null,
      niche: result.summary.learningSummary?.highestNicheBalanceFounderOrigin ?? null,
    },
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

void main();
