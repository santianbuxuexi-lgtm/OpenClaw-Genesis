import path from "node:path";
import { peekSystemEventEntries } from "../../infra/system-events.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { CommandLane } from "../../process/lanes.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import { readGenesisFounderQualificationSync } from "./society-query.js";
import { resolveGenesisSkillEvolutionBias } from "./skill-evolution.js";
import {
  readFreshGenesisDispatchAssignmentSync,
  readJsonDirSync,
  resolveGenesisStateDir,
  type GenesisLineageRecord,
  readGenesisLineageRecordSync,
  resolveGenesisLineageDispatchDecision,
} from "./state.js";

export type GenesisQueuePriorityDecision = {
  priority: number;
  lineageId?: string;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  ecologyState?: "active" | "stressed" | "dormant" | "extinct";
  recoveryPhase: "none" | "stabilize" | "revive" | "closure";
  recoveryStage: "stressed" | "dormant" | "extinct" | "recoverable" | null;
  recoveryBasis:
    | "transient_recovery"
    | "revive_cooperation"
    | "survival_closure"
    | "stable_recovery"
    | null;
  pendingShockPriority: number;
  reactivationPending: boolean;
  assignmentBias: number;
  skillEvolutionBias: number;
  trajectoryLearningBias: number;
  metaClawActivationBias: number;
  learningMomentumBias: number;
  recoveryQualificationBias: number;
  durableRecoveryBias: number;
  recoveryStageResponsibilityBias: number;
  recoveryStageResponsibilityRole: "leader" | "runner-up" | null;
  mortalityBackslidePenalty: number;
  mortalityEligibilityPenalty: number;
  superpowerSustainPenalty: number;
};

function resolveRecoveryPhase(params: {
  ecologyState?: GenesisQueuePriorityDecision["ecologyState"];
  reactivationPending: boolean;
  action?: "lead" | "assist" | "reactivate";
}): "none" | "stabilize" | "revive" | "closure" {
  if (params.action === "reactivate" || (params.reactivationPending && params.ecologyState === "dormant")) {
    return "revive";
  }
  if (params.ecologyState === "extinct" || (params.reactivationPending && params.ecologyState === "extinct")) {
    return "closure";
  }
  if (params.ecologyState === "stressed" || params.ecologyState === "dormant") {
    return "stabilize";
  }
  return "none";
}

function resolveRecoveryStageRoute(params: {
  ecologyState?: GenesisQueuePriorityDecision["ecologyState"];
  recoveryPhase: GenesisQueuePriorityDecision["recoveryPhase"];
}): Pick<GenesisQueuePriorityDecision, "recoveryStage" | "recoveryBasis"> {
  if (params.recoveryPhase === "closure") {
    return {
      recoveryStage: "extinct",
      recoveryBasis: "survival_closure",
    };
  }
  if (params.recoveryPhase === "revive") {
    return {
      recoveryStage: "dormant",
      recoveryBasis: "revive_cooperation",
    };
  }
  if (params.recoveryPhase === "stabilize") {
    if (params.ecologyState === "dormant") {
      return {
        recoveryStage: "recoverable",
        recoveryBasis: "stable_recovery",
      };
    }
    return {
      recoveryStage: "stressed",
      recoveryBasis: "transient_recovery",
    };
  }
  return {
    recoveryStage: null,
    recoveryBasis: null,
  };
}

function resolveEcologyPriorityDelta(ecologyState?: GenesisQueuePriorityDecision["ecologyState"]): number {
  const profile = readGenesisExperimentProfileSync(process.env);
  switch (ecologyState) {
    case "stressed":
      return profile.queueStressedEcologyPenalty;
    case "dormant":
      return profile.queueDormantEcologyPenalty;
    case "extinct":
      return profile.queueExtinctEcologyPenalty;
    default:
      return 0;
  }
}

function resolveLanePriorityDelta(lane?: string): number {
  const profile = readGenesisExperimentProfileSync(process.env);
  if (!lane) {
    return 0;
  }
  if (lane === "workflow") {
    return profile.queueWorkflowLaneBoost;
  }
  if (lane === "workflow-staggered") {
    return profile.queueWorkflowStaggeredLaneBoost;
  }
  if (lane === CommandLane.Cron) {
    return profile.queueCronLaneBoost;
  }
  if (lane === CommandLane.Subagent) {
    return profile.queueSubagentLanePenalty;
  }
  return 0;
}

function resolveGenesisQueueLineageId(params: {
  lineageId?: string;
  sessionKey?: string;
}): string | undefined {
  const explicit = params.lineageId?.trim();
  if (explicit) {
    return explicit;
  }
  const fromSession = params.sessionKey
    ? resolveAgentIdFromSessionKey(params.sessionKey)
    : undefined;
  if (!params.sessionKey) {
    return fromSession;
  }
  const directRecord = fromSession ? readGenesisLineageRecordSync(fromSession) : null;
  if (directRecord?.latestSessionKey === params.sessionKey) {
    return fromSession;
  }
  const exactRecord = readJsonDirSync<GenesisLineageRecord>(
    path.join(resolveGenesisStateDir(process.env), "lineages"),
  ).find((entry) => entry.latestSessionKey === params.sessionKey);
  return exactRecord?.lineageId ?? fromSession;
}

