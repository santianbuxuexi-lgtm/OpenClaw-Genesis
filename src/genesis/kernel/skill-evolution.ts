import fs from "node:fs";
import path from "node:path";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import {
  readJsonFileSync,
  resolveGenesisSkillEvolutionLogPath,
  resolveGenesisSkillEvolutionSummaryPath,
} from "./state.js";

export type GenesisSkillEvolutionMode = "fix" | "derived" | "captured";

export type GenesisSkillEvolutionEvent = {
  ts: number;
  sessionKey: string;
  lineageId: string;
  mode: GenesisSkillEvolutionMode;
  reason?: string;
};

export type GenesisSkillEvolutionSummary = {
  recentEventCount: number;
  modeCounts: Record<GenesisSkillEvolutionMode, number>;
  topLineages: Array<{
    lineageId: string;
    eventCount: number;
    fixCount: number;
    derivedCount: number;
    capturedCount: number;
    lastMode?: GenesisSkillEvolutionMode;
    lastReason?: string;
  }>;
};

export const DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY: GenesisSkillEvolutionSummary = {
  recentEventCount: 0,
  modeCounts: {
    fix: 0,
    derived: 0,
    captured: 0,
  },
  topLineages: [],
};

function inferGenesisSkillEvolutionMode(reason?: string): GenesisSkillEvolutionMode | null {
  const normalized = reason?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["create", "spawn", "derive", "derived"].includes(normalized)) {
    return "derived";
  }
  if (
    ["error", "failed", "failure", "abort", "aborted", "timeout", "timed_out"].includes(normalized)
  ) {
    return "fix";
  }
  if (["complete", "completed", "done", "finished", "end", "heartbeat"].includes(normalized)) {
    return "captured";
  }
  return null;
}

export function buildGenesisSkillEvolutionEvent(params: {
  ts: number;
  sessionKey: string;
  lineageId: string;
  reason?: string;
}): GenesisSkillEvolutionEvent | null {
  const mode = inferGenesisSkillEvolutionMode(params.reason);
  if (!mode) {
    return null;
  }
  return {
    ts: params.ts,
    sessionKey: params.sessionKey,
    lineageId: params.lineageId,
    mode,
    ...(params.reason ? { reason: params.reason } : {}),
  };
}

export function reduceGenesisSkillEvolutionSummary(
  previous: GenesisSkillEvolutionSummary,
  event: GenesisSkillEvolutionEvent,
): GenesisSkillEvolutionSummary {
  const next: GenesisSkillEvolutionSummary = {
    recentEventCount: previous.recentEventCount + 1,
    modeCounts: {
      ...previous.modeCounts,
      [event.mode]: previous.modeCounts[event.mode] + 1,
    },
    topLineages: previous.topLineages.map((entry) => ({ ...entry })),
  };
  const existing = next.topLineages.find((entry) => entry.lineageId === event.lineageId);
  if (existing) {
    existing.eventCount += 1;
    if (event.mode === "fix") {
      existing.fixCount += 1;
    } else if (event.mode === "derived") {
      existing.derivedCount += 1;
    } else {
      existing.capturedCount += 1;
    }
    existing.lastMode = event.mode;
    if (event.reason) {
      existing.lastReason = event.reason;
    }
  } else {
    next.topLineages.push({
      lineageId: event.lineageId,
      eventCount: 1,
      fixCount: event.mode === "fix" ? 1 : 0,
      derivedCount: event.mode === "derived" ? 1 : 0,
      capturedCount: event.mode === "captured" ? 1 : 0,
      lastMode: event.mode,
      ...(event.reason ? { lastReason: event.reason } : {}),
    });
  }
  next.topLineages.sort(
    (left, right) =>
      right.eventCount - left.eventCount ||
      right.capturedCount - left.capturedCount ||
      right.derivedCount - left.derivedCount,
  );
  next.topLineages = next.topLineages.slice(0, 10);
  return next;
}

export function readGenesisSkillEvolutionSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSkillEvolutionSummary | null {
  return readJsonFileSync<GenesisSkillEvolutionSummary>(resolveGenesisSkillEvolutionSummaryPath(env));
}

export function writeGenesisSkillEvolutionSummarySnapshotSync(
  summary: GenesisSkillEvolutionSummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisSkillEvolutionSummaryPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
}

export function readGenesisSkillEvolutionSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSkillEvolutionSummary {
  const filePath = resolveGenesisSkillEvolutionLogPath(env);
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY,
        modeCounts: { ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY.modeCounts },
        topLineages: [],
      };
    }
    throw error;
  }

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GenesisSkillEvolutionEvent)
    .reduce(
      (summary, event) =>
        reduceGenesisSkillEvolutionSummary(
          {
            ...summary,
            modeCounts: { ...summary.modeCounts },
            topLineages: summary.topLineages.map((entry) => ({ ...entry })),
          },
          event,
        ),
      {
        ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY,
        modeCounts: { ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY.modeCounts },
        topLineages: [],
      },
    );
}

export function resolveGenesisSkillEvolutionBias(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const normalized = lineageId.trim();
  if (!normalized) {
    return 0;
  }
  const summary =
    readGenesisSkillEvolutionSummarySnapshotSync(env) ?? readGenesisSkillEvolutionSummarySync(env);
  const entry = summary.topLineages.find((item) => item.lineageId === normalized);
  if (!entry) {
    return 0;
  }
  const profile = readGenesisExperimentProfileSync(env);
  return (
    entry.capturedCount * profile.skillCapturedBiasWeight +
    entry.derivedCount * profile.skillDerivedBiasWeight +
    entry.fixCount * profile.skillFixBiasWeight
  );
}
