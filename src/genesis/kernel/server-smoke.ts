import type { GenesisSocietySummary } from "./state.js";

type GenesisServerSmokeSummaryEnvelope = {
  summary?: GenesisSocietySummary | null;
  genesisSummary?: GenesisSocietySummary | null;
};

type GenesisServerSmokeTickEnvelope = {
  decision?: string | null;
  tickState?: {
    runCount?: number | null;
  } | null;
};

type GenesisServerSmokePumpEnvelope = {
  ticks?: unknown[] | null;
  finalState?: {
    runCount?: number | null;
  } | null;
};

type GenesisServerSmokeProbeEnvelope = {
  pump?: GenesisServerSmokePumpEnvelope | null;
  summary?: GenesisServerSmokeSummaryEnvelope | GenesisSocietySummary | null;
};

type GenesisServerSmokeRecoveryQueueEntry = {
  label?: string | null;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  ecologyState?: "active" | "stressed" | "dormant" | "extinct" | null;
  recoveryPhase?: "none" | "stabilize" | "revive" | "closure" | null;
  recoveryStage?: "stressed" | "dormant" | "extinct" | "recoverable" | "stable" | null;
  recoveryBasis?:
    | "transient_recovery"
    | "revive_cooperation"
    | "survival_closure"
    | "stable_recovery"
    | "recovery_chain"
    | null;
  priority?: number | null;
  recoveryQualificationBias?: number | null;
  durableRecoveryBias?: number | null;
  recoveryStageResponsibilityBias?: number | null;
  recoveryStageResponsibilityRole?: "leader" | "runner-up" | null;
  mortalityBackslidePenalty?: number | null;
  superpowerSustainPenalty?: number | null;
  stageLeaderFounderOrigin?: string | null;
  stageRunnerUpFounderOrigin?: string | null;
};

export type GenesisServerSmokeAssessment = {
  seededPlan: boolean;
  seededVitality: boolean;
  tickDecision: string | null;
  tickRan: boolean;
  pumpTickCount: number;
  pumpRan: boolean;
  collaborationVisible: boolean;
  collaborationEffective: boolean;
  collaborationYieldVisible: boolean;
  vitalityVisible: boolean;
  workEffectVisible: boolean;
  proactiveEffectVisible: boolean;
  proactiveSpecializationVisible: boolean;
  founderYieldVisible: boolean;
  founderYieldEfficiencyVisible: boolean;
  proactiveYieldLeadersVisible: boolean;
  trajectoryVisible: boolean;
  metaClawVisible: boolean;
  learningActivationVisible: boolean;
  nicheBalanceVisible: boolean;
  userIntentVisible: boolean;
  userIntentModelVisible: boolean;
  historyDrivenProactiveVisible: boolean;
  userProfileDrivenFocusVisible: boolean;
  replicationEffectVisible: boolean;
  replicationPressureVisible: boolean;
  replicationLeaderVisible: boolean;
  replicationTempoVisible: boolean;
  climateReplicationVisible: boolean;
  survivalReplicationVisible: boolean;
  expansionLinkVisible: boolean;
  expansionInfluenceVisible: boolean;
  collaborationInfluenceVisible: boolean;
  cooperativeYieldVisible: boolean;
  roleCooperationVisible: boolean;
  mortalityVisible: boolean;
  terminalMortalityVisible: boolean;
  recoveryVisible: boolean;
  stableRecoveryVisible: boolean;
  durableRecoveryVisible: boolean;
  transientRecoveryVisible: boolean;
  recoveryChainVisible: boolean;
  survivalClosureVisible: boolean;
  recoveryStageMapVisible: boolean;
  recoveryQueueVisible: boolean;
  climateChildYieldVisible: boolean;
  survivalChildYieldVisible: boolean;
  specialtyInheritanceVisible: boolean;
  superpowerInheritanceVisible: boolean;
  specialtyChildValueVisible: boolean;
  superpowerChildValueVisible: boolean;
  childYieldEfficiencyVisible: boolean;
  childYieldComparisonVisible: boolean;
  multiGenerationVisible: boolean;
  multiGenerationValueVisible: boolean;
  pressureAmplifiedSuperpowerVisible: boolean;
  runCountDelta: {
    tick: number;
    pump: number;
    followupPump: number;
    total: number;
  };
  activeDispatchDelta: number;
  amplificationDelta: number | null;
  runawayRiskDelta: number | null;
  phaseState: GenesisSocietySummary["experimentSignals"]["phaseState"] | null;
  assertions: Array<{
    key:
      | "tick_progressed"
      | "pump_progressed"
      | "followup_progressed"
      | "probe_progressed"
      | "phase_signal_visible"
      | "collaboration_visible"
      | "collaboration_effective"
      | "collaboration_yield_visible"
      | "vitality_visible"
      | "work_effect_visible"
      | "proactive_effect_visible"
      | "proactive_specialization_visible"
      | "founder_yield_visible"
      | "trajectory_visible"
      | "metaclaw_visible"
      | "learning_activation_visible"
      | "niche_balance_visible"
      | "user_intent_visible"
      | "user_intent_model_visible"
      | "history_driven_proactive_visible"
      | "user_profile_focus_visible"
      | "replication_effect_visible"
      | "expansion_link_visible"
      | "expansion_influence_visible"
      | "collaboration_influence_visible"
      | "cooperative_yield_visible"
      | "role_cooperation_visible"
      | "mortality_visible"
      | "terminal_mortality_visible"
      | "recovery_visible"
      | "stable_recovery_visible"
      | "durable_recovery_visible"
      | "transient_recovery_visible"
      | "recovery_chain_visible"
      | "survival_closure_visible"
      | "recovery_stage_map_visible"
      | "recovery_queue_visible"
      | "climate_child_yield_visible"
      | "survival_child_yield_visible"
      | "specialty_inheritance_visible"
      | "superpower_inheritance_visible"
      | "specialty_child_value_visible"
      | "superpower_child_value_visible"
      | "multigeneration_visible"
      | "multigeneration_value_visible";
    ok: boolean;
    detail: string;
  }>;
  trend: {
    runCountSeries: number[];
    runawayRiskSeries: number[];
    phaseSeries: Array<GenesisSocietySummary["experimentSignals"]["phaseState"]>;
    riskDirection: "falling" | "flat" | "rising";
    state:
      | "stalled"
      | "steady"
      | "advancing"
      | "threshold-building"
      | "runaway-pressure";
  };
  progressed: boolean;
  verdict: "ok" | "needs-attention";
};

