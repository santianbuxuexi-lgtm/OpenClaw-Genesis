import path from "node:path";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import {
  readGenesisSocietyTickStateSync,
  readGenesisWorldStateSync,
  type GenesisSocietyNextPlan,
  type GenesisSocietySummary,
} from "./state.js";
import {
  readGenesisFocusSummarySnapshotSync,
  readGenesisFocusSummarySync,
  resolveGenesisFocusBias,
} from "./focus.js";
import { readGenesisEventLogSummarySnapshotSync, readGenesisEventLogSummarySync } from "./event-log.js";
import { readGenesisTrajectorySummarySnapshotSync } from "./trajectory-log.js";
import { readGenesisMetaClawStateSync } from "./meta-claw.js";
import {
  readGenesisUserIntentSummarySnapshotSync,
  readGenesisUserIntentSummarySync,
  resolveGenesisUserIntentBias,
} from "./user-intent.js";
import {
  readGenesisDispatchSummarySync,
  readGenesisSocietyPlanDetailSync,
} from "./dispatch-summary.js";
export { readGenesisSocietyPlanDetailSync } from "./dispatch-summary.js";
import {
  readGenesisLineageSummarySync,
} from "./lineage-summary.js";
import {
  readGenesisProactiveWorkSummarySync,
} from "./proactive-work.js";
import {
  readGenesisSkillEvolutionSummarySnapshotSync,
  readGenesisSkillEvolutionSummarySync,
  resolveGenesisSkillEvolutionBias,
} from "./skill-evolution.js";
import { readGenesisSkillCapabilitySummarySync } from "./skill-capability.js";
import { readGenesisLoginStatePoolSummarySync } from "./login-state-pool.js";
import { readGenesisOpenCliCapabilitySummarySnapshotSync } from "./opencli-capability.js";
import { resolveGenesisSocietyExecutionDefaultsFromInputs } from "./society-defaults.js";

type GenesisFounderOrigin = NonNullable<
  NonNullable<
    NonNullable<GenesisSocietySummary["vitalitySummary"]>["founderRoleBreakdown"][number]
  >["founderOrigin"]
>;

export type GenesisFounderQualification = {
  founderOrigin: GenesisFounderOrigin | null;
  replicationQualificationScore: number;
  replicationQualificationLeader: boolean;
  recoveryQualificationScore: number;
  recoveryQualificationLeader: boolean;
  nicheBalanceScore: number;
  nicheBalanceLeader: boolean;
  dominancePressure: number;
  trajectoryRewardScore: number;
  trajectoryRewardLeader: boolean;
  metaClawActivationScore: number;
  metaClawTargeted: boolean;
  learningMomentumScore: number;
  replicationLearningMomentumScore: number;
  recoveryLearningMomentumScore: number;
  learningActivationScore: number;
  mortalityScore: number;
  mortalityDebtScore: number;
  childDegradationScore: number;
  superpowerChildDurabilityPenaltyScore: number;
  superpowerChildDurabilityScore: number;
  longTermDegradationScore: number;
  longTermRecoveryScore: number;
  multiGenerationEffectiveScore: number;
  terminalMortalityScore: number;
  stableRecoveryScore: number;
  durableRecoveryScore: number;
  recoveryChainScore: number;
  survivalClosureScore: number;
  supportCooperationScore: number;
  reviveCooperationScore: number;
  transientRecoveryRate: number;
  stableRecoveryRate: number;
  durableRecoveryRate: number;
  recoveryStageResponsibilities: Record<
    "stressed" | "dormant" | "extinct" | "recoverable" | "stable",
    {
      score: number;
      role: "leader" | "runner-up" | null;
      basis:
        | "transient_recovery"
        | "revive_cooperation"
        | "survival_closure"
        | "stable_recovery"
        | "recovery_chain"
        | null;
    }
  >;
};

function resolveGenesisFounderOriginFromLineageId(
  lineageId: string | undefined,
): GenesisFounderOrigin | null {
  const normalized = lineageId?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const candidates = ["scout", "builder", "creator", "auditor", "negotiator"] as const;
  for (const candidate of candidates) {
    if (
      normalized === candidate ||
      normalized.startsWith(`${candidate}_`) ||
      normalized.startsWith(`${candidate}-`) ||
      normalized.startsWith(`agent:${candidate}:`)
    ) {
      return candidate;
    }
  }
  return null;
}

function roundLearningScore(value: number): number {
  return Number(value.toFixed(6));
}

function createEmptyRecoveryStageResponsibilities(): GenesisFounderQualification["recoveryStageResponsibilities"] {
  return {
    stressed: { score: 0, role: null, basis: null },
    dormant: { score: 0, role: null, basis: null },
    extinct: { score: 0, role: null, basis: null },
    recoverable: { score: 0, role: null, basis: null },
    stable: { score: 0, role: null, basis: null },
  };
}

