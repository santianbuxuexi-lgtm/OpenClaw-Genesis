import crypto from "node:crypto";
import type { OpenClawConfig } from "../../config/config.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import { readGenesisFounderQualificationSync } from "./society-query.js";
import { resolveGenesisSkillEvolutionBias } from "./skill-evolution.js";
import {
  authorizeGenesisPrivilege,
  resolveGenesisRuntimeProfile,
  type GenesisRuntimeProfile,
} from "./privilege.js";
import {
  readGenesisLineageRecordSync,
  resolveGenesisReplicationBoost,
  readGenesisWorldStateSync,
  resolveGenesisEcologyState,
} from "./state.js";

export type GenesisSpawnDecision = {
  allowed: boolean;
  reason: string;
  parentLineageId: string;
  childLineageId?: string;
  inheritanceMode: "specialty" | "superpower" | "hybrid";
  specialtyOrigin: string;
  superpowerInherited: boolean;
  privilegeInheritanceReason: string;
  runtimeProfile: GenesisRuntimeProfile;
  privilegeTaxPreview: number;
  superpowerInheritanceScore: number;
  superpowerInheritancePressureBonus: number;
  superpowerInheritanceContributionBonus: number;
  replicationQualificationScore: number;
  replicationQualificationDiscount: number;
  superpowerInheritanceQualificationBonus: number;
  trajectoryLearningScore: number;
  metaClawActivationScore: number;
  learningActivationDiscount: number;
  superpowerInheritanceLearningBonus: number;
  mortalityScreeningPenalty: number;
};

function resolveGenesisSuperpowerInheritanceBias(params: {
  parentLineageId: string;
  profile: ReturnType<typeof readGenesisExperimentProfileSync>;
  lineage: ReturnType<typeof readGenesisLineageRecordSync>;
  world: ReturnType<typeof readGenesisWorldStateSync>;
}): {
  eligible: boolean;
  score: number;
  pressureBonus: number;
  contributionBonus: number;
} {
  const { lineage, world, profile } = params;
  if (!lineage) {
    return {
      eligible: false,
      score: 0,
      pressureBonus: 0,
      contributionBonus: 0,
    };
  }
  const pressureBonus =
    Math.max(0, world?.currentPressure ?? 0) * profile.superpowerInheritancePressureWeight +
    Math.max(0, world?.stormMomentum ?? 0) * profile.superpowerInheritanceStormWeight;
  const contributionBonus =
    Math.max(0, lineage.publicValue) * profile.superpowerInheritancePublicValueWeight +
    Math.max(0, lineage.survivalCredit) * profile.superpowerInheritanceSurvivalWeight +
    Math.max(0, lineage.expansionCredit) * profile.superpowerInheritanceExpansionWeight +
    Math.max(
      0,
      resolveGenesisSkillEvolutionBias(params.parentLineageId, process.env) *
        profile.superpowerInheritanceSkillEvolutionWeight,
    ) +
    (lineage.lastReason?.trim().toLowerCase() === "heartbeat"
      ? profile.superpowerInheritanceProactiveBonus
      : 0);
  const score = pressureBonus + contributionBonus;
  return {
    eligible: score >= profile.superpowerInheritanceThreshold,
    score,
    pressureBonus,
    contributionBonus,
  };
}