export function assessGenesisServerSmoke(params: {
  societySummary?: GenesisSocietySummary | GenesisServerSmokeSummaryEnvelope | null;
  seededPlan?: unknown;
  seededVitality?: unknown;
  tick?: GenesisServerSmokeTickEnvelope | null;
  postTickSociety?: GenesisServerSmokeSummaryEnvelope | GenesisSocietySummary | null;
  pump?: GenesisServerSmokePumpEnvelope | null;
  postPumpSociety?: GenesisServerSmokeSummaryEnvelope | GenesisSocietySummary | null;
  followupPump?: GenesisServerSmokePumpEnvelope | null;
  postFollowupSociety?: GenesisServerSmokeSummaryEnvelope | GenesisSocietySummary | null;
  probePumps?: GenesisServerSmokeProbeEnvelope[] | null;
  postIdleSociety?: GenesisServerSmokeSummaryEnvelope | GenesisSocietySummary | null;
  recoveryQueueReport?: GenesisServerSmokeRecoveryQueueEntry[] | null;
}): GenesisServerSmokeAssessment {
  const initialSummary = resolveSummary(params.societySummary);
  const postTickSummary = resolveSummary(params.postTickSociety);
  const postPumpSummary = resolveSummary(params.postPumpSociety);
  const postFollowupSummary = resolveSummary(params.postFollowupSociety);
  const postIdleSummary = resolveSummary(params.postIdleSociety);

  const initialRunCount = resolveRunCount(initialSummary);
  const postTickRunCount =
    resolveRunCount(postTickSummary) ??
    resolveNullableNumber(params.tick?.tickState?.runCount) ??
    initialRunCount;
  const postPumpRunCount =
    resolveRunCount(postPumpSummary) ?? resolveNullableNumber(params.pump?.finalState?.runCount);
  const postFollowupRunCount =
    resolveRunCount(postFollowupSummary) ??
    resolveNullableNumber(params.followupPump?.finalState?.runCount) ??
    postPumpRunCount;
  const probeRunCounts = (params.probePumps ?? []).map((probe) =>
    resolveRunCount(resolveSummary(probe.summary)) ??
    resolveNullableNumber(probe.pump?.finalState?.runCount) ??
    postFollowupRunCount,
  );

  const tickRunDelta = safeDelta(initialRunCount, postTickRunCount);
  const pumpRunDelta = safeDelta(postTickRunCount, postPumpRunCount);
  const followupPumpRunDelta = safeDelta(postPumpRunCount ?? postTickRunCount, postFollowupRunCount);
  const probePumpRunDelta = safeDelta(postFollowupRunCount, probeRunCounts[probeRunCounts.length - 1] ?? postFollowupRunCount);
  const totalRunDelta = safeDelta(
    initialRunCount,
    probeRunCounts[probeRunCounts.length - 1] ??
      postFollowupRunCount ??
      postPumpRunCount ??
      postTickRunCount,
  );

  const initialActiveDispatchCount = resolveNullableNumber(initialSummary?.activeDispatchCount);
  const finalSummary =
    postIdleSummary ??
    resolveSummary(params.probePumps?.[params.probePumps.length - 1]?.summary) ??
    postFollowupSummary ??
    postPumpSummary ??
    postTickSummary ??
    initialSummary;
  const postPumpActiveDispatchCount = resolveNullableNumber(finalSummary?.activeDispatchCount);

  const initialSignals = initialSummary?.experimentSignals;
  const finalSignals = finalSummary?.experimentSignals ?? initialSignals;
  const collaborationSummary = finalSummary?.collaborationSummary ?? initialSummary?.collaborationSummary;
  const vitalitySummary = finalSummary?.vitalitySummary ?? initialSummary?.vitalitySummary;
  const trajectorySummary =
    finalSummary?.trajectorySummary ??
    postFollowupSummary?.trajectorySummary ??
    postPumpSummary?.trajectorySummary ??
    postTickSummary?.trajectorySummary ??
    initialSummary?.trajectorySummary;
  const metaClawSummary =
    finalSummary?.metaClawSummary ??
    postFollowupSummary?.metaClawSummary ??
    postPumpSummary?.metaClawSummary ??
    postTickSummary?.metaClawSummary ??
    initialSummary?.metaClawSummary;
  const learningSummary =
    finalSummary?.learningSummary ??
    postFollowupSummary?.learningSummary ??
    postPumpSummary?.learningSummary ??
    postTickSummary?.learningSummary ??
    initialSummary?.learningSummary;
  const recoveryQueueReport = params.recoveryQueueReport ?? [];
  const userIntentSummary =
    finalSummary?.userIntentSummary ??
    postFollowupSummary?.userIntentSummary ??
    postPumpSummary?.userIntentSummary ??
    postTickSummary?.userIntentSummary ??
    initialSummary?.userIntentSummary;

  const tickDecision = params.tick?.decision?.trim() || null;
  const tickRan = tickDecision === "ran" || tickRunDelta > 0;
  const pumpTickCount = Array.isArray(params.pump?.ticks) ? params.pump?.ticks.length : 0;
  const pumpRan = pumpTickCount > 0 || pumpRunDelta > 0;
  const followupPumpTickCount = Array.isArray(params.followupPump?.ticks)
    ? params.followupPump?.ticks.length
    : 0;
  const followupRan = followupPumpTickCount > 0 || followupPumpRunDelta > 0;
  const probePumpTickCount = (params.probePumps ?? []).reduce((sum, probe) => {
    return sum + (Array.isArray(probe.pump?.ticks) ? probe.pump?.ticks.length : 0);
  }, 0);
  const probeRan = probePumpTickCount > 0 || probePumpRunDelta > 0;
  const phaseState = finalSignals?.phaseState ?? null;
  const collaborationVisible = Boolean(
    (collaborationSummary?.activePlanCount ?? 0) > 0 &&
      (collaborationSummary?.collaborativePlanCount ?? 0) > 0 &&
      (collaborationSummary?.mobilizedAgentCount ?? 0) >= 3 &&
      (collaborationSummary?.averageMobilizedCoverageRatio ?? 0) >= 0.8 &&
      (collaborationSummary?.leadAssignmentCount ?? 0) >= 1 &&
      (collaborationSummary?.supportAssignmentCount ?? 0) >= 1 &&
      (collaborationSummary?.reviveAssignmentCount ?? 0) >= 1,
  );
  const collaborationEffective = Boolean(
    (collaborationSummary?.productiveMobilizedLineageCount ?? 0) >= 2 &&
      (collaborationSummary?.productiveSupportLineageCount ?? 0) >= 1 &&
      (collaborationSummary?.productiveAssignmentCoverageRatio ?? 0) > 0 &&
      (collaborationSummary?.collaborationEffectScore ?? 0) > 0,
  );
  const collaborationYieldVisible = Boolean(
    (collaborationSummary?.leadYieldScore ?? 0) > 0 &&
      (collaborationSummary?.supportYieldScore ?? 0) > 0 &&
      (collaborationSummary?.productiveAssignmentCoverageRatio ?? 0) >= 0.5,
  );
  const vitalityVisible = Boolean(
    (vitalitySummary?.lineageCount ?? 0) > 0 &&
      ((vitalitySummary?.proactiveReadyLineageCount ?? 0) > 0 ||
        (vitalitySummary?.childLineageCount ?? 0) > 0),
  );
  const workEffectVisible = Boolean(
    (vitalitySummary?.workingLineageCount ?? 0) >= 2 &&
      (vitalitySummary?.totalPublicValue ?? 0) > 0 &&
      (vitalitySummary?.totalSurvivalCredit ?? 0) > 0,
  );
  const proactiveEffectVisible = Boolean(
    (vitalitySummary?.proactiveWorkingLineageCount ?? 0) >= 1 &&
      (vitalitySummary?.activeTriggerCount ?? 0) >= 1,
  );
  const proactiveSpecializationVisible = Boolean(
    (vitalitySummary?.roleAlignedProactiveLineageCount ?? 0) >= 2 &&
      (vitalitySummary?.founderRoleCoverageCount ?? 0) >= 2 &&
      (vitalitySummary?.proactiveSpecializationScore ?? 0) > 0,
  );
  const founderYieldVisible = Boolean(
    (vitalitySummary?.founderYieldCoverageCount ?? 0) >= 3 &&
      (vitalitySummary?.roleAlignedProactiveYieldScore ?? 0) > 0,
  );
  const founderYieldEfficiencyVisible = Boolean(
    ((vitalitySummary?.highestYieldFounderOrigin ?? null) &&
      (vitalitySummary?.highestYieldFounderScore ?? 0) > 0) ||
      (vitalitySummary?.founderRoleBreakdown ?? []).some(
        (entry) =>
          (entry.proactiveYieldEfficiency ?? 0) > 0 ||
          (entry.alignedProactiveYieldScore ?? 0) > 0,
      ),
  );
  const proactiveYieldLeadersVisible = Boolean(
    (vitalitySummary?.proactiveYieldLeaders?.length ?? 0) >= 2 ||
      (vitalitySummary?.founderRoleBreakdown ?? []).filter(
        (entry) =>
          (entry.proactiveYieldEfficiency ?? 0) > 0 ||
          (entry.alignedProactiveYieldScore ?? 0) > 0,
      ).length >= 2,
  );
  const trajectoryVisible = Boolean(
    (trajectorySummary?.recentTrajectoryCount ?? 0) > 0 &&
      ((trajectorySummary?.highestRewardFounderOrigin ?? null) ||
        (trajectorySummary?.averageProcessReward ?? 0) > 0),
  );
  const metaClawVisible = Boolean(
    (metaClawSummary?.idleOptimizationCount ?? 0) > 0 &&
      (metaClawSummary?.lastAction ?? "none") !== "none" &&
      Boolean(metaClawSummary?.lastTargetFounderOrigin),
  );
  const learningActivationVisible = Boolean(
    Boolean(learningSummary?.trajectoryRewardLeaderOrigin) &&
      Boolean(learningSummary?.metaClawTargetFounderOrigin) &&
      learningSummary?.metaClawOptimizationActive === true,
  );
  const nicheBalanceVisible = Boolean(
    (learningSummary?.nicheBalancedFounderCount ?? 0) >= 3 &&
      Boolean(learningSummary?.highestNicheBalanceFounderOrigin),
  );
  const userIntentVisible = Boolean(
    (userIntentSummary?.historyEntryCount ?? 0) > 0 &&
      userIntentSummary?.profileVisible === true &&
      Boolean(userIntentSummary?.highestIntentFounderOrigin),
  );
  const userIntentModelVisible = Boolean(
    (userIntentSummary?.timeWeightedHistorySignalScore ?? 0) > 0 &&
      (userIntentSummary?.workProfileSignalScore ?? 0) > 0 &&
      Boolean(userIntentSummary?.strongestTopicCluster) &&
      (userIntentSummary?.longTermIntentFounderCount ?? 0) > 0 &&
      Boolean(userIntentSummary?.highestLongTermIntentFounderOrigin),
  );
  const historyDrivenProactiveVisible = Boolean(
    (vitalitySummary?.historyDrivenProactiveLineageCount ?? 0) > 0 &&
      (userIntentSummary?.historySignalScore ?? 0) > 0,
  );
  const userProfileDrivenFocusVisible = Boolean(
    (vitalitySummary?.userProfileDrivenProactiveLineageCount ?? 0) > 0 &&
      (userIntentSummary?.profileSignalScore ?? 0) > 0,
  );
  const replicationEffectVisible = Boolean(
    (vitalitySummary?.childWorkingLineageCount ?? 0) >= 1 &&
      (vitalitySummary?.replicatingWorkingParentCount ?? 0) >= 1 &&
      (vitalitySummary?.autonomousExpansionScore ?? 0) > 0,
  );
  const replicationPressureVisible = Boolean(
    (vitalitySummary?.climateReplicationPressureScore ?? 0) > 0 &&
      (vitalitySummary?.productiveReplicationCapacityScore ?? 0) > 0,
  );
  const replicationLeaderVisible = Boolean(
    ((vitalitySummary?.highestReplicationFounderOrigin ?? null) &&
      (vitalitySummary?.highestReplicationFounderScore ?? 0) > 0) ||
      (vitalitySummary?.replicationLeaders?.length ?? 0) >= 1,
  );
  const replicationTempoVisible = Boolean(
    ((vitalitySummary?.highestReplicationTempoFounderOrigin ?? null) &&
      (vitalitySummary?.highestReplicationTempoFounderScore ?? 0) > 0) ||
      (vitalitySummary?.replicationTempoLeaders?.length ?? 0) >= 1 ||
      (vitalitySummary?.replicationTriggerFrequencyScore ?? 0) > 0 ||
      (vitalitySummary?.replicationSpeedScore ?? 0) > 0,
  );
  const climateReplicationVisible = Boolean(
    (vitalitySummary?.climateResponsiveReplicationParentCount ?? 0) > 0 ||
      (vitalitySummary?.climatePressuredChildCount ?? 0) > 0 ||
      ((vitalitySummary?.highestClimateReplicationFounderOrigin ?? null) &&
        (vitalitySummary?.highestClimateReplicationFounderScore ?? 0) > 0) ||
      (vitalitySummary?.climateReplicationLeaders?.length ?? 0) > 0,
  );
  const survivalReplicationVisible = Boolean(
      (vitalitySummary?.survivalResponsiveReplicationParentCount ?? 0) > 0 ||
        (vitalitySummary?.survivalPressuredChildCount ?? 0) > 0 ||
        ((vitalitySummary?.highestSurvivalReplicationFounderOrigin ?? null) &&
          (vitalitySummary?.highestSurvivalReplicationFounderScore ?? 0) > 0) ||
        (vitalitySummary?.survivalReplicationLeaders?.length ?? 0) > 0,
    );
  const expansionLinkVisible = Boolean(
    (vitalitySummary?.collaborativeExpansionFounderCount ?? 0) > 0 ||
      (vitalitySummary?.crossFounderExpansionLinkCount ?? 0) > 0 ||
      (vitalitySummary?.crossFounderExpansionScore ?? 0) > 0 ||
      (vitalitySummary?.expansionLinkLeaders?.length ?? 0) > 0,
  );
  const expansionInfluenceVisible = Boolean(
    ((vitalitySummary?.highestExpansionInfluenceFounderOrigin ?? null) &&
      (vitalitySummary?.highestExpansionInfluenceFounderScore ?? 0) > 0) ||
      (vitalitySummary?.expansionLinkLeaders?.length ?? 0) > 0,
  );
  const collaborationInfluenceVisible = Boolean(
    ((vitalitySummary?.highestCollaborationInfluenceFounderOrigin ?? null) &&
      (vitalitySummary?.highestCollaborationInfluenceFounderScore ?? 0) > 0) ||
      (vitalitySummary?.collaborationInfluenceLeaders?.length ?? 0) > 0,
  );
  const cooperativeYieldVisible = Boolean(
    (vitalitySummary?.cooperativeYieldFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestCooperativeYieldFounderOrigin ?? null) &&
        (vitalitySummary?.highestCooperativeYieldFounderScore ?? 0) > 0) ||
      (vitalitySummary?.cooperativeYieldLeaders?.length ?? 0) > 0,
  );
  const roleCooperationVisible = Boolean(
    (vitalitySummary?.leadCooperationFounderCount ?? 0) > 0 ||
      (vitalitySummary?.supportCooperationFounderCount ?? 0) > 0 ||
      (vitalitySummary?.reviveCooperationFounderCount ?? 0) > 0 ||
      (vitalitySummary?.leadCooperationLeaders?.length ?? 0) > 0 ||
      (vitalitySummary?.supportCooperationLeaders?.length ?? 0) > 0 ||
      (vitalitySummary?.reviveCooperationLeaders?.length ?? 0) > 0,
  );
  const mortalityVisible = Boolean(
    (vitalitySummary?.stressedLineageCount ?? 0) > 0 ||
      (vitalitySummary?.dormantLineageCount ?? 0) > 0 ||
      (vitalitySummary?.extinctLineageCount ?? 0) > 0 ||
      (vitalitySummary?.nearDeathLineageCount ?? 0) > 0 ||
      (vitalitySummary?.mortalityPressureScore ?? 0) > 0 ||
      (vitalitySummary?.mortalityLeaders?.length ?? 0) > 0,
  );
  const terminalMortalityVisible = Boolean(
    (vitalitySummary?.terminalLineageCount ?? 0) > 0 ||
      (vitalitySummary?.backslidingLineageCount ?? 0) > 0 ||
      (vitalitySummary?.terminalMortalityFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestTerminalMortalityFounderOrigin ?? null) &&
        (vitalitySummary?.highestTerminalMortalityFounderScore ?? 0) > 0) ||
      (vitalitySummary?.terminalMortalityLeaders?.length ?? 0) > 0,
  );
  const recoveryVisible = Boolean(
    (vitalitySummary?.recoveryReadyFounderCount ?? 0) > 0 ||
      (vitalitySummary?.cooperativeRecoveryFounderCount ?? 0) > 0 ||
      (vitalitySummary?.recoveryReadyScore ?? 0) > 0 ||
      ((vitalitySummary?.highestRecoveryFounderOrigin ?? null) &&
        (vitalitySummary?.highestRecoveryFounderScore ?? 0) > 0) ||
      (vitalitySummary?.recoveryLeaders?.length ?? 0) > 0,
  );
  const stableRecoveryVisible = Boolean(
    (vitalitySummary?.stableRecoveryFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestStableRecoveryFounderOrigin ?? null) &&
        (vitalitySummary?.highestStableRecoveryFounderScore ?? 0) > 0) ||
      (vitalitySummary?.stableRecoveryLeaders?.length ?? 0) > 0,
  );
  const durableRecoveryVisible = Boolean(
    (vitalitySummary?.durableRecoveryFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestDurableRecoveryFounderOrigin ?? null) &&
        (vitalitySummary?.highestDurableRecoveryFounderScore ?? 0) > 0) ||
      (vitalitySummary?.durableRecoveryLeaders?.length ?? 0) > 0,
  );
  const transientRecoveryVisible = Boolean(
    (vitalitySummary?.transientRecoveryFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestTransientRecoveryFounderOrigin ?? null) &&
        (vitalitySummary?.highestTransientRecoveryFounderScore ?? 0) > 0) ||
      (vitalitySummary?.transientRecoveryLeaders?.length ?? 0) > 0,
  );
  const recoveryChainVisible = Boolean(
    (vitalitySummary?.recoveryChainFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestRecoveryChainFounderOrigin ?? null) &&
        (vitalitySummary?.highestRecoveryChainFounderScore ?? 0) > 0) ||
      (vitalitySummary?.recoveryChainLeaders?.length ?? 0) > 0,
  );
  const survivalClosureVisible = Boolean(
    (vitalitySummary?.survivalClosureFounderCount ?? 0) > 0 ||
      ((vitalitySummary?.highestSurvivalClosureFounderOrigin ?? null) &&
        (vitalitySummary?.highestSurvivalClosureFounderScore ?? 0) > 0) ||
      (vitalitySummary?.survivalClosureLeaders?.length ?? 0) > 0,
  );
  const recoveryStageMapVisible = Boolean(
    (vitalitySummary?.recoveryStageMap?.stages?.filter(
      (entry) => entry.founderOrigin && (entry.score ?? 0) > 0,
    ).length ?? 0) > 0,
  );
  const recoveryQueueVisible = recoveryQueueReport.some(
    (entry) =>
      entry.recoveryPhase != null &&
      entry.recoveryPhase !== "none" &&
      (entry.recoveryStage != null || entry.recoveryBasis != null),
  );
  const climateChildYieldVisible = Boolean(
    (vitalitySummary?.climateSpecialtyChildYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.climateSuperpowerChildYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.climateSpecialtyChildPublicValue ?? 0) > 0 ||
      (vitalitySummary?.climateSuperpowerChildPublicValue ?? 0) > 0 ||
      ((vitalitySummary?.climateChildYieldLeader ?? null) &&
        (vitalitySummary?.climateChildYieldEfficiencyGap ?? 0) >= 0),
  );
  const survivalChildYieldVisible = Boolean(
    (vitalitySummary?.survivalSpecialtyChildYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.survivalSuperpowerChildYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.survivalSpecialtyChildPublicValue ?? 0) > 0 ||
      (vitalitySummary?.survivalSuperpowerChildPublicValue ?? 0) > 0 ||
      ((vitalitySummary?.survivalChildYieldLeader ?? null) &&
        (vitalitySummary?.survivalChildYieldEfficiencyGap ?? 0) >= 0),
  );
  const specialtyInheritanceVisible = Boolean(
    (vitalitySummary?.childLineageCount ?? 0) >= 1 &&
      (vitalitySummary?.specialtyOnlyChildCount ?? 0) >= 1,
  );
  const superpowerInheritanceVisible = Boolean(
    (vitalitySummary?.childLineageCount ?? 0) >= 1 &&
      (vitalitySummary?.superpowerChildCount ?? 0) >= 1,
  );
  const specialtyChildValueVisible = Boolean(
    (vitalitySummary?.specialtyWorkingChildCount ?? 0) >= 1 &&
      (vitalitySummary?.specialtyChildPublicValue ?? 0) > 0,
  );
  const superpowerChildValueVisible = Boolean(
    (vitalitySummary?.superpowerWorkingChildCount ?? 0) >= 1 &&
      (vitalitySummary?.superpowerChildPublicValue ?? 0) > 0,
  );
  const childYieldEfficiencyVisible = Boolean(
    (vitalitySummary?.specialtyChildYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.superpowerChildYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.specialtyChildPublicValue ?? 0) > 0 ||
      (vitalitySummary?.superpowerChildPublicValue ?? 0) > 0,
  );
  const childYieldComparisonVisible = Boolean(
    ((vitalitySummary?.childYieldLeader ?? null) &&
      (vitalitySummary?.childYieldEfficiencyGap ?? 0) >= 0) ||
      ((vitalitySummary?.specialtyChildPublicValue ?? 0) > 0 &&
        (vitalitySummary?.superpowerChildPublicValue ?? 0) > 0) ||
      ((vitalitySummary?.specialtyChildYieldEfficiency ?? 0) > 0 &&
        (vitalitySummary?.superpowerChildYieldEfficiency ?? 0) > 0),
  );
  const multiGenerationVisible = Boolean(
    (vitalitySummary?.multiGenerationLineageCount ?? 0) > 0 ||
      (vitalitySummary?.secondGenerationChildCount ?? 0) > 0 ||
      (vitalitySummary?.deepestGenerationDepth ?? 0) >= 2 ||
      ((vitalitySummary?.highestMultigenerationFounderOrigin ?? null) &&
        (vitalitySummary?.highestMultigenerationFounderScore ?? 0) > 0) ||
      (vitalitySummary?.multiGenerationLeaders?.length ?? 0) > 0,
  );
  const multiGenerationValueVisible = Boolean(
    (vitalitySummary?.multiGenerationYieldEfficiency ?? 0) > 0 ||
      (vitalitySummary?.multiGenerationSustainedValueScore ?? 0) > 0 ||
      (vitalitySummary?.multiGenerationWorkingChildCount ?? 0) > 0,
  );
  const pressureAmplifiedSuperpowerVisible = Boolean(
    (vitalitySummary?.pressureAmplifiedSuperpowerChildCount ?? 0) >= 1,
  );
  const runCountSeries = compactNumberSeries([
    initialRunCount,
    postTickRunCount,
    postPumpRunCount,
    postFollowupRunCount,
    ...probeRunCounts,
  ]);
  const runawayRiskSeries = compactNumberSeries([
    resolveNullableNumber(initialSignals?.runawayRiskScore),
    resolveNullableNumber(postTickSummary?.experimentSignals?.runawayRiskScore),
    resolveNullableNumber(postPumpSummary?.experimentSignals?.runawayRiskScore),
    resolveNullableNumber(postFollowupSummary?.experimentSignals?.runawayRiskScore),
    ...(params.probePumps ?? []).map((probe) =>
      resolveNullableNumber(resolveSummary(probe.summary)?.experimentSignals?.runawayRiskScore),
    ),
  ]);
  const phaseSeries = compactPhaseSeries([
    initialSignals?.phaseState,
    postTickSummary?.experimentSignals?.phaseState,
    postPumpSummary?.experimentSignals?.phaseState,
    postFollowupSummary?.experimentSignals?.phaseState,
    ...(params.probePumps ?? []).map((probe) => resolveSummary(probe.summary)?.experimentSignals?.phaseState),
  ]);

  const assertions: GenesisServerSmokeAssessment["assertions"] = [
    {
      key: "tick_progressed",
      ok: tickRan,
      detail: `decision=${tickDecision ?? "null"} tickRunDelta=${tickRunDelta}`,
    },
    {
      key: "pump_progressed",
      ok: pumpRan,
      detail: `pumpTickCount=${pumpTickCount} pumpRunDelta=${pumpRunDelta}`,
    },
    {
      key: "followup_progressed",
      ok: followupRan,
      detail: `followupPumpTickCount=${followupPumpTickCount} followupPumpRunDelta=${followupPumpRunDelta}`,
    },
    {
      key: "probe_progressed",
      ok: probeRan || followupRan,
      detail: `probePumpTickCount=${probePumpTickCount} probePumpRunDelta=${probePumpRunDelta}`,
    },
    {
      key: "phase_signal_visible",
      ok: Boolean(phaseState),
      detail: `phaseState=${phaseState ?? "null"}`,
    },
    {
      key: "collaboration_visible",
      ok: collaborationVisible,
      detail: `activePlanCount=${collaborationSummary?.activePlanCount ?? 0} collaborativePlanCount=${collaborationSummary?.collaborativePlanCount ?? 0} mobilizedAgentCount=${collaborationSummary?.mobilizedAgentCount ?? 0} averageMobilizedCoverageRatio=${collaborationSummary?.averageMobilizedCoverageRatio ?? 0}`,
    },
    {
      key: "collaboration_effective",
      ok: collaborationEffective,
      detail: `productiveMobilizedLineageCount=${collaborationSummary?.productiveMobilizedLineageCount ?? 0} productiveSupportLineageCount=${collaborationSummary?.productiveSupportLineageCount ?? 0} productiveAssignmentCoverageRatio=${collaborationSummary?.productiveAssignmentCoverageRatio ?? 0} collaborationEffectScore=${collaborationSummary?.collaborationEffectScore ?? 0}`,
    },
    {
      key: "collaboration_yield_visible",
      ok: collaborationYieldVisible,
      detail: `leadYieldScore=${collaborationSummary?.leadYieldScore ?? 0} supportYieldScore=${collaborationSummary?.supportYieldScore ?? 0} reviveYieldScore=${collaborationSummary?.reviveYieldScore ?? 0} productiveAssignmentCoverageRatio=${collaborationSummary?.productiveAssignmentCoverageRatio ?? 0}`,
    },
    {
      key: "vitality_visible",
      ok: vitalityVisible,
      detail: `lineageCount=${vitalitySummary?.lineageCount ?? 0} proactiveReadyLineageCount=${vitalitySummary?.proactiveReadyLineageCount ?? 0} childLineageCount=${vitalitySummary?.childLineageCount ?? 0}`,
    },
    {
      key: "work_effect_visible",
      ok: workEffectVisible,
      detail: `workingLineageCount=${vitalitySummary?.workingLineageCount ?? 0} totalPublicValue=${vitalitySummary?.totalPublicValue ?? 0} totalSurvivalCredit=${vitalitySummary?.totalSurvivalCredit ?? 0}`,
    },
    {
      key: "proactive_effect_visible",
      ok: proactiveEffectVisible,
      detail: `proactiveWorkingLineageCount=${vitalitySummary?.proactiveWorkingLineageCount ?? 0} activeTriggerCount=${vitalitySummary?.activeTriggerCount ?? 0}`,
    },
    {
      key: "proactive_specialization_visible",
      ok: proactiveSpecializationVisible,
      detail: `roleAlignedProactiveLineageCount=${vitalitySummary?.roleAlignedProactiveLineageCount ?? 0} founderRoleCoverageCount=${vitalitySummary?.founderRoleCoverageCount ?? 0} proactiveSpecializationScore=${vitalitySummary?.proactiveSpecializationScore ?? 0}`,
    },
    {
      key: "founder_yield_visible",
      ok: founderYieldVisible,
      detail: `founderYieldCoverageCount=${vitalitySummary?.founderYieldCoverageCount ?? 0} roleAlignedProactiveYieldScore=${vitalitySummary?.roleAlignedProactiveYieldScore ?? 0}`,
    },
    {
      key: "trajectory_visible",
      ok: trajectoryVisible,
      detail: `recentTrajectoryCount=${trajectorySummary?.recentTrajectoryCount ?? 0} highestRewardFounderOrigin=${trajectorySummary?.highestRewardFounderOrigin ?? "none"} averageProcessReward=${trajectorySummary?.averageProcessReward ?? 0}`,
    },
    {
      key: "metaclaw_visible",
      ok: metaClawVisible,
      detail: `idleOptimizationCount=${metaClawSummary?.idleOptimizationCount ?? 0} lastTargetFounderOrigin=${metaClawSummary?.lastTargetFounderOrigin ?? "none"} lastAction=${metaClawSummary?.lastAction ?? "none"}`,
    },
    {
      key: "learning_activation_visible",
      ok: learningActivationVisible,
      detail: `trajectoryRewardLeaderOrigin=${learningSummary?.trajectoryRewardLeaderOrigin ?? "none"} metaClawTargetFounderOrigin=${learningSummary?.metaClawTargetFounderOrigin ?? "none"} metaClawOptimizationActive=${learningSummary?.metaClawOptimizationActive ?? false}`,
    },
    {
      key: "niche_balance_visible",
      ok: nicheBalanceVisible,
      detail: `nicheBalancedFounderCount=${learningSummary?.nicheBalancedFounderCount ?? 0} highestNicheBalanceFounderOrigin=${learningSummary?.highestNicheBalanceFounderOrigin ?? "none"} highestNicheBalanceFounderScore=${learningSummary?.highestNicheBalanceFounderScore ?? 0}`,
    },
    {
      key: "user_intent_visible",
      ok: userIntentVisible,
      detail: `historyEntryCount=${userIntentSummary?.historyEntryCount ?? 0} profileVisible=${userIntentSummary?.profileVisible ?? false} highestIntentFounderOrigin=${userIntentSummary?.highestIntentFounderOrigin ?? "none"}`,
    },
    {
      key: "user_intent_model_visible",
      ok: userIntentModelVisible,
      detail: `timeWeightedHistorySignalScore=${userIntentSummary?.timeWeightedHistorySignalScore ?? 0} workProfileSignalScore=${userIntentSummary?.workProfileSignalScore ?? 0} strongestTopicCluster=${userIntentSummary?.strongestTopicCluster ?? "none"} highestLongTermIntentFounderOrigin=${userIntentSummary?.highestLongTermIntentFounderOrigin ?? "none"}`,
    },
    {
      key: "history_driven_proactive_visible",
      ok: historyDrivenProactiveVisible,
      detail: `historyDrivenProactiveLineageCount=${vitalitySummary?.historyDrivenProactiveLineageCount ?? 0} historySignalScore=${userIntentSummary?.historySignalScore ?? 0}`,
    },
    {
      key: "user_profile_focus_visible",
      ok: userProfileDrivenFocusVisible,
      detail: `userProfileDrivenProactiveLineageCount=${vitalitySummary?.userProfileDrivenProactiveLineageCount ?? 0} profileSignalScore=${userIntentSummary?.profileSignalScore ?? 0}`,
    },
      {
        key: "replication_effect_visible",
        ok: replicationEffectVisible,
        detail: `childWorkingLineageCount=${vitalitySummary?.childWorkingLineageCount ?? 0} replicatingWorkingParentCount=${vitalitySummary?.replicatingWorkingParentCount ?? 0} autonomousExpansionScore=${vitalitySummary?.autonomousExpansionScore ?? 0}`,
      },
      {
        key: "expansion_link_visible",
        ok: expansionLinkVisible,
        detail: `collaborativeExpansionFounderCount=${vitalitySummary?.collaborativeExpansionFounderCount ?? 0} crossFounderExpansionLinkCount=${vitalitySummary?.crossFounderExpansionLinkCount ?? 0} crossFounderExpansionScore=${vitalitySummary?.crossFounderExpansionScore ?? 0}`,
      },
      {
        key: "expansion_influence_visible",
        ok: expansionInfluenceVisible,
        detail: `highestExpansionInfluenceFounderOrigin=${vitalitySummary?.highestExpansionInfluenceFounderOrigin ?? "none"} highestExpansionInfluenceFounderScore=${vitalitySummary?.highestExpansionInfluenceFounderScore ?? 0}`,
      },
      {
        key: "collaboration_influence_visible",
        ok: collaborationInfluenceVisible,
        detail: `highestCollaborationInfluenceFounderOrigin=${vitalitySummary?.highestCollaborationInfluenceFounderOrigin ?? "none"} highestCollaborationInfluenceFounderScore=${vitalitySummary?.highestCollaborationInfluenceFounderScore ?? 0}`,
      },
      {
        key: "cooperative_yield_visible",
        ok: cooperativeYieldVisible,
        detail: `cooperativeYieldFounderCount=${vitalitySummary?.cooperativeYieldFounderCount ?? 0} highestCooperativeYieldFounderOrigin=${vitalitySummary?.highestCooperativeYieldFounderOrigin ?? "none"} highestCooperativeYieldFounderScore=${vitalitySummary?.highestCooperativeYieldFounderScore ?? 0}`,
      },
      {
        key: "role_cooperation_visible",
        ok: roleCooperationVisible,
        detail: `highestLeadCooperationFounderOrigin=${vitalitySummary?.highestLeadCooperationFounderOrigin ?? "none"} highestSupportCooperationFounderOrigin=${vitalitySummary?.highestSupportCooperationFounderOrigin ?? "none"} highestReviveCooperationFounderOrigin=${vitalitySummary?.highestReviveCooperationFounderOrigin ?? "none"}`,
      },
      {
        key: "mortality_visible",
        ok: mortalityVisible,
        detail: `stressedLineageCount=${vitalitySummary?.stressedLineageCount ?? 0} dormantLineageCount=${vitalitySummary?.dormantLineageCount ?? 0} extinctLineageCount=${vitalitySummary?.extinctLineageCount ?? 0} nearDeathLineageCount=${vitalitySummary?.nearDeathLineageCount ?? 0}`,
      },
      {
        key: "terminal_mortality_visible",
        ok: terminalMortalityVisible,
        detail: `terminalLineageCount=${vitalitySummary?.terminalLineageCount ?? 0} backslidingLineageCount=${vitalitySummary?.backslidingLineageCount ?? 0} highestTerminalMortalityFounderOrigin=${vitalitySummary?.highestTerminalMortalityFounderOrigin ?? "none"}`,
      },
      {
        key: "recovery_visible",
        ok: recoveryVisible,
        detail: `recoveryReadyFounderCount=${vitalitySummary?.recoveryReadyFounderCount ?? 0} cooperativeRecoveryFounderCount=${vitalitySummary?.cooperativeRecoveryFounderCount ?? 0} highestRecoveryFounderOrigin=${vitalitySummary?.highestRecoveryFounderOrigin ?? "none"}`,
      },
      {
        key: "stable_recovery_visible",
        ok: stableRecoveryVisible,
        detail: `stableRecoveryFounderCount=${vitalitySummary?.stableRecoveryFounderCount ?? 0} highestStableRecoveryFounderOrigin=${vitalitySummary?.highestStableRecoveryFounderOrigin ?? "none"} highestStableRecoveryFounderScore=${vitalitySummary?.highestStableRecoveryFounderScore ?? 0}`,
      },
      {
        key: "durable_recovery_visible",
        ok: durableRecoveryVisible,
        detail: `durableRecoveryFounderCount=${vitalitySummary?.durableRecoveryFounderCount ?? 0} highestDurableRecoveryFounderOrigin=${vitalitySummary?.highestDurableRecoveryFounderOrigin ?? "none"} highestDurableRecoveryFounderScore=${vitalitySummary?.highestDurableRecoveryFounderScore ?? 0}`,
      },
      {
        key: "transient_recovery_visible",
        ok: transientRecoveryVisible,
        detail: `transientRecoveryFounderCount=${vitalitySummary?.transientRecoveryFounderCount ?? 0} highestTransientRecoveryFounderOrigin=${vitalitySummary?.highestTransientRecoveryFounderOrigin ?? "none"} highestTransientRecoveryFounderScore=${vitalitySummary?.highestTransientRecoveryFounderScore ?? 0}`,
      },
      {
        key: "recovery_chain_visible",
        ok: recoveryChainVisible,
        detail: `recoveryChainFounderCount=${vitalitySummary?.recoveryChainFounderCount ?? 0} highestRecoveryChainFounderOrigin=${vitalitySummary?.highestRecoveryChainFounderOrigin ?? "none"} highestRecoveryChainFounderScore=${vitalitySummary?.highestRecoveryChainFounderScore ?? 0}`,
      },
      {
        key: "survival_closure_visible",
        ok: survivalClosureVisible,
        detail: `survivalClosureFounderCount=${vitalitySummary?.survivalClosureFounderCount ?? 0} highestSurvivalClosureFounderOrigin=${vitalitySummary?.highestSurvivalClosureFounderOrigin ?? "none"} highestSurvivalClosureFounderScore=${vitalitySummary?.highestSurvivalClosureFounderScore ?? 0}`,
      },
      {
        key: "recovery_stage_map_visible",
        ok: recoveryStageMapVisible,
        detail:
          vitalitySummary?.recoveryStageMap?.stages
            ?.map(
              (entry) =>
                `${entry.stage}:${entry.founderOrigin ?? "none"}@${entry.score ?? 0}/${entry.basis}`,
            )
            .join(" ") ?? "recoveryStageMap=none",
      },
      {
        key: "recovery_queue_visible",
        ok: recoveryQueueVisible,
        detail:
          recoveryQueueReport
            .map(
              (entry) =>
                `${entry.label ?? entry.founderOrigin ?? "unknown"}:${entry.recoveryPhase ?? "none"}:${entry.recoveryStage ?? "none"}/${entry.recoveryBasis ?? "none"}->${entry.stageLeaderFounderOrigin ?? "none"}~${entry.stageRunnerUpFounderOrigin ?? "none"} role=${entry.recoveryStageResponsibilityRole ?? "none"} bias=${entry.recoveryStageResponsibilityBias ?? 0}`,
            )
            .join(" ") || "recoveryQueue=none",
      },
      {
        key: "climate_child_yield_visible",
        ok: climateChildYieldVisible,
        detail: `climateSpecialtyChildYieldEfficiency=${vitalitySummary?.climateSpecialtyChildYieldEfficiency ?? 0} climateSuperpowerChildYieldEfficiency=${vitalitySummary?.climateSuperpowerChildYieldEfficiency ?? 0} climateChildYieldLeader=${vitalitySummary?.climateChildYieldLeader ?? "none"}`,
      },
      {
        key: "survival_child_yield_visible",
        ok: survivalChildYieldVisible,
        detail: `survivalSpecialtyChildYieldEfficiency=${vitalitySummary?.survivalSpecialtyChildYieldEfficiency ?? 0} survivalSuperpowerChildYieldEfficiency=${vitalitySummary?.survivalSuperpowerChildYieldEfficiency ?? 0} survivalChildYieldLeader=${vitalitySummary?.survivalChildYieldLeader ?? "none"}`,
      },
      {
        key: "specialty_inheritance_visible",
        ok: specialtyInheritanceVisible,
      detail: `childLineageCount=${vitalitySummary?.childLineageCount ?? 0} specialtyOnlyChildCount=${vitalitySummary?.specialtyOnlyChildCount ?? 0} superpowerChildCount=${vitalitySummary?.superpowerChildCount ?? 0}`,
    },
    {
      key: "superpower_inheritance_visible",
      ok: superpowerInheritanceVisible,
      detail: `childLineageCount=${vitalitySummary?.childLineageCount ?? 0} specialtyOnlyChildCount=${vitalitySummary?.specialtyOnlyChildCount ?? 0} superpowerChildCount=${vitalitySummary?.superpowerChildCount ?? 0}`,
    },
    {
      key: "specialty_child_value_visible",
      ok: specialtyChildValueVisible,
      detail: `specialtyWorkingChildCount=${vitalitySummary?.specialtyWorkingChildCount ?? 0} specialtyProactiveChildCount=${vitalitySummary?.specialtyProactiveChildCount ?? 0} specialtyChildPublicValue=${vitalitySummary?.specialtyChildPublicValue ?? 0}`,
    },
    {
      key: "superpower_child_value_visible",
      ok: superpowerChildValueVisible,
      detail: `superpowerWorkingChildCount=${vitalitySummary?.superpowerWorkingChildCount ?? 0} superpowerProactiveChildCount=${vitalitySummary?.superpowerProactiveChildCount ?? 0} superpowerChildPublicValue=${vitalitySummary?.superpowerChildPublicValue ?? 0}`,
    },
    {
      key: "multigeneration_visible",
      ok: multiGenerationVisible,
      detail: `multiGenerationLineageCount=${vitalitySummary?.multiGenerationLineageCount ?? 0} secondGenerationChildCount=${vitalitySummary?.secondGenerationChildCount ?? 0} deepestGenerationDepth=${vitalitySummary?.deepestGenerationDepth ?? 0}`,
    },
    {
      key: "multigeneration_value_visible",
      ok: multiGenerationValueVisible,
      detail: `multiGenerationYieldEfficiency=${vitalitySummary?.multiGenerationYieldEfficiency ?? 0} multiGenerationSustainedValueScore=${vitalitySummary?.multiGenerationSustainedValueScore ?? 0}`,
    },
  ];

  return {
    seededPlan: Boolean(params.seededPlan),
    seededVitality: Boolean(params.seededVitality),
    tickDecision,
    tickRan,
    pumpTickCount,
    pumpRan,
    collaborationVisible,
    collaborationEffective,
    collaborationYieldVisible,
    vitalityVisible,
    workEffectVisible,
    proactiveEffectVisible,
    proactiveSpecializationVisible,
    founderYieldVisible,
    founderYieldEfficiencyVisible,
    proactiveYieldLeadersVisible,
    trajectoryVisible,
    metaClawVisible,
    learningActivationVisible,
    nicheBalanceVisible,
    userIntentVisible,
    userIntentModelVisible,
    historyDrivenProactiveVisible,
    userProfileDrivenFocusVisible,
    replicationEffectVisible,
    replicationPressureVisible,
    replicationLeaderVisible,
      replicationTempoVisible,
      climateReplicationVisible,
      survivalReplicationVisible,
      expansionLinkVisible,
      expansionInfluenceVisible,
      collaborationInfluenceVisible,
      cooperativeYieldVisible,
      roleCooperationVisible,
      mortalityVisible,
      terminalMortalityVisible,
      recoveryVisible,
      stableRecoveryVisible,
      durableRecoveryVisible,
      transientRecoveryVisible,
      recoveryChainVisible,
      survivalClosureVisible,
      recoveryStageMapVisible,
      recoveryQueueVisible,
      climateChildYieldVisible,
      survivalChildYieldVisible,
      specialtyInheritanceVisible,
    superpowerInheritanceVisible,
    specialtyChildValueVisible,
    superpowerChildValueVisible,
    childYieldEfficiencyVisible,
    childYieldComparisonVisible,
    multiGenerationVisible,
    multiGenerationValueVisible,
    pressureAmplifiedSuperpowerVisible,
    runCountDelta: {
      tick: tickRunDelta,
      pump: pumpRunDelta,
      followupPump: followupPumpRunDelta,
      total: totalRunDelta,
    },
    activeDispatchDelta: safeDelta(initialActiveDispatchCount, postPumpActiveDispatchCount),
    amplificationDelta: safeNullableDelta(
      resolveNullableNumber(initialSignals?.amplificationScore),
      resolveNullableNumber(finalSignals?.amplificationScore),
    ),
    runawayRiskDelta: safeNullableDelta(
      resolveNullableNumber(initialSignals?.runawayRiskScore),
      resolveNullableNumber(finalSignals?.runawayRiskScore),
    ),
    phaseState,
    trend: {
      runCountSeries,
      runawayRiskSeries,
      phaseSeries,
      riskDirection: resolveRiskDirection(runawayRiskSeries),
      state: resolveTrendState({
        phaseState,
        totalRunDelta,
        followupPumpRunDelta: followupPumpRunDelta + probePumpRunDelta,
        runawayRiskSeries,
      }),
    },
    assertions,
    progressed: tickRan || pumpRan || followupRan || probeRan || totalRunDelta > 0,
    verdict: assertions.every((assertion) => assertion.ok) ? "ok" : "needs-attention",
  };
}