function resolveGenesisLearningSummary(params: {
  vitalitySummary?: GenesisSocietySummary["vitalitySummary"];
  trajectorySummary?: GenesisSocietySummary["trajectorySummary"];
  metaClawSummary?: GenesisSocietySummary["metaClawSummary"];
}): GenesisSocietySummary["learningSummary"] | undefined {
  const profile = readGenesisExperimentProfileSync(process.env);
  const founderBreakdown = params.vitalitySummary?.founderRoleBreakdown ?? [];
  if (
    founderBreakdown.length === 0 &&
    !params.trajectorySummary?.highestRewardFounderOrigin &&
    !params.metaClawSummary?.lastTargetFounderOrigin
  ) {
    return undefined;
  }
  const trajectoryLeaderOrigin = params.trajectorySummary?.highestRewardFounderOrigin ?? null;
  const trajectoryLeaderScore = Math.max(
    0,
    params.trajectorySummary?.highestRewardFounderScore ?? 0,
  );
  const averageProcessReward = Math.max(
    0,
    params.trajectorySummary?.averageProcessReward ?? 0,
  );
  const metaClawTargetOrigin = params.metaClawSummary?.lastTargetFounderOrigin ?? null;
  const metaClawLastReward = Math.max(0, params.metaClawSummary?.lastProcessReward ?? 0);
  const metaClawOptimizationActive =
    (params.metaClawSummary?.lastAction ?? "none") !== "none" &&
    Boolean(metaClawTargetOrigin);
  const founderCount = Math.max(1, founderBreakdown.length);
  const baselineShare = 1 / founderCount;
  const totalLineageCount = Math.max(
    1,
    founderBreakdown.reduce((sum, entry) => sum + Math.max(0, entry.lineageCount ?? 0), 0),
  );
  const totalProactiveCount = Math.max(
    1,
    founderBreakdown.reduce(
      (sum, entry) => sum + Math.max(0, entry.proactiveWorkingLineageCount ?? 0),
      0,
    ),
  );
  const totalChildCount = Math.max(
    1,
    founderBreakdown.reduce((sum, entry) => sum + Math.max(0, entry.childCount ?? 0), 0),
  );

  const founderScores = founderBreakdown.map((entry) => {
    const trajectoryRewardBias =
      entry.founderOrigin === trajectoryLeaderOrigin
        ? trajectoryLeaderScore
        : averageProcessReward * 0.25;
    const metaClawBias =
      entry.founderOrigin === metaClawTargetOrigin
        ? 1 + metaClawLastReward * 0.3
        : metaClawOptimizationActive
          ? 0.2
          : 0;
    const learningVelocityScore =
      Math.max(0, entry.proactiveYieldEfficiency ?? 0) * 1.4 +
      Math.max(0, entry.alignedProactiveYieldScore ?? 0) * 0.45 +
      Math.max(0, entry.cooperativeYieldScore ?? 0) * 0.2 +
      Math.max(0, entry.collaborationInfluenceScore ?? 0) * 0.15 +
      Math.max(0, entry.recoveryChainScore ?? 0) * 0.15 +
      trajectoryRewardBias * 0.8 +
      metaClawBias;
    const learningConversionScore =
      learningVelocityScore * 0.35 +
      Math.max(0, entry.replicationValueScore ?? 0) * 0.25 +
      Math.max(0, entry.climateReplicationValueScore ?? 0) * 0.15 +
      Math.max(0, entry.survivalReplicationValueScore ?? 0) * 0.15 +
      Math.max(0, entry.stableRecoveryScore ?? 0) * 0.3 +
      Math.max(0, entry.durableRecoveryScore ?? 0) * 0.35 +
      Math.max(0, entry.recoveryChainScore ?? 0) * 0.4;
    const learningMomentumScore =
      trajectoryRewardBias * 0.95 +
      metaClawBias * 1.15 +
      learningVelocityScore * 0.24 +
      learningConversionScore * 0.18 +
      Math.max(0, entry.proactiveYieldEfficiency ?? 0) * 0.25 +
      Math.max(0, entry.recoveryChainScore ?? 0) * 0.15;
    const replicationLearningMomentumScore =
      learningMomentumScore *
      Math.max(
        0.35,
        0.46 +
          Math.max(0, entry.replicationValueScore ?? 0) * 0.055 +
          Math.max(0, entry.climateReplicationValueScore ?? 0) * 0.025 +
          Math.max(0, entry.survivalReplicationValueScore ?? 0) * 0.025 +
          Math.max(0, entry.leadCooperationScore ?? 0) * 0.03 +
          Math.max(0, entry.multiGenerationEffectiveScore ?? 0) * 0.028,
      );
    const recoveryLearningMomentumScore =
      metaClawBias * 1.45 +
      trajectoryRewardBias * 0.08 +
      Math.max(0, entry.stableRecoveryRate ?? 0) * 2.2 +
      Math.max(0, entry.durableRecoveryRate ?? 0) * 3 +
      Math.max(0, entry.recoveryChainScore ?? 0) * 1.15 +
      Math.max(0, entry.stableRecoveryScore ?? 0) * 0.28 +
      Math.max(0, entry.durableRecoveryScore ?? 0) * 0.42 +
      Math.max(0, entry.supportCooperationScore ?? 0) * 0.32 +
      Math.max(0, entry.reviveCooperationScore ?? 0) * 0.48 +
      Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.62 +
      Math.max(0, entry.survivalClosureScore ?? 0) * 0.4 +
      (entry.founderOrigin === metaClawTargetOrigin ? 0.65 : 0) +
      (entry.founderOrigin === params.metaClawSummary?.lastSecondaryFounderOrigin ? 0.08 : 0);
    const childCount = Math.max(0, entry.childCount ?? 0);
    const workingChildCount = Math.max(0, entry.workingChildCount ?? 0);
    const proactiveChildCount = Math.max(0, entry.proactiveChildCount ?? 0);
    const superpowerChildCount = Math.max(0, entry.superpowerChildCount ?? 0);
    const inheritanceTransferRate =
      childCount > 0 ? (workingChildCount + proactiveChildCount * 0.5) / childCount : 0;
    const superpowerInheritanceRate =
      childCount > 0 ? superpowerChildCount / childCount : 0;
    const degradedSuperpowerChildCount = Math.max(
      0,
      entry.degradedSuperpowerChildCount ??
        Math.max(0, superpowerChildCount - Math.max(0, entry.superpowerWorkingChildCount ?? 0)),
    );
    const effectiveSuperpowerInheritanceRate = Math.max(
      0,
      superpowerInheritanceRate -
        Math.max(
          0,
          entry.superpowerChildDurabilityPenaltyScore ??
            (degradedSuperpowerChildCount * 1.1 +
              Math.max(0, entry.childDegradationScore ?? 0) * 0.4 +
              Math.max(0, entry.terminalMortalityScore ?? 0) * 0.15),
        ) * profile.learningInheritanceSuperpowerDurabilityPenaltyWeight,
    );
    const superpowerChildDurabilityPenaltyScore = Math.max(
      0,
      entry.superpowerChildDurabilityPenaltyScore ??
        (degradedSuperpowerChildCount * 1.1 +
          Math.max(0, entry.childDegradationScore ?? 0) * 0.4 +
          Math.max(0, entry.terminalMortalityScore ?? 0) * 0.15),
    );
    const superpowerChildDurabilityScore = Math.max(
      0,
      entry.superpowerChildDurabilityScore ??
        Math.max(
          0,
          Math.max(
            0,
            entry.superpowerChildSustainedValueScore ??
              superpowerInheritanceRate * 1.5 + inheritanceTransferRate * 0.8,
          ) - superpowerChildDurabilityPenaltyScore,
        ),
    );
    const lineageShare = Math.max(0, entry.lineageCount ?? 0) / totalLineageCount;
    const proactiveShare =
      Math.max(0, entry.proactiveWorkingLineageCount ?? 0) / totalProactiveCount;
    const childShare = childCount / totalChildCount;
    const dominancePressure =
      Math.max(0, lineageShare * 0.45 + proactiveShare * 0.25 + childShare * 0.3 - baselineShare) /
      Math.max(0.15, 1 - baselineShare);
    const underrepresentedBoost =
      Math.max(0, baselineShare - (lineageShare * 0.55 + proactiveShare * 0.2 + childShare * 0.25)) /
      baselineShare;
    let nicheStrengthScore = 0;
    let nicheDistinctivenessScore = 0;
    let nicheResilienceScore = 0;
    let roleLeadershipBonus = 0;
    switch (entry.founderOrigin) {
      case "scout":
        nicheStrengthScore =
          Math.max(0, entry.userIntentAlignmentScore ?? 0) * 0.8 +
          Math.max(0, entry.proactiveYieldEfficiency ?? 0) * 0.7 +
          trajectoryRewardBias * 0.2;
        nicheDistinctivenessScore =
          Math.max(0, entry.userIntentAlignmentScore ?? 0) * 0.55 +
          Math.max(0, entry.historyIntentScore ?? 0) * 0.4 +
          Math.max(0, entry.timeWeightedHistoryIntentScore ?? 0) * 0.35 +
          Math.max(0, entry.activeFocusCount ?? 0) * 0.12 +
          Math.max(0, entry.activeTriggerCount ?? 0) * 0.1;
        nicheResilienceScore =
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.32 +
          Math.max(0, entry.proactiveYieldEfficiency ?? 0) * 0.22 +
          Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.16;
        roleLeadershipBonus =
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.35 +
          Math.max(0, entry.historyIntentScore ?? 0) * 0.2 +
          Math.max(0, entry.proactiveYieldEfficiency ?? 0) * 0.15;
        break;
      case "builder":
        nicheStrengthScore =
          Math.max(0, entry.replicationValueScore ?? 0) * 0.75 +
          Math.max(0, entry.cooperativeYieldScore ?? 0) * 0.65 +
          Math.max(0, entry.linkedExpansionScore ?? 0) * 0.35;
        nicheDistinctivenessScore =
          Math.max(0, entry.replicationValueScore ?? 0) * 0.45 +
          Math.max(0, entry.multiGenerationYieldEfficiency ?? 0) * 0.35 +
          Math.max(0, entry.replicationTempoScore ?? 0) * 0.18 +
          Math.max(0, entry.linkedExpansionScore ?? 0) * 0.18;
        nicheResilienceScore =
          Math.max(0, entry.cooperativeYieldScore ?? 0) * 0.2 +
          Math.max(0, entry.multiGenerationEffectiveScore ?? 0) * 0.18 +
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.08;
        roleLeadershipBonus =
          Math.max(0, entry.leadCooperationScore ?? 0) * 0.45 +
          Math.max(0, entry.multiGenerationYieldEfficiency ?? 0) * 0.3 +
          Math.max(0, entry.replicationTempoScore ?? 0) * 0.05;
        break;
      case "creator":
        nicheStrengthScore =
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.45 +
          Math.max(0, entry.reviveCooperationScore ?? 0) * 0.55 +
          Math.max(0, entry.alignedProactiveYieldScore ?? 0) * 0.35 +
          Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.18;
        nicheDistinctivenessScore =
          Math.max(0, entry.reviveCooperationScore ?? 0) * 0.52 +
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.18 +
          Math.max(0, entry.alignedProactiveYieldScore ?? 0) * 0.24 +
          Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.42 +
          Math.max(0, entry.multiGenerationEffectiveScore ?? 0) * 0.24 +
          Math.max(0, entry.interestProfileIntentScore ?? 0) * 0.14;
        nicheResilienceScore =
          Math.max(0, entry.stableRecoveryScore ?? 0) * 0.24 +
          Math.max(0, entry.durableRecoveryScore ?? 0) * 0.12 +
          Math.max(0, entry.survivalClosureScore ?? 0) * 0.3 +
          Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.28 +
          Math.max(0, entry.multiGenerationEffectiveScore ?? 0) * 0.12;
        roleLeadershipBonus =
          Math.max(0, entry.reviveCooperationScore ?? 0) * 0.4 +
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.2 +
          Math.max(0, entry.stableRecoveryScore ?? 0) * 0.15 +
          Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.08;
        break;
      case "auditor":
        nicheStrengthScore =
          Math.max(0, entry.transientRecoveryScore ?? 0) * 0.6 +
          Math.max(0, entry.mortalityScore ?? 0) * 0.25 +
          Math.max(0, entry.stableRecoveryScore ?? 0) * 0.25;
        nicheDistinctivenessScore =
          Math.max(0, entry.transientRecoveryScore ?? 0) * 0.52 +
          Math.max(0, entry.terminalMortalityScore ?? 0) * 0.5 +
          Math.max(0, entry.mortalityScore ?? 0) * 0.24 +
          Math.max(0, entry.backslidingLineageCount ?? 0) * 0.24 +
          trajectoryRewardBias * 0.14;
        nicheResilienceScore =
          Math.max(0, entry.stableRecoveryScore ?? 0) * 0.2 +
          Math.max(0, entry.durableRecoveryScore ?? 0) * 0.24 +
          Math.max(0, entry.survivalClosureScore ?? 0) * 0.18 +
          trajectoryRewardBias * 0.12;
        roleLeadershipBonus =
          Math.max(0, entry.transientRecoveryScore ?? 0) * 0.34 +
          Math.max(0, entry.terminalMortalityScore ?? 0) * 0.22 +
          trajectoryRewardBias * 0.18;
        break;
      case "negotiator":
        nicheStrengthScore =
          Math.max(0, entry.recoveryChainScore ?? 0) * 0.7 +
          Math.max(0, entry.durableRecoveryScore ?? 0) * 0.6 +
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.25 +
          Math.max(0, entry.userIntentAlignmentScore ?? 0) * 0.34 +
          Math.max(0, entry.longTermIntentAlignmentScore ?? 0) * 0.3;
        nicheDistinctivenessScore =
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.18 +
          Math.max(0, entry.recoveryChainScore ?? 0) * 0.34 +
          Math.max(0, entry.durableRecoveryScore ?? 0) * 0.22 +
          Math.max(0, entry.collaborationInfluenceScore ?? 0) * 0.3 +
          Math.max(0, entry.historyIntentScore ?? 0) * 0.38 +
          Math.max(0, entry.profileIntentScore ?? 0) * 0.18 +
          Math.max(0, entry.longTermIntentAlignmentScore ?? 0) * 0.42;
        nicheResilienceScore =
          Math.max(0, entry.durableRecoveryRate ?? 0) * 0.42 +
          Math.max(0, entry.stableRecoveryRate ?? 0) * 0.24 +
          Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.32 +
          Math.max(0, entry.survivalClosureScore ?? 0) * 0.24 +
          Math.max(0, entry.collaborationInfluenceScore ?? 0) * 0.12;
        roleLeadershipBonus =
          Math.max(0, entry.supportCooperationScore ?? 0) * 0.18 +
          Math.max(0, entry.recoveryChainScore ?? 0) * 0.28 +
          Math.max(0, entry.durableRecoveryScore ?? 0) * 0.16 +
          Math.max(0, entry.collaborationInfluenceScore ?? 0) * 0.26 +
          Math.max(0, entry.historyIntentScore ?? 0) * 0.16;
        break;
    }
    const nicheIrreplaceabilityScore = Math.max(
      0,
      nicheDistinctivenessScore * profile.founderNicheDistinctivenessWeight +
        nicheResilienceScore * profile.founderNicheResilienceWeight +
        roleLeadershipBonus * 0.2 -
        dominancePressure * 0.08,
    );
    const scarcityAlignmentBonus =
      underrepresentedBoost *
      (nicheStrengthScore * 0.25 +
        nicheIrreplaceabilityScore * 0.45 +
        roleLeadershipBonus * 0.3);
    const dominancePenaltyApplied =
      dominancePressure *
      (profile.founderDominancePenaltyWeight +
        nicheStrengthScore * profile.founderDominanceStrengthPenaltyWeight +
        roleLeadershipBonus * profile.founderDominanceRolePenaltyWeight);
    const nicheBalanceScore =
      nicheStrengthScore * profile.founderNicheStrengthWeight +
      nicheIrreplaceabilityScore * profile.founderNicheIrreplaceabilityWeight +
      roleLeadershipBonus * profile.founderRoleLeadershipWeight +
      scarcityAlignmentBonus * profile.founderScarcityAlignmentWeight +
      underrepresentedBoost * profile.founderUnderrepresentationWeight -
      dominancePenaltyApplied;
    const learningInheritanceScore =
      learningConversionScore * 0.45 +
      replicationLearningMomentumScore * 0.22 +
      inheritanceTransferRate * 1.6 +
      effectiveSuperpowerInheritanceRate * 1.2 +
      Math.max(0, entry.replicationValueScore ?? 0) * 0.2 -
      superpowerChildDurabilityPenaltyScore *
        profile.learningInheritanceSuperpowerDurabilityPenaltyWeight -
      Math.max(0, entry.childDegradationScore ?? 0) *
        profile.learningInheritanceChildDegradationWeight;
    const survivalClosureScore = Math.max(0, entry.survivalClosureScore ?? 0);
    const terminalMortalityScore = Math.max(0, entry.terminalMortalityScore ?? 0);
    const mortalityDebtScore = Math.max(
      0,
      Math.max(0, entry.dormantLineageCount ?? 0) * profile.learningMortalityDebtDormantWeight +
        Math.max(0, entry.extinctLineageCount ?? 0) * profile.learningMortalityDebtExtinctWeight +
        Math.max(0, entry.backslidingLineageCount ?? 0) * profile.learningMortalityDebtBackslideWeight +
        terminalMortalityScore * 0.6 -
        survivalClosureScore * 0.35,
    );
    const replicationQualificationScore =
      learningInheritanceScore * 0.55 +
      learningConversionScore * 0.2 +
      replicationLearningMomentumScore * 0.32 +
      Math.max(0, entry.replicationValueScore ?? 0) * 0.35 +
      Math.max(0, entry.climateReplicationValueScore ?? 0) * 0.2 +
      Math.max(0, entry.survivalReplicationValueScore ?? 0) * 0.2 +
      effectiveSuperpowerInheritanceRate * 0.9 +
      Math.max(0, nicheBalanceScore) * profile.learningReplicationNicheWeight +
      survivalClosureScore * profile.learningReplicationSurvivalClosureWeight -
      terminalMortalityScore * profile.learningReplicationTerminalPenaltyWeight -
      superpowerChildDurabilityPenaltyScore *
        profile.learningReplicationSuperpowerDurabilityPenaltyWeight -
      Math.max(0, entry.childDegradationScore ?? 0) *
        profile.learningReplicationChildDegradationWeight -
      mortalityDebtScore * 0.3;
    const recoveryQualificationScore =
      learningConversionScore * 0.08 +
      recoveryLearningMomentumScore * 0.18 +
      Math.max(0, entry.stableRecoveryScore ?? 0) * 0.14 +
      Math.max(0, entry.durableRecoveryScore ?? 0) * 0.22 +
      Math.max(0, entry.stableRecoveryRate ?? 0) * 1.7 +
      Math.max(0, entry.durableRecoveryRate ?? 0) * 2.2 +
      Math.max(0, entry.recoveryChainScore ?? 0) * 1.1 +
      Math.max(0, entry.supportCooperationScore ?? 0) * 0.2 +
      Math.max(0, entry.reviveCooperationScore ?? 0) * 0.18 +
      Math.max(0, entry.longTermRecoveryScore ?? 0) * 0.24 +
      metaClawBias * 0.16 +
      trajectoryRewardBias * 0.03 +
      Math.max(0, nicheBalanceScore) * (profile.learningRecoveryNicheWeight * 0.42) +
      survivalClosureScore * (profile.learningRecoverySurvivalClosureWeight + 0.35) -
      terminalMortalityScore * (profile.learningRecoveryTerminalPenaltyWeight + 0.18) -
      Math.max(
        0,
        0.55 -
          (Math.max(0, entry.stableRecoveryRate ?? 0) * 0.9 +
            Math.max(0, entry.durableRecoveryRate ?? 0) * 1.1 +
            Math.max(0, entry.reviveCooperationScore ?? 0) * 0.08 +
            Math.max(0, entry.supportCooperationScore ?? 0) * 0.06 +
            Math.max(0, entry.recoveryChainScore ?? 0) * 0.22),
      ) *
        1.6 -
      dominancePressure * 0.55 -
      mortalityDebtScore * 0.22;
    return {
      founderOrigin: entry.founderOrigin,
      trajectoryRewardBias: roundLearningScore(trajectoryRewardBias),
      metaClawBias: roundLearningScore(metaClawBias),
      proactiveYieldEfficiency: roundLearningScore(Math.max(0, entry.proactiveYieldEfficiency ?? 0)),
      alignedProactiveYieldScore: roundLearningScore(
        Math.max(0, entry.alignedProactiveYieldScore ?? 0),
      ),
      cooperativeYieldScore: roundLearningScore(Math.max(0, entry.cooperativeYieldScore ?? 0)),
      recoveryChainScore: roundLearningScore(Math.max(0, entry.recoveryChainScore ?? 0)),
      replicationValueScore: roundLearningScore(Math.max(0, entry.replicationValueScore ?? 0)),
      climateReplicationValueScore: roundLearningScore(
        Math.max(0, entry.climateReplicationValueScore ?? 0),
      ),
      survivalReplicationValueScore: roundLearningScore(
        Math.max(0, entry.survivalReplicationValueScore ?? 0),
      ),
      childCount,
      workingChildCount,
      proactiveChildCount,
      superpowerChildCount,
      inheritanceTransferRate: roundLearningScore(inheritanceTransferRate),
      superpowerInheritanceRate: roundLearningScore(superpowerInheritanceRate),
      superpowerChildDurabilityPenaltyScore: roundLearningScore(
        superpowerChildDurabilityPenaltyScore,
      ),
      superpowerChildDurabilityScore: roundLearningScore(superpowerChildDurabilityScore),
      longTermDegradationScore: roundLearningScore(
        Math.max(0, entry.longTermDegradationScore ?? 0),
      ),
      longTermRecoveryScore: roundLearningScore(Math.max(0, entry.longTermRecoveryScore ?? 0)),
      multiGenerationEffectiveScore: roundLearningScore(
        Math.max(0, entry.multiGenerationEffectiveScore ?? 0),
      ),
      nicheStrengthScore: roundLearningScore(nicheStrengthScore),
      nicheDistinctivenessScore: roundLearningScore(nicheDistinctivenessScore),
      nicheResilienceScore: roundLearningScore(nicheResilienceScore),
      nicheIrreplaceabilityScore: roundLearningScore(nicheIrreplaceabilityScore),
      roleLeadershipBonus: roundLearningScore(roleLeadershipBonus),
      scarcityAlignmentBonus: roundLearningScore(scarcityAlignmentBonus),
      dominancePenaltyApplied: roundLearningScore(dominancePenaltyApplied),
      underrepresentedBoost: roundLearningScore(underrepresentedBoost),
      dominancePressure: roundLearningScore(dominancePressure),
      nicheBalanceScore: roundLearningScore(nicheBalanceScore),
      mortalityDebtScore: roundLearningScore(mortalityDebtScore),
      childDegradationScore: roundLearningScore(Math.max(0, entry.childDegradationScore ?? 0)),
      terminalMortalityScore: roundLearningScore(terminalMortalityScore),
      stableRecoveryScore: roundLearningScore(Math.max(0, entry.stableRecoveryScore ?? 0)),
      durableRecoveryScore: roundLearningScore(Math.max(0, entry.durableRecoveryScore ?? 0)),
      survivalClosureScore: roundLearningScore(survivalClosureScore),
      learningVelocityScore: roundLearningScore(learningVelocityScore),
      learningConversionScore: roundLearningScore(learningConversionScore),
      learningMomentumScore: roundLearningScore(learningMomentumScore),
      replicationLearningMomentumScore: roundLearningScore(replicationLearningMomentumScore),
      recoveryLearningMomentumScore: roundLearningScore(recoveryLearningMomentumScore),
      learningInheritanceScore: roundLearningScore(learningInheritanceScore),
      replicationQualificationScore: roundLearningScore(replicationQualificationScore),
      recoveryQualificationScore: roundLearningScore(recoveryQualificationScore),
    };
  });
  const velocityLeaders = [...founderScores]
    .filter((entry) => entry.learningVelocityScore > 0)
    .sort(
      (left, right) =>
        right.learningVelocityScore - left.learningVelocityScore ||
        right.learningConversionScore - left.learningConversionScore,
    )
    .slice(0, 3);
  const conversionLeaders = [...founderScores]
    .filter((entry) => entry.learningConversionScore > 0)
    .sort(
      (left, right) =>
        right.learningConversionScore - left.learningConversionScore ||
        right.learningVelocityScore - left.learningVelocityScore,
    )
    .slice(0, 3);
  const inheritanceLeaders = [...founderScores]
    .filter((entry) => entry.learningInheritanceScore > 0)
    .sort(
      (left, right) =>
        right.learningInheritanceScore - left.learningInheritanceScore ||
        right.learningConversionScore - left.learningConversionScore,
    )
    .slice(0, 3);
  const momentumLeaders = [...founderScores]
    .filter((entry) => entry.learningMomentumScore > 0)
    .sort(
      (left, right) =>
        right.learningMomentumScore - left.learningMomentumScore ||
        right.learningVelocityScore - left.learningVelocityScore ||
        right.learningConversionScore - left.learningConversionScore,
    )
    .slice(0, 3);
  const replicationMomentumLeaders = [...founderScores]
    .filter((entry) => entry.replicationLearningMomentumScore > 0)
    .sort(
      (left, right) =>
        right.replicationLearningMomentumScore - left.replicationLearningMomentumScore ||
        right.replicationQualificationScore - left.replicationQualificationScore,
    )
    .slice(0, 3);
  const recoveryMomentumLeaders = [...founderScores]
    .filter((entry) => entry.recoveryLearningMomentumScore > 0)
    .sort(
      (left, right) =>
        right.recoveryLearningMomentumScore - left.recoveryLearningMomentumScore ||
        right.recoveryQualificationScore - left.recoveryQualificationScore,
    )
    .slice(0, 3);
  const replicationQualificationLeaders = [...founderScores]
    .filter((entry) => entry.replicationQualificationScore > 0)
    .sort(
      (left, right) =>
        right.replicationQualificationScore - left.replicationQualificationScore ||
        right.learningInheritanceScore - left.learningInheritanceScore,
    )
    .slice(0, 3);
    const recoveryQualificationLeaders = [...founderScores]
      .filter((entry) => entry.recoveryQualificationScore > 0)
      .sort(
        (left, right) =>
          right.recoveryQualificationScore - left.recoveryQualificationScore ||
          (right.durableRecoveryRate ?? 0) - (left.durableRecoveryRate ?? 0) ||
          (right.recoveryChainScore ?? 0) - (left.recoveryChainScore ?? 0) ||
          right.learningConversionScore - left.learningConversionScore,
      )
      .slice(0, 3);
  const nicheBalanceLeaders = [...founderScores]
    .filter((entry) => entry.nicheBalanceScore > 0)
    .sort(
      (left, right) =>
        right.nicheBalanceScore - left.nicheBalanceScore ||
        right.nicheIrreplaceabilityScore - left.nicheIrreplaceabilityScore ||
        right.nicheStrengthScore - left.nicheStrengthScore,
    )
    .slice(0, 5);
  const velocityLeader = velocityLeaders[0];
  const conversionLeader = conversionLeaders[0];
  const inheritanceLeader = inheritanceLeaders[0];
  const momentumLeader = momentumLeaders[0];
  const replicationMomentumLeader = replicationMomentumLeaders[0];
  const recoveryMomentumLeader = recoveryMomentumLeaders[0];
  const replicationQualificationLeader = replicationQualificationLeaders[0];
  const recoveryQualificationLeader = recoveryQualificationLeaders[0];
  const nicheBalanceLeader = nicheBalanceLeaders[0];
  return {
    learningFounderCount: founderScores.length,
    trajectoryRewardLeaderOrigin: trajectoryLeaderOrigin,
    trajectoryRewardLeaderScore: roundLearningScore(trajectoryLeaderScore),
    metaClawTargetFounderOrigin: metaClawTargetOrigin,
    metaClawOptimizationActive,
    highestLearningVelocityFounderOrigin: velocityLeader?.founderOrigin ?? null,
    highestLearningVelocityFounderScore: velocityLeader?.learningVelocityScore ?? 0,
    highestLearningConversionFounderOrigin: conversionLeader?.founderOrigin ?? null,
    highestLearningConversionFounderScore: conversionLeader?.learningConversionScore ?? 0,
    highestLearningInheritanceFounderOrigin: inheritanceLeader?.founderOrigin ?? null,
    highestLearningInheritanceFounderScore: inheritanceLeader?.learningInheritanceScore ?? 0,
    highestLearningMomentumFounderOrigin: momentumLeader?.founderOrigin ?? null,
    highestLearningMomentumFounderScore: momentumLeader?.learningMomentumScore ?? 0,
    highestReplicationLearningMomentumFounderOrigin:
      replicationMomentumLeader?.founderOrigin ?? null,
    highestReplicationLearningMomentumFounderScore:
      replicationMomentumLeader?.replicationLearningMomentumScore ?? 0,
    highestRecoveryLearningMomentumFounderOrigin:
      recoveryMomentumLeader?.founderOrigin ?? null,
    highestRecoveryLearningMomentumFounderScore:
      recoveryMomentumLeader?.recoveryLearningMomentumScore ?? 0,
    highestReplicationQualificationFounderOrigin:
      replicationQualificationLeader?.founderOrigin ?? null,
    highestReplicationQualificationFounderScore:
      replicationQualificationLeader?.replicationQualificationScore ?? 0,
    highestRecoveryQualificationFounderOrigin: recoveryQualificationLeader?.founderOrigin ?? null,
    highestRecoveryQualificationFounderScore:
      recoveryQualificationLeader?.recoveryQualificationScore ?? 0,
    nicheBalancedFounderCount: nicheBalanceLeaders.length,
    highestNicheBalanceFounderOrigin: nicheBalanceLeader?.founderOrigin ?? null,
    highestNicheBalanceFounderScore: nicheBalanceLeader?.nicheBalanceScore ?? 0,
    learningVelocityLeaders: velocityLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      learningVelocityScore: entry.learningVelocityScore,
      trajectoryRewardBias: entry.trajectoryRewardBias,
      metaClawBias: entry.metaClawBias,
      proactiveYieldEfficiency: entry.proactiveYieldEfficiency,
      alignedProactiveYieldScore: entry.alignedProactiveYieldScore,
      cooperativeYieldScore: entry.cooperativeYieldScore,
      recoveryChainScore: entry.recoveryChainScore,
    })),
    learningConversionLeaders: conversionLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      learningConversionScore: entry.learningConversionScore,
      learningVelocityScore: entry.learningVelocityScore,
      replicationValueScore: entry.replicationValueScore,
      climateReplicationValueScore: entry.climateReplicationValueScore,
      survivalReplicationValueScore: entry.survivalReplicationValueScore,
      stableRecoveryScore: entry.stableRecoveryScore,
      durableRecoveryScore: entry.durableRecoveryScore,
      recoveryChainScore: entry.recoveryChainScore,
    })),
    learningInheritanceLeaders: inheritanceLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      learningInheritanceScore: entry.learningInheritanceScore,
      learningConversionScore: entry.learningConversionScore,
      childCount: entry.childCount,
      workingChildCount: entry.workingChildCount,
      proactiveChildCount: entry.proactiveChildCount,
      superpowerChildCount: entry.superpowerChildCount,
      inheritanceTransferRate: entry.inheritanceTransferRate,
      superpowerInheritanceRate: entry.superpowerInheritanceRate,
      childDegradationScore: entry.childDegradationScore,
      superpowerChildDurabilityPenaltyScore: entry.superpowerChildDurabilityPenaltyScore,
      superpowerChildDurabilityScore: entry.superpowerChildDurabilityScore,
    })),
    learningMomentumLeaders: momentumLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      learningMomentumScore: entry.learningMomentumScore,
      replicationLearningMomentumScore: entry.replicationLearningMomentumScore,
      recoveryLearningMomentumScore: entry.recoveryLearningMomentumScore,
      trajectoryRewardBias: entry.trajectoryRewardBias,
      metaClawBias: entry.metaClawBias,
      learningVelocityScore: entry.learningVelocityScore,
      learningConversionScore: entry.learningConversionScore,
      proactiveYieldEfficiency: entry.proactiveYieldEfficiency,
      recoveryChainScore: entry.recoveryChainScore,
    })),
    replicationLearningMomentumLeaders: replicationMomentumLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      replicationLearningMomentumScore: entry.replicationLearningMomentumScore,
      learningMomentumScore: entry.learningMomentumScore,
      replicationValueScore: entry.replicationValueScore,
      climateReplicationValueScore: entry.climateReplicationValueScore,
      survivalReplicationValueScore: entry.survivalReplicationValueScore,
      leadCooperationScore: entry.leadCooperationScore,
      multiGenerationEffectiveScore: entry.multiGenerationEffectiveScore,
    })),
    recoveryLearningMomentumLeaders: recoveryMomentumLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      recoveryLearningMomentumScore: entry.recoveryLearningMomentumScore,
      learningMomentumScore: entry.learningMomentumScore,
      stableRecoveryRate: entry.stableRecoveryRate,
      durableRecoveryRate: entry.durableRecoveryRate,
      recoveryChainScore: entry.recoveryChainScore,
      supportCooperationScore: entry.supportCooperationScore,
      reviveCooperationScore: entry.reviveCooperationScore,
      longTermRecoveryScore: entry.longTermRecoveryScore,
    })),
    replicationQualificationLeaders: replicationQualificationLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      replicationQualificationScore: entry.replicationQualificationScore,
      learningInheritanceScore: entry.learningInheritanceScore,
      learningConversionScore: entry.learningConversionScore,
      learningMomentumScore: entry.learningMomentumScore,
      replicationLearningMomentumScore: entry.replicationLearningMomentumScore,
      replicationValueScore: entry.replicationValueScore,
      climateReplicationValueScore: entry.climateReplicationValueScore,
      survivalReplicationValueScore: entry.survivalReplicationValueScore,
      superpowerInheritanceRate: entry.superpowerInheritanceRate,
      mortalityDebtScore: entry.mortalityDebtScore,
      childDegradationScore: entry.childDegradationScore,
      superpowerChildDurabilityPenaltyScore: entry.superpowerChildDurabilityPenaltyScore,
      superpowerChildDurabilityScore: entry.superpowerChildDurabilityScore,
      longTermDegradationScore: entry.longTermDegradationScore,
      longTermRecoveryScore: entry.longTermRecoveryScore,
      multiGenerationEffectiveScore: entry.multiGenerationEffectiveScore,
      nicheBalanceScore: entry.nicheBalanceScore,
      nicheDistinctivenessScore: entry.nicheDistinctivenessScore,
      nicheResilienceScore: entry.nicheResilienceScore,
      nicheIrreplaceabilityScore: entry.nicheIrreplaceabilityScore,
      dominancePressure: entry.dominancePressure,
    })),
    recoveryQualificationLeaders: recoveryQualificationLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      recoveryQualificationScore: entry.recoveryQualificationScore,
      learningConversionScore: entry.learningConversionScore,
      learningMomentumScore: entry.learningMomentumScore,
      recoveryLearningMomentumScore: entry.recoveryLearningMomentumScore,
      stableRecoveryScore: entry.stableRecoveryScore,
      durableRecoveryScore: entry.durableRecoveryScore,
      recoveryChainScore: entry.recoveryChainScore,
      stableRecoveryRate: entry.stableRecoveryRate,
      durableRecoveryRate: entry.durableRecoveryRate,
      transientRecoveryRate: entry.transientRecoveryRate,
      survivalClosureScore: entry.survivalClosureScore,
      mortalityDebtScore: entry.mortalityDebtScore,
      longTermDegradationScore: entry.longTermDegradationScore,
      longTermRecoveryScore: entry.longTermRecoveryScore,
      metaClawBias: entry.metaClawBias,
      trajectoryRewardBias: entry.trajectoryRewardBias,
      nicheBalanceScore: entry.nicheBalanceScore,
      nicheDistinctivenessScore: entry.nicheDistinctivenessScore,
      nicheResilienceScore: entry.nicheResilienceScore,
      nicheIrreplaceabilityScore: entry.nicheIrreplaceabilityScore,
      dominancePressure: entry.dominancePressure,
    })),
    nicheBalanceLeaders: nicheBalanceLeaders.map((entry) => ({
      founderOrigin: entry.founderOrigin,
      nicheBalanceScore: entry.nicheBalanceScore,
      nicheStrengthScore: entry.nicheStrengthScore,
      nicheDistinctivenessScore: entry.nicheDistinctivenessScore,
      nicheResilienceScore: entry.nicheResilienceScore,
      nicheIrreplaceabilityScore: entry.nicheIrreplaceabilityScore,
      roleLeadershipBonus: entry.roleLeadershipBonus,
      scarcityAlignmentBonus: entry.scarcityAlignmentBonus,
      dominancePenaltyApplied: entry.dominancePenaltyApplied,
      underrepresentedBoost: entry.underrepresentedBoost,
      dominancePressure: entry.dominancePressure,
      mortalityDebtScore: entry.mortalityDebtScore,
    })),
  };
}

