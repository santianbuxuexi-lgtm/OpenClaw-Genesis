import fs from "node:fs";
import path from "node:path";
import { readJsonFileSync, resolveGenesisEventLogSummaryPath, resolveGenesisLedgerPath } from "./state.js";
import type { GenesisEnvironmentEvent, GenesisRunCompletion, GenesisWorkflowDispatchRecord } from "./gateway-bridge.js";

export type GenesisEventLogEntry =
  | {
      kind: "environment_event";
      ts: number;
      payload: GenesisEnvironmentEvent;
    }
  | {
      kind: "run_completion";
      ts: number;
      payload: GenesisRunCompletion;
    }
  | {
      kind: "workflow_dispatch";
      ts: number;
      payload: GenesisWorkflowDispatchRecord;
    };

export type GenesisEventLogSummary = {
  recentEntryCount: number;
  environmentEventCount: number;
  runCompletionCount: number;
  workflowDispatchCount: number;
  recentEnvironmentTriggers: Record<"cron" | "heartbeat" | "workflow", number>;
  lastEntryTs?: number;
  lastEnvironmentTs?: number;
  lastEnvironmentSummary?: string;
};

export const DEFAULT_GENESIS_EVENT_LOG_SUMMARY: GenesisEventLogSummary = {
  recentEntryCount: 0,
  environmentEventCount: 0,
  runCompletionCount: 0,
  workflowDispatchCount: 0,
  recentEnvironmentTriggers: {
    cron: 0,
    heartbeat: 0,
    workflow: 0,
  },
};

export function reduceGenesisEventLogSummary(
  previous: GenesisEventLogSummary,
  entry: GenesisEventLogEntry,
): GenesisEventLogSummary {
  const next: GenesisEventLogSummary = {
    ...previous,
    recentEnvironmentTriggers: { ...previous.recentEnvironmentTriggers },
    recentEntryCount: previous.recentEntryCount + 1,
    lastEntryTs: Math.max(previous.lastEntryTs ?? 0, entry.ts),
  };
  if (entry.kind === "environment_event") {
    next.environmentEventCount += 1;
    next.recentEnvironmentTriggers[entry.payload.trigger] += 1;
    next.lastEnvironmentTs = Math.max(previous.lastEnvironmentTs ?? 0, entry.ts);
    next.lastEnvironmentSummary = entry.payload.summary;
  } else if (entry.kind === "run_completion") {
    next.runCompletionCount += 1;
  } else if (entry.kind === "workflow_dispatch") {
    next.workflowDispatchCount += 1;
  }
  return next;
}

export function readGenesisEventLogEntriesSync(
  env: NodeJS.ProcessEnv = process.env,
  limit = 128,
): GenesisEventLogEntry[] {
  try {
    const raw = fs.readFileSync(resolveGenesisLedgerPath(env), "utf-8");
    const lines = raw
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    const start = Math.max(0, lines.length - Math.max(1, limit));
    return lines
      .slice(start)
      .map((line) => JSON.parse(line) as GenesisEventLogEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function readGenesisEventLogSummarySync(
  env: NodeJS.ProcessEnv = process.env,
  limit = 128,
): GenesisEventLogSummary {
  const entries = readGenesisEventLogEntriesSync(env, limit);
  const summary: GenesisEventLogSummary = {
    ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY,
    recentEnvironmentTriggers: { ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY.recentEnvironmentTriggers },
  };
  for (const entry of entries) {
    Object.assign(summary, reduceGenesisEventLogSummary(summary, entry));
  }
  return summary;
}

export function readGenesisEventLogSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisEventLogSummary | null {
  const snapshot = readJsonFileSync<GenesisEventLogSummary>(resolveGenesisEventLogSummaryPath(env));
  if (!snapshot) {
    return null;
  }
  return {
    ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY,
    ...snapshot,
    recentEnvironmentTriggers: {
      ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY.recentEnvironmentTriggers,
      ...(snapshot.recentEnvironmentTriggers ?? {}),
    },
  };
}

export function writeGenesisEventLogSummarySnapshotSync(
  summary: GenesisEventLogSummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisEventLogSummaryPath(env);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EPERM") {
      return;
    }
    throw error;
  }
}