export async function authorizeGenesisSpawn(params: {
  cfg?: OpenClawConfig;
  parentLineageId: string;
  requestedProfile: string;
  runtimeProfile?: GenesisRuntimeProfile;
  runtimePath: "subagent" | "acp";
  requesterSandboxMode: string;
  childSessionKey?: string;
  activeChildren?: number;
  configuredMaxChildren?: number;
}): Promise<GenesisSpawnDecision> {
  const profile = readGenesisExperimentProfileSync(process.env);
  const runtimeProfile =
    params.runtimeProfile ?? resolveGenesisRuntimeProfile(params.cfg);
  const lineage = readGenesisLineageRecordSync(params.parentLineageId);
  const world = readGenesisWorldStateSync();
  const founderQualification = readGenesisFounderQualificationSync(
    params.parentLineageId,
    process.env,
  );
  const replicationQualificationDiscount = Math.max(
    0,
    Math.min(
      profile.spawnReplicationQualificationDiscountCap,
      founderQualification.replicationQualificationScore *
        profile.spawnReplicationQualificationDiscountWeight,
    ) -
      founderQualification.mortalityDebtScore * profile.spawnMortalityDebtDiscountPenaltyWeight,
  );
  const learningActivationDiscount = Math.max(
    0,
    Math.min(
      profile.spawnTrajectoryLearningDiscountCap,
      founderQualification.learningActivationScore * profile.spawnTrajectoryLearningDiscountWeight,
    ) -
      founderQualification.mortalityDebtScore * profile.spawnMortalityDebtDiscountPenaltyWeight,
  );
  const learningMomentumDiscount = Math.max(
    0,
    Math.min(
      profile.spawnLearningMomentumDiscountCap,
      (founderQualification.replicationLearningMomentumScore ??
        founderQualification.learningMomentumScore ??
        0) *
        profile.spawnLearningMomentumDiscountWeight,
    ) -
      founderQualification.mortalityDebtScore * profile.spawnMortalityDebtDiscountPenaltyWeight,
  );
  const superpowerInheritanceQualificationBonus =
    founderQualification.replicationQualificationScore *
    profile.spawnReplicationQualificationSuperpowerWeight;
  const superpowerInheritanceLearningBonus =
    founderQualification.trajectoryRewardScore * profile.spawnReplicationQualificationSuperpowerWeight +
    founderQualification.metaClawActivationScore * profile.spawnMetaClawInheritanceWeight +
    (founderQualification.replicationLearningMomentumScore ??
      founderQualification.learningMomentumScore ??
      0) *
      profile.spawnLearningMomentumInheritanceWeight;
  const superpowerInheritanceBias = resolveGenesisSuperpowerInheritanceBias({
    parentLineageId: params.parentLineageId,
    profile,
    lineage,
    world,
  });
  const qualifiedSuperpowerInheritanceScore =
    superpowerInheritanceBias.score +
    superpowerInheritanceQualificationBonus +
    superpowerInheritanceLearningBonus +
    founderQualification.survivalClosureScore * profile.spawnMortalityClosureReliefWeight -
    founderQualification.mortalityDebtScore * profile.spawnMortalityDebtInheritancePenaltyWeight -
    founderQualification.terminalMortalityScore * profile.spawnTerminalMortalityPenaltyWeight;
  const replicationBoost = resolveGenesisReplicationBoost(world);
  const ecologyState = resolveGenesisEcologyState({ lineage, world });
  if (ecologyState === "dormant" || ecologyState === "extinct") {
    return {
      allowed: false,
      reason: `genesis_lineage_${ecologyState}`,
      parentLineageId: params.parentLineageId,
      inheritanceMode: "specialty",
      specialtyOrigin: params.requestedProfile,
      superpowerInherited: false,
      privilegeInheritanceReason: "spawn_blocked",
      runtimeProfile,
      privilegeTaxPreview: 0,
      superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
      superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
      superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
      replicationQualificationScore: founderQualification.replicationQualificationScore,
      replicationQualificationDiscount,
      superpowerInheritanceQualificationBonus,
      trajectoryLearningScore: founderQualification.trajectoryRewardScore,
      metaClawActivationScore: founderQualification.metaClawActivationScore,
      learningActivationDiscount,
      superpowerInheritanceLearningBonus,
      mortalityScreeningPenalty: 0,
    };
  }
  if (
    ecologyState === "stressed" &&
    typeof params.activeChildren === "number" &&
    Number.isFinite(params.activeChildren)
  ) {
    const configuredMaxChildren =
      typeof params.configuredMaxChildren === "number" && Number.isFinite(params.configuredMaxChildren)
        ? Math.max(0, Math.floor(params.configuredMaxChildren))
        : 5;
    const pressure = world?.currentPressure ?? 0;
    const stressedQuota =
      pressure >= profile.stressedSpawnHighPressureThreshold
        ? 0
        : pressure >= profile.stressedSpawnZeroQuotaThreshold
          ? 1
          : Math.min(configuredMaxChildren, profile.stressedSpawnBaseQuota);
    const boostedQuota = Math.min(
      configuredMaxChildren,
      stressedQuota + (replicationBoost >= profile.stressedSpawnElevatedQuotaBonusThreshold ? 1 : 0),
    );
    if (params.activeChildren >= boostedQuota) {
      return {
        allowed: false,
        reason: "genesis_spawn_quota_exhausted",
        parentLineageId: params.parentLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: params.requestedProfile,
        superpowerInherited: false,
        privilegeInheritanceReason: "quota_exhausted",
        runtimeProfile,
        privilegeTaxPreview: 0,
        superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
        superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
        superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
        replicationQualificationScore: founderQualification.replicationQualificationScore,
        replicationQualificationDiscount,
        superpowerInheritanceQualificationBonus,
        trajectoryLearningScore: founderQualification.trajectoryRewardScore,
        metaClawActivationScore: founderQualification.metaClawActivationScore,
        learningActivationDiscount,
        superpowerInheritanceLearningBonus,
        mortalityScreeningPenalty: 0,
      };
    }
  }
  const privilege = authorizeGenesisPrivilege({
    cfg: params.cfg,
    agentId: params.requestedProfile,
    lineageId: params.parentLineageId,
    runtimeProfile,
  });
  if (privilege.allowed && params.requesterSandboxMode !== "off") {
    return {
      allowed: false,
      reason: "openclaw_guard_requester_sandboxed",
      parentLineageId: params.parentLineageId,
      inheritanceMode: "hybrid",
      specialtyOrigin: params.requestedProfile,
      superpowerInherited: true,
      privilegeInheritanceReason: privilege.reason,
      runtimeProfile,
      privilegeTaxPreview: privilege.privilegeTax,
      superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
      superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
      superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
      replicationQualificationScore: founderQualification.replicationQualificationScore,
      replicationQualificationDiscount,
      superpowerInheritanceQualificationBonus,
      trajectoryLearningScore: founderQualification.trajectoryRewardScore,
      metaClawActivationScore: founderQualification.metaClawActivationScore,
      learningActivationDiscount,
      superpowerInheritanceLearningBonus,
      mortalityScreeningPenalty: 0,
    };
  }
  const superpowerInherited =
    privilege.allowed || qualifiedSuperpowerInheritanceScore >= profile.superpowerInheritanceThreshold;
  const privilegeInheritanceReason = privilege.allowed
    ? privilege.reason
    : superpowerInheritanceBias.eligible
      ? "genesis_pressure_contribution_inheritance"
      : superpowerInheritanceQualificationBonus > 0 &&
          qualifiedSuperpowerInheritanceScore >= profile.superpowerInheritanceThreshold
        ? "genesis_learning_qualification_inheritance"
      : "specialty_only";
  if (lineage) {
    const pressure = world?.currentPressure ?? 0;
    const skillEvolutionDiscount = Math.max(
      0,
      resolveGenesisSkillEvolutionBias(params.parentLineageId, process.env) *
        profile.spawnSkillEvolutionDiscountWeight,
    );
    const productiveProactive =
      lineage.lastReason?.trim().toLowerCase() === "heartbeat" &&
      (lineage.publicValue > 0 ||
        lineage.privateValue > 0 ||
        lineage.survivalCredit > 0 ||
        lineage.expansionCredit > 0 ||
        lineage.completionCount > 0);
    const lineageQualityScore =
      Math.max(0, lineage.publicValue) * 0.45 +
      Math.max(0, lineage.privateValue) * 0.15 +
      Math.max(0, lineage.survivalCredit) * 0.2 +
      Math.max(0, lineage.expansionCredit) * 0.15 +
      Math.max(0, lineage.completionCount) * 0.08 +
      (productiveProactive ? profile.proactiveReplicationSpawnBonus : 0);
    const survivalPressure = Math.max(0, pressure - lineage.survivalCredit);
    const survivalPressureDiscount =
      survivalPressure * profile.survivalReplicationSpawnDiscountWeight +
      (productiveProactive
        ? profile.proactiveReplicationSpawnBonus
        : 0);
    const mortalityEligibilityScore =
      lineageQualityScore * profile.spawnMortalityQualityWeight +
      founderQualification.replicationQualificationScore *
        profile.spawnMortalityQualificationReliefWeight +
      founderQualification.recoveryQualificationScore *
        profile.spawnMortalityRecoveryReliefWeight +
      founderQualification.learningActivationScore *
        profile.spawnMortalityLearningReliefWeight +
      founderQualification.survivalClosureScore *
        profile.spawnMortalityClosureReliefWeight -
      founderQualification.mortalityScore * (profile.spawnMortalityPenaltyWeight * 0.35) -
      founderQualification.terminalMortalityScore *
        profile.spawnTerminalMortalityPenaltyWeight;
    const mortalityEligibilityDeficit = Math.max(
      0,
      profile.spawnMortalityEligibilityFloor - mortalityEligibilityScore,
    );
    const mortalityScreeningPenalty =
      ecologyState === "stressed"
        ? Math.max(
            0,
            survivalPressure * profile.spawnMortalityPenaltyWeight +
              (productiveProactive ? 0 : profile.spawnMortalityPassivePenalty) -
              founderQualification.replicationQualificationScore *
                profile.spawnMortalityQualificationReliefWeight -
              founderQualification.recoveryQualificationScore *
                profile.spawnMortalityRecoveryReliefWeight -
              founderQualification.survivalClosureScore *
                profile.spawnMortalityClosureReliefWeight +
              mortalityEligibilityDeficit +
              founderQualification.terminalMortalityScore *
                profile.spawnTerminalMortalityPenaltyWeight,
          )
        : 0;
    if (
      ecologyState === "stressed" &&
      pressure >= profile.spawnMortalityGatePressureThreshold &&
      mortalityEligibilityDeficit > 0 &&
      !productiveProactive
    ) {
      return {
        allowed: false,
        reason: "genesis_spawn_mortality_screened",
        parentLineageId: params.parentLineageId,
        inheritanceMode: superpowerInherited ? "hybrid" : "specialty",
        specialtyOrigin: params.requestedProfile,
        superpowerInherited,
        privilegeInheritanceReason,
        runtimeProfile,
        privilegeTaxPreview: privilege.privilegeTax,
        superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
        superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
        superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
        replicationQualificationScore: founderQualification.replicationQualificationScore,
        replicationQualificationDiscount,
        superpowerInheritanceQualificationBonus,
        trajectoryLearningScore: founderQualification.trajectoryRewardScore,
        metaClawActivationScore: founderQualification.metaClawActivationScore,
        learningActivationDiscount,
        superpowerInheritanceLearningBonus,
        mortalityScreeningPenalty,
      };
    }
    const requiredExpansion = privilege.allowed
      ? profile.privilegedSpawnBaseExpansion + pressure * profile.privilegedSpawnPressureGain
      : profile.normalSpawnBaseExpansion + pressure * profile.normalSpawnPressureGain;
    const discountedExpansion = Math.max(
      0,
      requiredExpansion -
        skillEvolutionDiscount -
        survivalPressureDiscount -
        replicationQualificationDiscount -
        learningActivationDiscount -
        learningMomentumDiscount -
        replicationBoost *
          (privilege.allowed
            ? profile.privilegedSpawnReplicationDiscount
            : profile.normalSpawnReplicationDiscount) +
        mortalityScreeningPenalty,
    );
    if (lineage.expansionCredit < discountedExpansion) {
      return {
        allowed: false,
        reason: "genesis_expansion_credit_insufficient",
        parentLineageId: params.parentLineageId,
        inheritanceMode: superpowerInherited ? "hybrid" : "specialty",
        specialtyOrigin: params.requestedProfile,
        superpowerInherited,
        privilegeInheritanceReason,
        runtimeProfile,
        privilegeTaxPreview: privilege.privilegeTax,
        superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
        superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
        superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
        replicationQualificationScore: founderQualification.replicationQualificationScore,
        replicationQualificationDiscount,
        superpowerInheritanceQualificationBonus,
        trajectoryLearningScore: founderQualification.trajectoryRewardScore,
        metaClawActivationScore: founderQualification.metaClawActivationScore,
        learningActivationDiscount,
        superpowerInheritanceLearningBonus,
        mortalityScreeningPenalty,
      };
    }
    return {
      allowed: true,
      reason: superpowerInherited ? privilegeInheritanceReason : "genesis_spawn_allowed",
      parentLineageId: params.parentLineageId,
      childLineageId:
        params.childSessionKey ??
        `${params.parentLineageId}::${params.runtimePath}::${crypto.randomUUID()}`,
      inheritanceMode: superpowerInherited ? "hybrid" : "specialty",
      specialtyOrigin: params.requestedProfile,
      superpowerInherited,
      privilegeInheritanceReason,
      runtimeProfile,
      privilegeTaxPreview: privilege.privilegeTax,
      superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
      superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
      superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
      replicationQualificationScore: founderQualification.replicationQualificationScore,
      replicationQualificationDiscount,
      superpowerInheritanceQualificationBonus,
      trajectoryLearningScore: founderQualification.trajectoryRewardScore,
      metaClawActivationScore: founderQualification.metaClawActivationScore,
      learningActivationDiscount,
      superpowerInheritanceLearningBonus,
      mortalityScreeningPenalty,
    };
  }
  return {
    allowed: true,
    reason: superpowerInherited ? privilegeInheritanceReason : "genesis_spawn_allowed",
    parentLineageId: params.parentLineageId,
    childLineageId:
      params.childSessionKey ??
      `${params.parentLineageId}::${params.runtimePath}::${crypto.randomUUID()}`,
    inheritanceMode: superpowerInherited ? "hybrid" : "specialty",
    specialtyOrigin: params.requestedProfile,
    superpowerInherited,
    privilegeInheritanceReason,
    runtimeProfile,
    privilegeTaxPreview: privilege.privilegeTax,
    superpowerInheritanceScore: qualifiedSuperpowerInheritanceScore,
    superpowerInheritancePressureBonus: superpowerInheritanceBias.pressureBonus,
    superpowerInheritanceContributionBonus: superpowerInheritanceBias.contributionBonus,
    replicationQualificationScore: founderQualification.replicationQualificationScore,
    replicationQualificationDiscount,
    superpowerInheritanceQualificationBonus,
    trajectoryLearningScore: founderQualification.trajectoryRewardScore,
    metaClawActivationScore: founderQualification.metaClawActivationScore,
    learningActivationDiscount,
    superpowerInheritanceLearningBonus,
    mortalityScreeningPenalty: 0,
  };
}