function resolveNextGenesisSocietyPlanFromSummary(
  summary: Pick<GenesisSocietySummary, "coordinationBatches">,
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietyNextPlan {
  const topBatch = summary.coordinationBatches
    .map((batch) => {
      const actionScore =
        batch.recommendedAction === "reactivate_lineages"
          ? 30
          : batch.recommendedAction === "fanout_support"
            ? 20
            : 10;
      const roleScore =
        (batch.lead ? 5 : 0) +
        batch.support.length * 2 +
        batch.revive.length * 3 +
        batch.deferredCount * 0.5;
      const focusScore = resolveGenesisFocusBias(batch.primaryAgentId, env);
      const skillScore = resolveGenesisSkillEvolutionBias(batch.primaryAgentId, env);
      const userIntentScore = resolveGenesisUserIntentBias(batch.primaryAgentId, env);
      const score =
        actionScore +
        batch.intensity * 10 +
        roleScore +
        focusScore +
        skillScore +
        userIntentScore * 0.8;
      return { batch, score };
    })
    .sort((left, right) => right.score - left.score || right.batch.updatedAt - left.batch.updatedAt)[0];
  if (!topBatch) {
    return {
      reason: "no_active_plans",
      score: 0,
      plan: null,
    };
  }
  return {
    reason: topBatch.batch.recommendedAction,
    score: topBatch.score,
    plan: readGenesisSocietyPlanDetailSync(topBatch.batch.primarySessionKey, env),
  };
}

export function readGenesisFounderQualificationSync(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisFounderQualification {
  const founderOrigin = resolveGenesisFounderOriginFromLineageId(lineageId);
  if (!founderOrigin) {
    return {
      founderOrigin: null,
      replicationQualificationScore: 0,
      replicationQualificationLeader: false,
      recoveryQualificationScore: 0,
      recoveryQualificationLeader: false,
      nicheBalanceScore: 0,
      nicheBalanceLeader: false,
      dominancePressure: 0,
      trajectoryRewardScore: 0,
      trajectoryRewardLeader: false,
      metaClawActivationScore: 0,
      metaClawTargeted: false,
      learningMomentumScore: 0,
      replicationLearningMomentumScore: 0,
      recoveryLearningMomentumScore: 0,
      learningActivationScore: 0,
      mortalityScore: 0,
      mortalityDebtScore: 0,
      childDegradationScore: 0,
      superpowerChildDurabilityPenaltyScore: 0,
      superpowerChildDurabilityScore: 0,
      longTermDegradationScore: 0,
      longTermRecoveryScore: 0,
      multiGenerationEffectiveScore: 0,
      terminalMortalityScore: 0,
      stableRecoveryScore: 0,
      durableRecoveryScore: 0,
      recoveryChainScore: 0,
      survivalClosureScore: 0,
      supportCooperationScore: 0,
      reviveCooperationScore: 0,
      transientRecoveryRate: 0,
      stableRecoveryRate: 0,
      durableRecoveryRate: 0,
      recoveryStageResponsibilities: createEmptyRecoveryStageResponsibilities(),
    };
  }
  const summary = readGenesisSocietySummarySync(env);
  const founderBreakdown =
    summary.vitalitySummary?.founderRoleBreakdown?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    ) ?? null;
  const replicationLeader =
    summary.learningSummary?.replicationQualificationLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    ) ?? null;
  const recoveryLeader =
    summary.learningSummary?.recoveryQualificationLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    ) ?? null;
  const nicheBalanceLeader =
    summary.learningSummary?.nicheBalanceLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    ) ?? null;
  const recoveryStageResponsibilities = createEmptyRecoveryStageResponsibilities();
  for (const stage of summary.vitalitySummary?.recoveryStageMap?.stages ?? []) {
    const stageKey = stage?.stage;
    if (
      stageKey !== "stressed" &&
      stageKey !== "dormant" &&
      stageKey !== "extinct" &&
      stageKey !== "recoverable" &&
      stageKey !== "stable"
    ) {
      continue;
    }
    if (stage.founderOrigin === founderOrigin) {
      recoveryStageResponsibilities[stageKey] = {
        score: stage.score ?? 0,
        role: "leader",
        basis: stage.basis ?? null,
      };
      continue;
    }
    if (stage.runnerUpFounderOrigin === founderOrigin) {
      recoveryStageResponsibilities[stageKey] = {
        score: stage.runnerUpScore ?? 0,
        role: "runner-up",
        basis: stage.basis ?? null,
      };
    }
  }
  const velocityLeader =
    summary.learningSummary?.learningVelocityLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    ) ?? null;
  const trajectoryRewardLeader =
    founderOrigin === summary.learningSummary?.trajectoryRewardLeaderOrigin;
  const trajectoryRewardScore = trajectoryRewardLeader
    ? summary.learningSummary?.trajectoryRewardLeaderScore ?? 0
    : velocityLeader?.trajectoryRewardBias ?? 0;
  const metaClawTargeted =
    founderOrigin === summary.learningSummary?.metaClawTargetFounderOrigin &&
    summary.learningSummary?.metaClawOptimizationActive === true;
  const metaClawActivationScore = metaClawTargeted ? velocityLeader?.metaClawBias ?? 1 : 0;
  const learningMomentumScore =
    summary.learningSummary?.learningMomentumLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    )?.learningMomentumScore ?? 0;
  const replicationLearningMomentumScore =
    summary.learningSummary?.replicationLearningMomentumLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    )?.replicationLearningMomentumScore ??
    summary.learningSummary?.learningMomentumLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    )?.replicationLearningMomentumScore ??
    0;
  const recoveryLearningMomentumScore =
    summary.learningSummary?.recoveryLearningMomentumLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    )?.recoveryLearningMomentumScore ??
    summary.learningSummary?.learningMomentumLeaders?.find(
      (entry) => entry.founderOrigin === founderOrigin,
    )?.recoveryLearningMomentumScore ??
    0;
  return {
    founderOrigin,
    replicationQualificationScore: replicationLeader?.replicationQualificationScore ?? 0,
    replicationQualificationLeader:
      founderOrigin === summary.learningSummary?.highestReplicationQualificationFounderOrigin,
    recoveryQualificationScore: recoveryLeader?.recoveryQualificationScore ?? 0,
    recoveryQualificationLeader:
      founderOrigin === summary.learningSummary?.highestRecoveryQualificationFounderOrigin,
    nicheBalanceScore: nicheBalanceLeader?.nicheBalanceScore ?? 0,
    nicheBalanceLeader:
      founderOrigin === summary.learningSummary?.highestNicheBalanceFounderOrigin,
    dominancePressure:
      replicationLeader?.dominancePressure ??
      recoveryLeader?.dominancePressure ??
      nicheBalanceLeader?.dominancePressure ??
      0,
    trajectoryRewardScore,
    trajectoryRewardLeader,
    metaClawActivationScore,
    metaClawTargeted,
    learningMomentumScore,
    replicationLearningMomentumScore,
    recoveryLearningMomentumScore,
    learningActivationScore: Math.max(
      0,
      Math.max(replicationLearningMomentumScore, recoveryLearningMomentumScore) * 0.9 +
        trajectoryRewardScore * 0.25 +
        metaClawActivationScore * 0.45 -
        (replicationLeader?.mortalityDebtScore ??
          recoveryLeader?.mortalityDebtScore ??
          nicheBalanceLeader?.mortalityDebtScore ??
          0) *
          readGenesisExperimentProfileSync(env).learningActivationMortalityDebtWeight,
    ),
    mortalityScore: founderBreakdown?.mortalityScore ?? 0,
    mortalityDebtScore:
      replicationLeader?.mortalityDebtScore ??
      recoveryLeader?.mortalityDebtScore ??
      nicheBalanceLeader?.mortalityDebtScore ??
      0,
    childDegradationScore:
      replicationLeader?.childDegradationScore ??
      summary.learningSummary?.learningInheritanceLeaders?.find(
        (entry) => entry.founderOrigin === founderOrigin,
      )?.childDegradationScore ??
      0,
    superpowerChildDurabilityPenaltyScore:
      replicationLeader?.superpowerChildDurabilityPenaltyScore ??
      summary.learningSummary?.learningInheritanceLeaders?.find(
        (entry) => entry.founderOrigin === founderOrigin,
      )?.superpowerChildDurabilityPenaltyScore ??
      0,
    superpowerChildDurabilityScore:
      replicationLeader?.superpowerChildDurabilityScore ??
      summary.learningSummary?.learningInheritanceLeaders?.find(
        (entry) => entry.founderOrigin === founderOrigin,
      )?.superpowerChildDurabilityScore ??
      0,
    longTermDegradationScore:
      replicationLeader?.longTermDegradationScore ??
      recoveryLeader?.longTermDegradationScore ??
      0,
    longTermRecoveryScore:
      recoveryLeader?.longTermRecoveryScore ??
      replicationLeader?.longTermRecoveryScore ??
      0,
    multiGenerationEffectiveScore: replicationLeader?.multiGenerationEffectiveScore ?? 0,
    terminalMortalityScore: founderBreakdown?.terminalMortalityScore ?? 0,
    stableRecoveryScore: founderBreakdown?.stableRecoveryScore ?? 0,
    durableRecoveryScore: founderBreakdown?.durableRecoveryScore ?? 0,
    recoveryChainScore: founderBreakdown?.recoveryChainScore ?? 0,
    survivalClosureScore: founderBreakdown?.survivalClosureScore ?? 0,
    supportCooperationScore: founderBreakdown?.supportCooperationScore ?? 0,
    reviveCooperationScore: founderBreakdown?.reviveCooperationScore ?? 0,
    transientRecoveryRate: founderBreakdown?.transientRecoveryRate ?? 0,
    stableRecoveryRate: founderBreakdown?.stableRecoveryRate ?? 0,
    durableRecoveryRate: founderBreakdown?.durableRecoveryRate ?? 0,
    recoveryStageResponsibilities,
  };
}

