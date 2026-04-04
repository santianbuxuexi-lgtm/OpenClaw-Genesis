import fs from "node:fs";
import path from "node:path";
import {
  readJsonFileSync,
  resolveGenesisTrajectoryLogPath,
  resolveGenesisTrajectorySummaryPath,
  type GenesisSocietySummary,
} from "./state.js";

export type GenesisTrajectoryMode = "climate" | "survival" | "recovery" | "replication" | "idle";

export type GenesisTrajectoryEntry = {
  ts: number;
  mode: GenesisTrajectoryMode;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  source: string;
  state: {
    currentPressure: number;
    stormMomentum: number;
    replicationBoost: number;
    mortalityPressureScore: number;
    proactiveSignalScore: number;
    collaborationEffectScore: number;
  };
  action: {
    mobilizedAgentCount: number;
    leadAssignmentCount: number;
    supportAssignmentCount: number;
    reviveAssignmentCount: number;
    replicatingParentCount: number;
    childLineageCount: number;
    superpowerChildCount: number;
    optimizationApplied: boolean;
  };
  reward: {
    processReward: number;
    outcomeReward: number;
    totalReward: number;
    proactiveReward: number;
    cooperationReward: number;
    recoveryReward: number;
    replicationReward: number;
    survivalReward: number;
  };
};

export type GenesisTrajectorySummary = {
  recentTrajectoryCount: number;
  climateTrajectoryCount: number;
  survivalTrajectoryCount: number;
  recoveryTrajectoryCount: number;
  replicationTrajectoryCount: number;
  idleTrajectoryCount: number;
  averageProcessReward: number;
  averageOutcomeReward: number;
  averageTotalReward: number;
  latestMode?: GenesisTrajectoryMode;
  lastTrajectoryTs?: number;
  highestRewardFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  highestRewardFounderScore?: number;
};

export const DEFAULT_GENESIS_TRAJECTORY_SUMMARY: GenesisTrajectorySummary = {
  recentTrajectoryCount: 0,
  climateTrajectoryCount: 0,
  survivalTrajectoryCount: 0,
  recoveryTrajectoryCount: 0,
  replicationTrajectoryCount: 0,
  idleTrajectoryCount: 0,
  averageProcessReward: 0,
  averageOutcomeReward: 0,
  averageTotalReward: 0,
  highestRewardFounderOrigin: null,
  highestRewardFounderScore: 0,
};

export function resolveGenesisProcessReward(
  summary: Pick<
    GenesisSocietySummary,
    "world" | "collaborationSummary" | "vitalitySummary" | "experimentSignals"
  >,
): GenesisTrajectoryEntry["reward"] {
  const vitality = summary.vitalitySummary;
  const collaboration = summary.collaborationSummary;
  const processReward =
    (vitality?.proactiveSignalScore ?? 0) * 0.28 +
    (collaboration?.collaborationEffectScore ?? 0) * 0.32 +
    (vitality?.recoveryReadyScore ?? 0) * 0.22 +
    (vitality?.roleAlignedProactiveYieldScore ?? 0) * 0.18;
  const outcomeReward =
    (vitality?.totalPublicValue ?? 0) * 0.2 +
    (vitality?.totalSurvivalCredit ?? 0) * 0.25 +
    (vitality?.autonomousExpansionScore ?? 0) * 0.15 +
    (summary.experimentSignals?.amplificationScore ?? 0) * 0.05;
  const proactiveReward = (vitality?.proactiveSignalScore ?? 0) * 0.35;
  const cooperationReward = (collaboration?.collaborationEffectScore ?? 0) * 0.4;
  const recoveryReward =
    (vitality?.stableRecoveryScore ?? 0) * 0.3 +
    (vitality?.durableRecoveryScore ?? 0) * 0.45 +
    (vitality?.recoveryReadyScore ?? 0) * 0.25;
  const replicationReward =
    (vitality?.replicationFrequencyScore ?? 0) * 0.3 +
    (vitality?.replicationSpeedScore ?? 0) * 0.2 +
    (vitality?.productiveReplicationCapacityScore ?? 0) * 0.35;
  const survivalReward =
    (vitality?.totalSurvivalCredit ?? 0) * 0.35 -
    (vitality?.mortalityPressureScore ?? 0) * 0.15 +
    (vitality?.recoveryReadyScore ?? 0) * 0.2;
  return {
    processReward,
    outcomeReward,
    totalReward: processReward * 0.7 + outcomeReward * 0.3,
    proactiveReward,
    cooperationReward,
    recoveryReward,
    replicationReward,
    survivalReward,
  };
}

export function resolveGenesisTrajectoryMode(
  source: string,
  summary: Pick<GenesisSocietySummary, "world" | "vitalitySummary">,
): GenesisTrajectoryMode {
  const normalized = source.trim().toLowerCase();
  if (normalized.includes("idle") || normalized.includes("metaclaw")) {
    return "idle";
  }
  if (normalized.includes("workflow") || normalized.includes("search") || normalized.includes("query") || normalized.includes("consultation")) {
    return "climate";
  }
  if ((summary.vitalitySummary?.recoverableLineageCount ?? 0) > 0 || (summary.vitalitySummary?.nearDeathLineageCount ?? 0) > 0) {
    return "recovery";
  }
  if ((summary.vitalitySummary?.replicatingParentCount ?? 0) > 0 || (summary.vitalitySummary?.childLineageCount ?? 0) > 0) {
    return "replication";
  }
  return "survival";
}

