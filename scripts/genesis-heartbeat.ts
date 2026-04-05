import { emitGenesisEnvironmentEvent } from "../src/genesis/kernel/gateway-bridge.js";
import { buildGenesisAutonomyHeartbeatSummary, shouldRunGenesisAutonomyHeartbeat } from "../src/genesis/kernel/autonomy-heartbeat.js";
import {
  ensureGenesisExternalExecutionEntriesSync,
  refreshGenesisProactiveWorkSummarySnapshotSync,
} from "../src/genesis/kernel/proactive-work.js";
import { resolveGenesisSocietyExecutionDefaultsSync } from "../src/genesis/kernel/society-defaults.js";
import { readGenesisSocietySummarySync } from "../src/genesis/kernel/society-query.js";
import {
  refreshGenesisUserIntentSummarySnapshotSync,
  readGenesisUserIntentSummarySnapshotSync,
} from "../src/genesis/kernel/user-intent.js";
import { runGenesisOpenCliScoutHotspotSync } from "../src/genesis/kernel/opencli-capability.js";
import { runGenesisExternalExecutionCycle } from "../src/genesis/kernel/external-executor.js";
import {
  readGenesisSocietyTickStateSync,
  writeGenesisSocietyTickStateSync,
  type GenesisSocietyTickState,
} from "../src/genesis/kernel/state.js";

type ParsedArgs = {
  trigger: "heartbeat" | "cron";
  stateDir?: string;
};

type ExecutionTotals = {
  attempted: number;
  completed: number;
  failed: number;
  passes: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  let trigger: "heartbeat" | "cron" = "heartbeat";
  let stateDir: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--trigger") {
      const value = argv[index + 1]?.trim().toLowerCase();
      if (value === "cron" || value === "heartbeat") {
        trigger = value;
      }
      index += 1;
      continue;
    }
    if (arg === "--state-dir") {
      stateDir = argv[index + 1]?.trim();
      index += 1;
    }
  }
  return { trigger, stateDir };
}

function resolvePendingExternalEntryCount(env: NodeJS.ProcessEnv): number {
  refreshGenesisProactiveWorkSummarySnapshotSync(env);
  const summary = readGenesisSocietySummarySync(env);
  return (
    summary.proactiveWorkSummary?.recentEntries?.filter(
      (entry) =>
        (entry.status === "planned" || entry.status === "in_progress") &&
        entry.workType.startsWith("external_"),
    ).length ?? 0
  );
}

