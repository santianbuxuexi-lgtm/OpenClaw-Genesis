import fs from "node:fs";
import path from "node:path";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import {
  readGenesisLineageFocusItemsSync,
  readGenesisLineageTriggersSync,
  writeGenesisLineageFocusItemsSync,
  writeGenesisLineageTriggersSync,
  type GenesisLineageFocusItem,
  type GenesisLineageTriggerItem,
} from "./focus.js";
import type { GenesisTrajectorySummary } from "./trajectory-log.js";
import {
  readJsonFileSync,
  resolveGenesisMetaClawStatePath,
  type GenesisSocietySummary,
} from "./state.js";

export type GenesisMetaClawState = {
  idleEligible: boolean;
  idleOptimizationCount: number;
  lastOptimizedAt?: number;
  lastSkipReason?: string;
  lastTargetFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  lastSecondaryFounderOrigin?:
    | "scout"
    | "builder"
    | "creator"
    | "auditor"
    | "negotiator"
    | null;
  lastTargetLineageId?: string;
  lastSecondaryLineageId?: string;
  lastAction?: "boost_focus" | "boost_trigger" | "stabilize_recovery" | "none";
  lastSecondaryAction?: "boost_focus" | "boost_trigger" | "stabilize_recovery" | "none";
  lastProcessReward?: number;
  lastLearningMomentumScore?: number;
};

export const DEFAULT_GENESIS_META_CLAW_STATE: GenesisMetaClawState = {
  idleEligible: false,
  idleOptimizationCount: 0,
  lastTargetFounderOrigin: null,
  lastAction: "none",
};

export function readGenesisMetaClawStateSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisMetaClawState | null {
  const snapshot = readJsonFileSync<GenesisMetaClawState>(resolveGenesisMetaClawStatePath(env));
  if (!snapshot) {
    return null;
  }
  return {
    ...DEFAULT_GENESIS_META_CLAW_STATE,
    ...snapshot,
  };
}