export function buildGenesisTrajectoryEntry(params: {
  ts?: number;
  source: string;
  summary: Pick<
    GenesisSocietySummary,
    "world" | "collaborationSummary" | "vitalitySummary" | "experimentSignals"
  >;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  optimizationApplied?: boolean;
}): GenesisTrajectoryEntry {
  const ts = params.ts ?? Date.now();
  const reward = resolveGenesisProcessReward(params.summary);
  return {
    ts,
    mode: resolveGenesisTrajectoryMode(params.source, params.summary),
    founderOrigin: params.founderOrigin ?? params.summary.vitalitySummary?.highestYieldFounderOrigin ?? null,
    source: params.source,
    state: {
      currentPressure: params.summary.world?.currentPressure ?? 0,
      stormMomentum: params.summary.world?.stormMomentum ?? 0,
      replicationBoost: params.summary.world?.replicationBoost ?? 0,
      mortalityPressureScore: params.summary.vitalitySummary?.mortalityPressureScore ?? 0,
      proactiveSignalScore: params.summary.vitalitySummary?.proactiveSignalScore ?? 0,
      collaborationEffectScore: params.summary.collaborationSummary?.collaborationEffectScore ?? 0,
    },
    action: {
      mobilizedAgentCount: params.summary.collaborationSummary?.mobilizedAgentCount ?? 0,
      leadAssignmentCount: params.summary.collaborationSummary?.leadAssignmentCount ?? 0,
      supportAssignmentCount: params.summary.collaborationSummary?.supportAssignmentCount ?? 0,
      reviveAssignmentCount: params.summary.collaborationSummary?.reviveAssignmentCount ?? 0,
      replicatingParentCount: params.summary.vitalitySummary?.replicatingParentCount ?? 0,
      childLineageCount: params.summary.vitalitySummary?.childLineageCount ?? 0,
      superpowerChildCount: params.summary.vitalitySummary?.superpowerChildCount ?? 0,
      optimizationApplied: Boolean(params.optimizationApplied),
    },
    reward,
  };
}

export function reduceGenesisTrajectorySummary(
  previous: GenesisTrajectorySummary,
  entry: GenesisTrajectoryEntry,
): GenesisTrajectorySummary {
  const nextCount = previous.recentTrajectoryCount + 1;
  const next: GenesisTrajectorySummary = {
    ...previous,
    recentTrajectoryCount: nextCount,
    averageProcessReward:
      ((previous.averageProcessReward * previous.recentTrajectoryCount) + entry.reward.processReward) /
      nextCount,
    averageOutcomeReward:
      ((previous.averageOutcomeReward * previous.recentTrajectoryCount) + entry.reward.outcomeReward) /
      nextCount,
    averageTotalReward:
      ((previous.averageTotalReward * previous.recentTrajectoryCount) + entry.reward.totalReward) /
      nextCount,
    latestMode: entry.mode,
    lastTrajectoryTs: Math.max(previous.lastTrajectoryTs ?? 0, entry.ts),
    highestRewardFounderOrigin:
      (entry.founderOrigin && entry.reward.totalReward >= (previous.highestRewardFounderScore ?? 0))
        ? entry.founderOrigin
        : previous.highestRewardFounderOrigin ?? null,
    highestRewardFounderScore: Math.max(previous.highestRewardFounderScore ?? 0, entry.reward.totalReward),
  };
  if (entry.mode === "climate") {
    next.climateTrajectoryCount += 1;
  } else if (entry.mode === "survival") {
    next.survivalTrajectoryCount += 1;
  } else if (entry.mode === "recovery") {
    next.recoveryTrajectoryCount += 1;
  } else if (entry.mode === "replication") {
    next.replicationTrajectoryCount += 1;
  } else if (entry.mode === "idle") {
    next.idleTrajectoryCount += 1;
  }
  return next;
}

export function appendGenesisTrajectoryEntrySync(
  entry: GenesisTrajectoryEntry,
  env: NodeJS.ProcessEnv = process.env,
): GenesisTrajectorySummary {
  const logPath = resolveGenesisTrajectoryLogPath(env);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
  const previous =
    readGenesisTrajectorySummarySnapshotSync(env) ?? {
      ...DEFAULT_GENESIS_TRAJECTORY_SUMMARY,
    };
  const next = reduceGenesisTrajectorySummary(previous, entry);
  writeGenesisTrajectorySummarySnapshotSync(next, env);
  return next;
}

export function readGenesisTrajectorySummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisTrajectorySummary | null {
  const snapshot = readJsonFileSync<GenesisTrajectorySummary>(resolveGenesisTrajectorySummaryPath(env));
  if (!snapshot) {
    return null;
  }
  return {
    ...DEFAULT_GENESIS_TRAJECTORY_SUMMARY,
    ...snapshot,
  };
}

export function writeGenesisTrajectorySummarySnapshotSync(
  summary: GenesisTrajectorySummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisTrajectorySummaryPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
}