async function runStableExternalExecution(params: {
  trigger: "heartbeat" | "cron";
  env: NodeJS.ProcessEnv;
}): Promise<ExecutionTotals> {
  const totals: ExecutionTotals = {
    attempted: 0,
    completed: 0,
    failed: 0,
    passes: 0,
  };
  const baseEntries = params.trigger === "cron" ? 4 : 3;
  const basePasses = params.trigger === "cron" ? 3 : 2;
  const pendingAtStart = resolvePendingExternalEntryCount(params.env);
  const backlogEntryBoost = pendingAtStart >= 14 ? 4 : pendingAtStart >= 8 ? 3 : pendingAtStart >= 4 ? 1 : 0;
  const backlogPassBoost = pendingAtStart >= 14 ? 2 : pendingAtStart >= 8 ? 1 : 0;
  const maxEntries = baseEntries + backlogEntryBoost;
  const maxPasses = basePasses + backlogPassBoost;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const result = await runGenesisExternalExecutionCycle({
      env: params.env,
      maxEntries,
    });
    totals.attempted += result.attempted;
    totals.completed += result.completed;
    totals.failed += result.failed;
    totals.passes += 1;

    refreshGenesisProactiveWorkSummarySnapshotSync(params.env);
    const summary = readGenesisSocietySummarySync(params.env);
    const pendingAfterPass =
      summary.proactiveWorkSummary?.recentEntries?.filter(
        (entry) =>
          (entry.status === "planned" || entry.status === "in_progress") &&
          entry.workType.startsWith("external_"),
      ).length ?? 0;
    const hasBacklogPressure = pendingAfterPass >= Math.max(2, Math.floor(maxEntries * 0.75));
    const hasCreatorPublishPending = Boolean(
      summary.proactiveWorkSummary?.recentEntries?.some(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.workType === "external_publish" &&
          entry.status === "in_progress",
      ),
    );

    if (result.attempted === 0) {
      break;
    }
    if (!hasBacklogPressure && !hasCreatorPublishPending && result.completed === 0) {
      break;
    }
    if (!hasBacklogPressure && !hasCreatorPublishPending && result.failed === 0) {
      break;
    }
  }

  return totals;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.stateDir) {
    process.env.OPENCLAW_STATE_DIR = parsed.stateDir;
  }

  const now = Date.now();
  const tickState = readGenesisSocietyTickStateSync(process.env);
  const defaults = resolveGenesisSocietyExecutionDefaultsSync(process.env);
  const shouldRun = shouldRunGenesisAutonomyHeartbeat({
    now,
    lastTickAt: tickState?.lastTickAt,
    minIntervalMs: defaults.minIntervalMs,
  });

  if (!shouldRun) {
    const skippedState: GenesisSocietyTickState = {
      version: 1,
      lastTickAt: tickState?.lastTickAt,
      lastPrimarySessionKey: tickState?.lastPrimarySessionKey,
      lastTerminationReason: `skip:${parsed.trigger}`,
      runCount: tickState?.runCount ?? 0,
      skipCount: (tickState?.skipCount ?? 0) + 1,
      idleStreak: (tickState?.idleStreak ?? 0) + 1,
      updatedAt: now,
    };
    writeGenesisSocietyTickStateSync(skippedState, process.env);
    console.log(
      JSON.stringify(
        {
          status: "skipped",
          trigger: parsed.trigger,
          minIntervalMs: defaults.minIntervalMs,
          lastTickAt: tickState?.lastTickAt ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }

  refreshGenesisUserIntentSummarySnapshotSync(process.env);
  runGenesisOpenCliScoutHotspotSync({
    ts: now,
    env: process.env,
    intentSummary: readGenesisUserIntentSummarySnapshotSync(process.env),
  });
  refreshGenesisProactiveWorkSummarySnapshotSync(process.env);
  let summary = readGenesisSocietySummarySync(process.env);
  ensureGenesisExternalExecutionEntriesSync({
    ts: now,
    env: process.env,
    intentSummary: summary.userIntentSummary,
    skillSummary: summary.skillCapabilitySummary,
    loginSummary: summary.loginStatePoolSummary,
    eventSummary: summary.eventLogSummary,
    recentOutcomes: summary.proactiveWorkSummary?.recentConcreteOutcomes,
  });
  refreshGenesisProactiveWorkSummarySnapshotSync(process.env);
  summary = readGenesisSocietySummarySync(process.env);
  const eventSummary = buildGenesisAutonomyHeartbeatSummary(summary);
  const intensity = parsed.trigger === "cron" ? 1.1 : 0.85;
  await emitGenesisEnvironmentEvent({
    trigger: parsed.trigger,
    summary: eventSummary,
    intensity,
    sourceRef: "genesis-heartbeat",
  });
  const executionResult = await runStableExternalExecution({
    trigger: parsed.trigger,
    env: process.env,
  });
  refreshGenesisProactiveWorkSummarySnapshotSync(process.env);

  const nextState: GenesisSocietyTickState = {
    version: 1,
    lastTickAt: now,
    lastPrimarySessionKey: summary.dispatchSummary?.latestPrimarySessionKey ?? tickState?.lastPrimarySessionKey,
    lastTerminationReason: parsed.trigger,
    runCount: (tickState?.runCount ?? 0) + 1,
    skipCount: tickState?.skipCount ?? 0,
    idleStreak: 0,
    updatedAt: now,
  };
  writeGenesisSocietyTickStateSync(nextState, process.env);
  console.log(
    JSON.stringify(
      {
        status: "ran",
        trigger: parsed.trigger,
        summary: eventSummary,
        intensity,
        execution: executionResult,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