export function readGenesisSocietySummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietySummary {
  const world = readGenesisWorldStateSync(env);
  const tickState = readGenesisSocietyTickStateSync(env);
  const profile = readGenesisExperimentProfileSync(env);
  const skillEvolutionSummary =
    readGenesisSkillEvolutionSummarySnapshotSync(env) ?? readGenesisSkillEvolutionSummarySync(env);
  const focusSummary = readGenesisFocusSummarySnapshotSync(env) ?? readGenesisFocusSummarySync(env);
  const eventLogSummary =
    readGenesisEventLogSummarySnapshotSync(env) ?? readGenesisEventLogSummarySync(env);
  const trajectorySummary = readGenesisTrajectorySummarySnapshotSync(env);
  const metaClawSummary = readGenesisMetaClawStateSync(env);
  const userIntentSummary =
    readGenesisUserIntentSummarySnapshotSync(env) ?? readGenesisUserIntentSummarySync(env);
  const proactiveWorkSummary = readGenesisProactiveWorkSummarySync(env);
  const skillCapabilitySummary = readGenesisSkillCapabilitySummarySync(env);
  const openCliCapabilitySummary = readGenesisOpenCliCapabilitySummarySnapshotSync(env) ?? undefined;
  const loginStatePoolSummary = readGenesisLoginStatePoolSummarySync(env);
  const dispatchSummary = readGenesisDispatchSummarySync(env);
  const lineageSummary = readGenesisLineageSummarySync(env);
  const learningSummary = resolveGenesisLearningSummary({
    vitalitySummary: lineageSummary.vitalitySummary,
    trajectorySummary: trajectorySummary ?? undefined,
    metaClawSummary: metaClawSummary ?? undefined,
  });
  const nextPlan = resolveNextGenesisSocietyPlanFromSummary(dispatchSummary, env);
  const nextPlanSkillEvolutionBias = Math.max(
    0,
    nextPlan.plan ? resolveGenesisSkillEvolutionBias(nextPlan.plan.primaryAgentId, env) : 0,
  );
  const defaults = resolveGenesisSocietyExecutionDefaultsFromInputs({
    profile,
    world,
    skillEvolutionBias: nextPlanSkillEvolutionBias,
  });
  const amplificationScore =
    Math.max(0, defaults.maxTicks - profile.societyDefaultMaxTicks) +
    Math.max(0, defaults.maxActions - profile.societyDefaultMaxActions) +
    Math.max(0, defaults.maxRounds - profile.societyDefaultMaxRounds) +
    Math.max(0, defaults.maxFailureRounds - profile.societyDefaultMaxFailureRounds) +
    Math.max(0, defaults.maxStableRounds - profile.societyDefaultMaxStableRounds) +
    nextPlanSkillEvolutionBias;
  const runawayRiskScore =
    amplificationScore +
    Math.max(0, world?.currentPressure ?? 0) +
    Math.max(0, world?.stormMomentum ?? 0) +
    Math.max(0, world?.replicationBoost ?? 0) * 2;
  const phaseState =
    runawayRiskScore >= 4 ? "runaway-risk" : runawayRiskScore >= 2 ? "amplifying" : "stable";
  return {
    world,
    tickState,
    experimentSignals: {
      defaultMinIntervalMs: defaults.minIntervalMs,
      defaultMaxTicks: defaults.maxTicks,
      defaultMaxActions: defaults.maxActions,
      defaultMaxRounds: defaults.maxRounds,
      defaultMaxFailureRounds: defaults.maxFailureRounds,
      defaultMaxStableRounds: defaults.maxStableRounds,
      nextPlanSkillEvolutionBias,
      amplificationScore,
      runawayRiskScore,
      phaseState,
    },
    skillEvolutionSummary,
    focusSummary,
    eventLogSummary,
    trajectorySummary: trajectorySummary ?? undefined,
    metaClawSummary: metaClawSummary ?? undefined,
    userIntentSummary: userIntentSummary ?? undefined,
    proactiveWorkSummary,
    skillCapabilitySummary,
    openCliCapabilitySummary,
    loginStatePoolSummary,
    learningSummary,
    ...lineageSummary,
    ...dispatchSummary,
  };
}

export function readNextGenesisSocietyPlanSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietyNextPlan {
  const summary = readGenesisSocietySummarySync(env);
  return resolveNextGenesisSocietyPlanFromSummary(summary, env);
}