export function resolveGenesisQueuePriority(params: {
  sessionKey?: string;
  lane?: string;
  lineageId?: string;
}): GenesisQueuePriorityDecision {
  const profile = readGenesisExperimentProfileSync(process.env);
  const lineageId = resolveGenesisQueueLineageId(params);
  if (!lineageId) {
    return {
      priority: resolveLanePriorityDelta(params.lane),
      founderOrigin: null,
      recoveryPhase: "none",
      recoveryStage: null,
      recoveryBasis: null,
      pendingShockPriority: 0,
      reactivationPending: false,
      assignmentBias: 0,
      skillEvolutionBias: 0,
      trajectoryLearningBias: 0,
      metaClawActivationBias: 0,
      learningMomentumBias: 0,
      recoveryQualificationBias: 0,
      durableRecoveryBias: 0,
      recoveryStageResponsibilityBias: 0,
      recoveryStageResponsibilityRole: null,
      mortalityBackslidePenalty: 0,
      mortalityEligibilityPenalty: 0,
      superpowerSustainPenalty: 0,
    };
  }

  const dispatch = resolveGenesisLineageDispatchDecision(lineageId);
  const lineage = readGenesisLineageRecordSync(lineageId);
  const pendingEvents = params.sessionKey ? peekSystemEventEntries(params.sessionKey) : [];
  const assignment = params.sessionKey
    ? readFreshGenesisDispatchAssignmentSync(params.sessionKey)
    : null;
  const pendingShockPriority = pendingEvents.reduce(
    (max, event) => Math.max(max, event.priority ?? 0),
    0,
  );
  const reactivationPending = pendingEvents.some((event) => event.reactivationHint === true);
  const assignmentBias =
    typeof assignment?.assignment?.priorityBias === "number"
      ? assignment.assignment.priorityBias
      : 0;
  const skillEvolutionBias =
    resolveGenesisSkillEvolutionBias(lineageId, process.env) * profile.queueSkillEvolutionWeight;
  const founderQualification = readGenesisFounderQualificationSync(lineageId, process.env);
  const trajectoryLearningBias =
    founderQualification.trajectoryRewardScore * profile.queueTrajectoryLearningWeight;
  const metaClawActivationBias =
    founderQualification.metaClawActivationScore * profile.queueMetaClawActivationWeight;
  const learningMomentumBias =
    (founderQualification.recoveryLearningMomentumScore ??
      founderQualification.learningMomentumScore ??
      0) * profile.queueLearningMomentumWeight;
  const recoveryPhase = resolveRecoveryPhase({
    ecologyState: dispatch.ecologyState,
    reactivationPending,
    action: assignment?.assignment?.action,
  });
  const recoveryStageRoute = resolveRecoveryStageRoute({
    ecologyState: dispatch.ecologyState,
    recoveryPhase,
  });
  const recoveryQualificationCondition = recoveryPhase !== "none";
  const recoveryQualificationBase =
    recoveryPhase === "closure"
      ? founderQualification.recoveryQualificationScore * 0.18 +
        founderQualification.durableRecoveryRate * 1.25 +
        founderQualification.survivalClosureScore * 1.1 +
        founderQualification.stableRecoveryRate * 0.35 +
        founderQualification.metaClawActivationScore * 0.18
      : recoveryPhase === "revive"
        ? founderQualification.recoveryQualificationScore * 0.12 +
          founderQualification.stableRecoveryRate * 0.95 +
          founderQualification.durableRecoveryRate * 0.55 +
          founderQualification.survivalClosureScore * 0.5 +
          founderQualification.metaClawActivationScore * 0.14
        : founderQualification.recoveryQualificationScore * 0.14 +
          founderQualification.recoveryChainScore * 0.9 +
          founderQualification.transientRecoveryRate * 0.45 +
          founderQualification.stableRecoveryRate * 0.7 +
          founderQualification.metaClawActivationScore * 0.12;
  const recoveryQualificationBias = recoveryQualificationCondition
    ? Math.min(
        profile.queueRecoveryQualificationMaxBoost,
        recoveryQualificationBase * profile.queueRecoveryQualificationWeight,
      )
    : 0;
  const durableRecoveryBase =
    recoveryPhase === "closure"
      ? founderQualification.durableRecoveryScore * 0.8 +
        founderQualification.durableRecoveryRate * 1.35 +
        founderQualification.survivalClosureScore * profile.queueRecoverySurvivalClosureWeight +
        founderQualification.reviveCooperationScore * 0.2
      : recoveryPhase === "revive"
        ? founderQualification.stableRecoveryScore * 0.35 +
          founderQualification.stableRecoveryRate * 0.75 +
          founderQualification.durableRecoveryRate * 0.45 +
          founderQualification.reviveCooperationScore * 0.6 +
          founderQualification.survivalClosureScore * (profile.queueRecoverySurvivalClosureWeight * 0.65)
        : founderQualification.stableRecoveryScore * 0.25 +
          founderQualification.stableRecoveryRate * 0.55 +
          founderQualification.recoveryChainScore * profile.queueRecoveryDurableWeight +
          founderQualification.supportCooperationScore * 0.18;
  const durableRecoveryBias = recoveryQualificationCondition
    ? Math.min(profile.queueRecoveryDurableMaxBoost, durableRecoveryBase)
    : 0;
  const stageResponsibility =
    recoveryStageRoute.recoveryStage != null
      ? founderQualification.recoveryStageResponsibilities[recoveryStageRoute.recoveryStage]
      : null;
  const recoveryStageResponsibilityBias =
    recoveryQualificationCondition && stageResponsibility?.role
      ? Math.min(
          profile.queueRecoveryStageMaxBoost,
          Math.max(0, stageResponsibility.score) *
            (stageResponsibility.role === "leader"
              ? profile.queueRecoveryStageLeaderWeight
              : profile.queueRecoveryStageRunnerUpWeight),
        )
      : 0;
  const mortalityBackslidePenalty = recoveryQualificationCondition
    ? Math.min(
        profile.queueMortalityBackslidePenaltyCap,
        Math.max(
          0,
          founderQualification.mortalityScore -
            founderQualification.stableRecoveryScore -
            founderQualification.durableRecoveryScore +
            founderQualification.terminalMortalityScore *
              profile.queueTerminalMortalityPenaltyWeight,
        ) * profile.queueMortalityBackslidePenaltyWeight,
      )
    : 0;
  const recoveryEligibilityScore =
    founderQualification.stableRecoveryRate * 0.85 +
    founderQualification.durableRecoveryRate * 1.05 +
    founderQualification.recoveryChainScore * 0.7 +
    founderQualification.supportCooperationScore * 0.18 +
    founderQualification.reviveCooperationScore * 0.22 +
    founderQualification.survivalClosureScore * 0.35 +
    founderQualification.metaClawActivationScore * 0.12 -
    founderQualification.mortalityScore * 0.18 -
    founderQualification.terminalMortalityScore * profile.queueTerminalMortalityPenaltyWeight -
    founderQualification.dominancePressure * 0.2;
  const mortalityEligibilityPenalty = recoveryQualificationCondition
    ? Math.min(
        profile.queueMortalityEligibilityPenaltyCap,
        Math.max(0, profile.queueMortalityEligibilityFloor - recoveryEligibilityScore) *
          profile.queueMortalityEligibilityPenaltyWeight,
      )
    : 0;
  const superpowerSustainPenalty =
    lineage?.superpowerInherited === true
      ? Math.min(
          profile.queueSuperpowerSustainPenaltyCap,
          Math.max(
            0,
            founderQualification.mortalityDebtScore * 0.85 +
              founderQualification.childDegradationScore * 0.7 -
              founderQualification.survivalClosureScore * 0.25,
          ) * profile.queueSuperpowerSustainPenaltyWeight,
        )
      : 0;

  let priority =
    pendingShockPriority * profile.queueShockPriorityWeight +
    resolveEcologyPriorityDelta(dispatch.ecologyState) +
    resolveLanePriorityDelta(params.lane) +
    assignmentBias +
    skillEvolutionBias +
    trajectoryLearningBias +
    metaClawActivationBias +
    learningMomentumBias +
    recoveryQualificationBias +
    durableRecoveryBias -
    mortalityBackslidePenalty -
    mortalityEligibilityPenalty -
    superpowerSustainPenalty;
  priority += recoveryStageResponsibilityBias;

  if (
    reactivationPending &&
    (dispatch.ecologyState === "dormant" || dispatch.ecologyState === "extinct")
  ) {
    priority += profile.queueReactivationBoost;
  }
  if (assignment?.assignment?.action === "reactivate") {
    priority += profile.queueReactivateActionBoost;
  } else if (assignment?.assignment?.action === "lead") {
    priority += profile.queueLeadActionBoost;
  }

  return {
    priority,
    lineageId,
    founderOrigin: founderQualification.founderOrigin,
    ecologyState: dispatch.ecologyState,
    recoveryPhase,
    recoveryStage: recoveryStageRoute.recoveryStage,
    recoveryBasis: recoveryStageRoute.recoveryBasis,
    pendingShockPriority,
    reactivationPending,
    assignmentBias,
    skillEvolutionBias,
    trajectoryLearningBias,
    metaClawActivationBias,
    learningMomentumBias,
    recoveryQualificationBias,
    durableRecoveryBias,
    recoveryStageResponsibilityBias,
    recoveryStageResponsibilityRole: stageResponsibility?.role ?? null,
    mortalityBackslidePenalty,
    mortalityEligibilityPenalty,
    superpowerSustainPenalty,
  };
}