function resolveSummary(
  value: GenesisSocietySummary | GenesisServerSmokeSummaryEnvelope | null | undefined,
): GenesisSocietySummary | null {
  if (!value) {
    return null;
  }
  if ("world" in value || "ecologyCounts" in value || "activeDispatchCount" in value) {
    return value as GenesisSocietySummary;
  }
  return value.summary ?? value.genesisSummary ?? null;
}

function resolveRunCount(summary: GenesisSocietySummary | null): number | null {
  return resolveNullableNumber(summary?.tickState?.runCount);
}

function resolveNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeDelta(before: number | null, after: number | null): number {
  return (after ?? before ?? 0) - (before ?? 0);
}

function safeNullableDelta(before: number | null, after: number | null): number | null {
  if (before === null && after === null) {
    return null;
  }
  return (after ?? before ?? 0) - (before ?? 0);
}

function compactNumberSeries(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function compactPhaseSeries(
  values: Array<GenesisSocietySummary["experimentSignals"]["phaseState"] | undefined>,
): Array<GenesisSocietySummary["experimentSignals"]["phaseState"]> {
  return values.filter(
    (value): value is GenesisSocietySummary["experimentSignals"]["phaseState"] =>
      value === "stable" || value === "amplifying" || value === "runaway-risk",
  );
}

function resolveTrendState(params: {
  phaseState: GenesisSocietySummary["experimentSignals"]["phaseState"] | null;
  totalRunDelta: number;
  followupPumpRunDelta: number;
  runawayRiskSeries: number[];
}): "stalled" | "steady" | "advancing" | "threshold-building" | "runaway-pressure" {
  const riskDelta =
    params.runawayRiskSeries.length >= 2
      ? params.runawayRiskSeries[params.runawayRiskSeries.length - 1] - params.runawayRiskSeries[0]
      : 0;
  if (params.phaseState === "runaway-risk" || riskDelta >= 1.5) {
    return "runaway-pressure";
  }
  if (params.phaseState === "amplifying" && riskDelta > 0.25) {
    return "threshold-building";
  }
  if (params.followupPumpRunDelta > 0) {
    return "advancing";
  }
  if (params.totalRunDelta > 0) {
    return "steady";
  }
  return "stalled";
}

function resolveRiskDirection(values: number[]): "falling" | "flat" | "rising" {
  if (values.length < 2) {
    return "flat";
  }
  const delta = values[values.length - 1] - values[0];
  if (delta > 0.05) {
    return "rising";
  }
  if (delta < -0.05) {
    return "falling";
  }
  return "flat";
}