export function writeGenesisMetaClawStateSync(
  state: GenesisMetaClawState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisMetaClawStatePath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function upsertMetaClawFocus(
  lineageId: string,
  action: "boost_focus" | "boost_trigger" | "stabilize_recovery",
  env: NodeJS.ProcessEnv,
  boosts?: {
    focusIntensityBoost?: number;
    triggerActivationBoost?: number;
  },
): void {
  const profile = readGenesisExperimentProfileSync(env);
  const now = Date.now();
  const focusId = `metaclaw:${lineageId}:focus`;
  const triggerId = `metaclaw:${lineageId}:trigger`;
  const focusItems = readGenesisLineageFocusItemsSync(lineageId, env);
  const triggers = readGenesisLineageTriggersSync(lineageId, env);

  const nextFocusItems: GenesisLineageFocusItem[] = [];
  const focusIntensityBoost = boosts?.focusIntensityBoost ?? profile.metaClawFocusIntensityBoost;
  const triggerActivationBoost =
    boosts?.triggerActivationBoost ?? profile.metaClawTriggerActivationBoost;
  let focusFound = false;
  for (const item of focusItems) {
    if (item.id !== focusId) {
      nextFocusItems.push(item);
      continue;
    }
    focusFound = true;
    nextFocusItems.push({
      ...item,
      status: "active",
      intensity: Math.min(8, item.intensity + focusIntensityBoost),
      updatedAt: now,
    });
  }
  if (!focusFound) {
    nextFocusItems.push({
      id: focusId,
      title: `MetaClaw optimize ${lineageId}`,
      domain: action === "stabilize_recovery" ? "recovery" : "workflow",
      intensity: 1 + focusIntensityBoost,
      status: "active",
      triggerMode: "heartbeat",
      keywords: [lineageId, action, "metaclaw", "optimize"],
      createdAt: now,
      updatedAt: now,
    });
  }

  const nextTriggers: GenesisLineageTriggerItem[] = [];
  let triggerFound = false;
  for (const trigger of triggers) {
    if (trigger.id !== triggerId) {
      nextTriggers.push(trigger);
      continue;
    }
    triggerFound = true;
    nextTriggers.push({
      ...trigger,
      status: "active",
      activationScore: Math.min(
        20,
        Math.max(0.5, trigger.activationScore ?? 0) + triggerActivationBoost,
      ),
      lastTriggeredAt: now,
      updatedAt: now,
    });
  }
  if (!triggerFound) {
    nextTriggers.push({
      id: triggerId,
      focusId,
      title: `MetaClaw trigger ${lineageId}`,
      status: "active",
      triggerMode: "heartbeat",
      threshold: 1,
      lastTriggeredAt: now,
      activationScore: triggerActivationBoost,
      createdAt: now,
      updatedAt: now,
    });
  }

  writeGenesisLineageFocusItemsSync(lineageId, nextFocusItems, env);
  writeGenesisLineageTriggersSync(lineageId, nextTriggers, env);
}

export function runGenesisMetaClawIdleOptimizationSync(params: {
  summary: Pick<GenesisSocietySummary, "world" | "vitalitySummary">;
  trajectorySummary?: GenesisTrajectorySummary | null;
  env?: NodeJS.ProcessEnv;
}): GenesisMetaClawState {
  const env = params.env ?? process.env;
  const profile = readGenesisExperimentProfileSync(env);
  const previous = readGenesisMetaClawStateSync(env) ?? { ...DEFAULT_GENESIS_META_CLAW_STATE };
  const world = params.summary.world;
  const vitality = params.summary.vitalitySummary;
  const processReward = params.trajectorySummary?.averageProcessReward ?? 0;
  const learningMomentumScore =
    processReward * (1 + profile.metaClawLearningMomentumWeight) +
    (params.trajectorySummary?.averageTotalReward ?? 0) * 0.6 +
    (params.trajectorySummary?.highestRewardFounderScore ?? 0) * 0.35;
  const now = Date.now();
  const idleEligible =
    (world?.currentPressure ?? 0) <= profile.metaClawIdlePressureThreshold &&
    (world?.stormMomentum ?? 0) <= profile.metaClawIdleStormThreshold &&
    (world?.replicationBoost ?? 0) <= profile.metaClawIdleReplicationThreshold;

  if (!idleEligible) {
    const next = {
      ...previous,
      idleEligible: false,
      lastSkipReason: "pressure_not_idle",
    };
    writeGenesisMetaClawStateSync(next, env);
    return next;
  }
  if ((previous.lastOptimizedAt ?? 0) + profile.metaClawIdleCooldownMs > now) {
    const next = {
      ...previous,
      idleEligible: true,
      lastSkipReason: "cooldown_active",
    };
    writeGenesisMetaClawStateSync(next, env);
    return next;
  }
  if (processReward < profile.metaClawRewardFloor) {
    const next = {
      ...previous,
      idleEligible: true,
      lastSkipReason: "reward_floor_not_met",
      lastProcessReward: processReward,
    };
    writeGenesisMetaClawStateSync(next, env);
    return next;
  }

  const underRecoveryPressure =
    (vitality?.nearDeathLineageCount ?? 0) > 0 || (vitality?.stressedLineageCount ?? 0) > 0;
  const recoveryTargetFounderOrigin =
    vitality?.highestStableRecoveryFounderOrigin ??
    vitality?.highestRecoveryFounderOrigin ??
    vitality?.highestRecoveryChainFounderOrigin ??
    null;
  const expansionTargetFounderOrigin =
    vitality?.highestYieldFounderOrigin ??
    params.trajectorySummary?.highestRewardFounderOrigin ??
    vitality?.highestRecoveryFounderOrigin ??
    null;
  const targetFounderOrigin = underRecoveryPressure
    ? recoveryTargetFounderOrigin ?? expansionTargetFounderOrigin
    : expansionTargetFounderOrigin ?? recoveryTargetFounderOrigin;
  const secondaryFounderOrigin =
    (underRecoveryPressure
      ? expansionTargetFounderOrigin && expansionTargetFounderOrigin !== targetFounderOrigin
        ? expansionTargetFounderOrigin
        : params.trajectorySummary?.highestRewardFounderOrigin &&
            params.trajectorySummary.highestRewardFounderOrigin !== targetFounderOrigin
          ? params.trajectorySummary.highestRewardFounderOrigin
          : vitality?.highestRecoveryChainFounderOrigin &&
              vitality.highestRecoveryChainFounderOrigin !== targetFounderOrigin
            ? vitality.highestRecoveryChainFounderOrigin
            : null
      : recoveryTargetFounderOrigin && recoveryTargetFounderOrigin !== targetFounderOrigin
        ? recoveryTargetFounderOrigin
        : params.trajectorySummary?.highestRewardFounderOrigin &&
            params.trajectorySummary.highestRewardFounderOrigin !== targetFounderOrigin
          ? params.trajectorySummary.highestRewardFounderOrigin
          : null) ?? null;
  const targetLineageId = targetFounderOrigin ?? undefined;
  const secondaryLineageId = secondaryFounderOrigin ?? undefined;
  const action: GenesisMetaClawState["lastAction"] =
    vitality?.nearDeathLineageCount && vitality.nearDeathLineageCount > 0
      ? "stabilize_recovery"
      : vitality?.highestYieldFounderOrigin
        ? "boost_focus"
        : "boost_trigger";
  const secondaryAction: GenesisMetaClawState["lastSecondaryAction"] =
    vitality?.nearDeathLineageCount && vitality.nearDeathLineageCount > 0
      ? "boost_trigger"
      : "boost_focus";

  if (targetLineageId) {
    upsertMetaClawFocus(targetLineageId, action === "none" ? "boost_trigger" : action, env, {
      focusIntensityBoost:
        profile.metaClawFocusIntensityBoost +
        Math.min(1.5, learningMomentumScore * profile.metaClawLearningMomentumWeight),
      triggerActivationBoost:
        profile.metaClawTriggerActivationBoost +
        Math.min(3, learningMomentumScore * profile.metaClawLearningMomentumWeight * 2),
    });
  }
  if (secondaryLineageId) {
    upsertMetaClawFocus(secondaryLineageId, secondaryAction ?? "boost_focus", env, {
      focusIntensityBoost:
        profile.metaClawSecondaryFocusIntensityBoost +
        Math.min(1, learningMomentumScore * profile.metaClawLearningMomentumWeight * 0.65),
      triggerActivationBoost:
        profile.metaClawSecondaryTriggerActivationBoost +
        Math.min(2, learningMomentumScore * profile.metaClawLearningMomentumWeight * 1.2),
    });
  }

  const next: GenesisMetaClawState = {
    idleEligible: true,
    idleOptimizationCount: previous.idleOptimizationCount + 1,
    lastOptimizedAt: now,
    lastSkipReason: undefined,
    lastTargetFounderOrigin: targetFounderOrigin,
    lastSecondaryFounderOrigin: secondaryFounderOrigin,
    lastTargetLineageId: targetLineageId,
    lastSecondaryLineageId: secondaryLineageId,
    lastAction: action,
    lastSecondaryAction: secondaryAction,
    lastProcessReward: processReward,
    lastLearningMomentumScore: learningMomentumScore,
  };
  writeGenesisMetaClawStateSync(next, env);
  return next;
}
