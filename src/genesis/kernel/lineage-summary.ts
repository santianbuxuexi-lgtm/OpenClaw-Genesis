import fs from "node:fs";
import path from "node:path";
import {
  readGenesisLineageFocusItemsSync,
  readGenesisLineageTriggersSync,
  readGenesisFocusSummarySnapshotSync,
  readGenesisFocusSummarySync,
} from "./focus.js";
import {
  readGenesisWorldStateSync,
  readJsonDirSync,
  readJsonFileSync,
  resolveGenesisEcologyState,
  resolveGenesisLineageSummaryPath,
  resolveGenesisStateDir,
  type GenesisEcologyState,
  type GenesisLineageRecord,
  type GenesisSocietySummary,
} from "./state.js";
import {
  readGenesisSkillEvolutionSummarySnapshotSync,
  readGenesisSkillEvolutionSummarySync,
  resolveGenesisSkillEvolutionBias,
} from "./skill-evolution.js";
import {
  readGenesisDispatchSummarySnapshotSync,
  readGenesisDispatchSummarySync,
} from "./dispatch-summary.js";
import {
  readGenesisUserIntentSummarySnapshotSync,
  readGenesisUserIntentSummarySync,
} from "./user-intent.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";

export type GenesisLineageSummary = Pick<
  GenesisSocietySummary,
  "ecologyCounts" | "topLineages" | "vitalitySummary"
>;

const DEFAULT_GENESIS_LINEAGE_SUMMARY: GenesisLineageSummary = {
  ecologyCounts: {
    active: 0,
    stressed: 0,
    dormant: 0,
    extinct: 0,
  },
  topLineages: [],
  vitalitySummary: {
    lineageCount: 0,
    childLineageCount: 0,
    specialtyOnlyChildCount: 0,
    superpowerChildCount: 0,
    pressureAmplifiedSuperpowerChildCount: 0,
    pressureAmplifiedSuperpowerWorkingChildCount: 0,
    specialtyWorkingChildCount: 0,
    specialtyProactiveChildCount: 0,
    specialtyChildPublicValue: 0,
    specialtyChildYieldEfficiency: 0,
    specialtyChildSustainedValueScore: 0,
    superpowerWorkingChildCount: 0,
    superpowerProactiveChildCount: 0,
    superpowerChildPublicValue: 0,
    superpowerChildYieldEfficiency: 0,
    superpowerChildSustainedValueScore: 0,
    childYieldLeader: null,
    childYieldEfficiencyGap: 0,
    multiGenerationLineageCount: 0,
    secondGenerationChildCount: 0,
    thirdGenerationChildCount: 0,
    deepestGenerationDepth: 0,
    multiGenerationWorkingChildCount: 0,
    multiGenerationProactiveChildCount: 0,
    multiGenerationSuperpowerChildCount: 0,
    multiGenerationPublicValue: 0,
    multiGenerationYieldEfficiency: 0,
    multiGenerationSustainedValueScore: 0,
    multigenerationFounderCount: 0,
    highestMultigenerationFounderOrigin: null,
    highestMultigenerationFounderScore: 0,
    multiGenerationLeaders: [],
    childDegradationFounderCount: 0,
    highestChildDegradationFounderOrigin: null,
    highestChildDegradationFounderScore: 0,
    childDegradationLeaders: [],
    superpowerDurabilityFounderCount: 0,
    highestSuperpowerDurabilityFounderOrigin: null,
    highestSuperpowerDurabilityFounderScore: 0,
    superpowerDurabilityLeaders: [],
    longTermDegradationFounderCount: 0,
    highestLongTermDegradationFounderOrigin: null,
    highestLongTermDegradationFounderScore: 0,
    longTermDegradationLeaders: [],
    longTermRecoveryFounderCount: 0,
    highestLongTermRecoveryFounderOrigin: null,
    highestLongTermRecoveryFounderScore: 0,
    longTermRecoveryLeaders: [],
    climateReplicationPressureScore: 0,
    survivalReplicationPressureScore: 0,
    productiveReplicationCapacityScore: 0,
    replicationFrequencyScore: 0,
    replicationTriggerFrequencyScore: 0,
    replicationSuccessFrequencyScore: 0,
    averageReplicationLatency: 0,
    replicationSpeedScore: 0,
    climatePressuredChildCount: 0,
    climatePressuredSuperpowerChildCount: 0,
    climatePressuredChildValueScore: 0,
    survivalPressuredChildCount: 0,
    survivalPressuredSuperpowerChildCount: 0,
    survivalPressuredChildValueScore: 0,
    climateResponsiveReplicationParentCount: 0,
    survivalResponsiveReplicationParentCount: 0,
    proactiveReplicationParentCount: 0,
    collaborativeExpansionFounderCount: 0,
    crossFounderExpansionLinkCount: 0,
    crossFounderExpansionScore: 0,
    cooperativeYieldFounderCount: 0,
    leadCooperationFounderCount: 0,
    highestLeadCooperationFounderOrigin: null,
    highestLeadCooperationFounderScore: 0,
    supportCooperationFounderCount: 0,
    highestSupportCooperationFounderOrigin: null,
    highestSupportCooperationFounderScore: 0,
    reviveCooperationFounderCount: 0,
    highestReviveCooperationFounderOrigin: null,
    highestReviveCooperationFounderScore: 0,
    highestCollaborationInfluenceFounderOrigin: null,
    highestCollaborationInfluenceFounderScore: 0,
    highestCooperativeYieldFounderOrigin: null,
    highestCooperativeYieldFounderScore: 0,
    highestExpansionInfluenceFounderOrigin: null,
    highestExpansionInfluenceFounderScore: 0,
    expansionLinkLeaders: [],
    collaborationInfluenceLeaders: [],
    cooperativeYieldLeaders: [],
    leadCooperationLeaders: [],
    supportCooperationLeaders: [],
    reviveCooperationLeaders: [],
    stressedLineageCount: 0,
    dormantLineageCount: 0,
    extinctLineageCount: 0,
    nearDeathLineageCount: 0,
    recoverableLineageCount: 0,
    terminalLineageCount: 0,
    backslidingLineageCount: 0,
    mortalityPressureScore: 0,
    highestMortalityFounderOrigin: null,
    highestMortalityFounderScore: 0,
    terminalMortalityFounderCount: 0,
    highestTerminalMortalityFounderOrigin: null,
    highestTerminalMortalityFounderScore: 0,
    recoveryReadyFounderCount: 0,
    cooperativeRecoveryFounderCount: 0,
    recoveryReadyScore: 0,
    highestRecoveryFounderOrigin: null,
    highestRecoveryFounderScore: 0,
    stableRecoveryFounderCount: 0,
    durableRecoveryFounderCount: 0,
    transientRecoveryFounderCount: 0,
    recoveryChainFounderCount: 0,
    highestStableRecoveryFounderOrigin: null,
    highestStableRecoveryFounderScore: 0,
    highestDurableRecoveryFounderOrigin: null,
    highestDurableRecoveryFounderScore: 0,
    highestTransientRecoveryFounderOrigin: null,
    highestTransientRecoveryFounderScore: 0,
    highestRecoveryChainFounderOrigin: null,
    highestRecoveryChainFounderScore: 0,
    survivalClosureFounderCount: 0,
    highestSurvivalClosureFounderOrigin: null,
    highestSurvivalClosureFounderScore: 0,
    mortalityLeaders: [],
    terminalMortalityLeaders: [],
    recoveryLeaders: [],
    stableRecoveryLeaders: [],
    durableRecoveryLeaders: [],
    transientRecoveryLeaders: [],
    recoveryChainLeaders: [],
    survivalClosureLeaders: [],
    replicatingParentCount: 0,
    maxChildrenPerParent: 0,
    workingLineageCount: 0,
    childWorkingLineageCount: 0,
    replicatingWorkingParentCount: 0,
    heartbeatLineageCount: 0,
    proactiveReadyLineageCount: 0,
    proactiveWorkingLineageCount: 0,
    activeFocusLineageCount: 0,
    activeTriggerCount: 0,
    recentCapturedSkillCount: 0,
    recentDerivedSkillCount: 0,
    totalPublicValue: 0,
    totalPrivateValue: 0,
    totalSurvivalCredit: 0,
    totalExpansionCredit: 0,
    proactiveSignalScore: 0,
    autonomousExpansionScore: 0,
    founderRoleCoverageCount: 0,
    founderYieldCoverageCount: 0,
    roleAlignedWorkingLineageCount: 0,
    roleAlignedProactiveLineageCount: 0,
    roleAlignedProactiveYieldScore: 0,
    highestYieldFounderOrigin: null,
    highestYieldFounderScore: 0,
    proactiveYieldLeaders: [],
    highestReplicationFounderOrigin: null,
    highestReplicationFounderScore: 0,
    replicationLeaders: [],
    highestReplicationTempoFounderOrigin: null,
    highestReplicationTempoFounderScore: 0,
    replicationTempoLeaders: [],
    highestClimateReplicationFounderOrigin: null,
    highestClimateReplicationFounderScore: 0,
    highestSurvivalReplicationFounderOrigin: null,
    highestSurvivalReplicationFounderScore: 0,
    climateReplicationLeaders: [],
    survivalReplicationLeaders: [],
    historyDrivenProactiveLineageCount: 0,
    userProfileDrivenProactiveLineageCount: 0,
    userIntentDrivenProactiveYieldScore: 0,
    highestUserIntentFounderOrigin: null,
    highestUserIntentFounderScore: 0,
    userIntentLeaders: [],
    proactiveSpecializationScore: 0,
    founderRoleBreakdown: [],
    topParentLineages: [],
  },
};

const KNOWN_FOUNDER_ORIGINS = [
  "scout",
  "builder",
  "creator",
  "auditor",
  "negotiator",
] as const;

type GenesisFounderOrigin = (typeof KNOWN_FOUNDER_ORIGINS)[number];

type GenesisFounderRoleBreakdown = NonNullable<
  GenesisSocietySummary["vitalitySummary"]
>["founderRoleBreakdown"][number];

const FOUNDER_ROLE_SIGNALS: Record<
  GenesisFounderOrigin,
  {
    domains: string[];
    keywords: string[];
  }
> = {
  scout: {
    domains: ["source_discovery", "search", "signal", "research"],
    keywords: ["source", "search", "signal", "trust", "discover", "monitor"],
  },
  builder: {
    domains: ["workflow", "tool_synthesis", "capability", "build"],
    keywords: ["workflow", "tool", "capability", "distill", "compile", "automation"],
  },
  creator: {
    domains: ["scenario_generation", "ideation", "novelty", "concept"],
    keywords: ["scenario", "idea", "novel", "concept", "strategy", "design"],
  },
  auditor: {
    domains: ["audit", "risk", "failure", "regression"],
    keywords: ["audit", "risk", "failure", "regression", "error", "causal"],
  },
  negotiator: {
    domains: ["coordination", "protocol", "coalition", "resource_allocation"],
    keywords: ["coordination", "protocol", "coalition", "align", "resource", "consensus"],
  },
};

function isProductiveLineage(lineage: GenesisLineageRecord): boolean {
  return (
    lineage.completionCount > 0 ||
    lineage.publicValue > 0 ||
    lineage.privateValue > 0 ||
    lineage.survivalCredit > 0 ||
    lineage.expansionCredit > 0
  );
}

function resolveGenesisFounderOrigin(
  lineage: GenesisLineageRecord,
): GenesisFounderOrigin | null {
  for (const candidate of [lineage.lineageId, lineage.parentLineageId, lineage.specialtyOrigin]) {
    const normalized = candidate?.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    const head = normalized.split("::")[0] ?? normalized;
    const founderHead = head.endsWith("_founder") ? head.slice(0, -"_founder".length) : head;
    if (
      KNOWN_FOUNDER_ORIGINS.includes(founderHead as GenesisFounderOrigin)
    ) {
      return founderHead as GenesisFounderOrigin;
    }
  }
  return null;
}

function resolveGenesisFounderOriginFromAgentId(agentId: string | undefined): GenesisFounderOrigin | null {
  const normalized = agentId?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return KNOWN_FOUNDER_ORIGINS.includes(normalized as GenesisFounderOrigin)
    ? (normalized as GenesisFounderOrigin)
    : null;
}

function lineageHasRoleAlignedSignals(params: {
  founderOrigin: GenesisFounderOrigin;
  lineageId: string;
  env: NodeJS.ProcessEnv;
}): { activeFocusCount: number; activeTriggerCount: number; aligned: boolean } {
  const focusItems = readGenesisLineageFocusItemsSync(params.lineageId, params.env).filter(
    (item) => item.status === "active",
  );
  const triggerItems = readGenesisLineageTriggersSync(params.lineageId, params.env).filter(
    (item) => item.status === "active",
  );
  const roleSignals = FOUNDER_ROLE_SIGNALS[params.founderOrigin];
  const haystacks = [
    ...focusItems.flatMap((item) => [item.title, item.domain, ...(item.keywords ?? [])]),
    ...triggerItems.map((item) => item.title),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
  const aligned =
    haystacks.some((value) => roleSignals.domains.some((domain) => value.includes(domain))) ||
    haystacks.some((value) => roleSignals.keywords.some((keyword) => value.includes(keyword)));
  return {
    activeFocusCount: focusItems.length,
    activeTriggerCount: triggerItems.length,
    aligned,
  };
}

export function readGenesisLineageSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageSummary {
  const world = readGenesisWorldStateSync(env);
  const lineages = readJsonDirSync<GenesisLineageRecord>(
    path.join(resolveGenesisStateDir(env), "lineages"),
  );
  const ecologyCounts: Record<GenesisEcologyState, number> = {
    active: 0,
    stressed: 0,
    dormant: 0,
    extinct: 0,
  };
  for (const lineage of lineages) {
    ecologyCounts[resolveGenesisEcologyState({ lineage, world })] += 1;
  }
  const focusSummary =
    readGenesisFocusSummarySnapshotSync(env) ?? readGenesisFocusSummarySync(env);
  const skillEvolutionSummary =
    readGenesisSkillEvolutionSummarySnapshotSync(env) ?? readGenesisSkillEvolutionSummarySync(env);
  const dispatchSummary =
    readGenesisDispatchSummarySnapshotSync(env) ?? readGenesisDispatchSummarySync(env);
  const userIntentSummary =
    readGenesisUserIntentSummarySnapshotSync(env) ?? readGenesisUserIntentSummarySync(env);
  const profile = readGenesisExperimentProfileSync(env);
  const lineagesById = new Map(lineages.map((lineage) => [lineage.lineageId, lineage] as const));
  const generationDepthCache = new Map<string, number>();
  const resolveGenerationDepth = (lineageId: string): number => {
    const cached = generationDepthCache.get(lineageId);
    if (cached !== undefined) {
      return cached;
    }
    let depth = 0;
    let current = lineagesById.get(lineageId);
    const visited = new Set<string>();
    while (current?.parentLineageId?.trim()) {
      const parentLineageId = current.parentLineageId.trim();
      if (visited.has(parentLineageId)) {
        break;
      }
      visited.add(parentLineageId);
      depth += 1;
      current = lineagesById.get(parentLineageId);
    }
    generationDepthCache.set(lineageId, depth);
    return depth;
  };
  const climateDrivenSessionKeys = new Set(
    (dispatchSummary.activePlans ?? [])
      .filter((plan) =>
        ["search", "query", "consultation"].includes(
          plan.climateKind?.trim().toLowerCase() ?? "",
        ),
      )
      .flatMap((plan) => [
        plan.primarySessionKey,
        ...(dispatchSummary.coordinationQueue ?? [])
          .filter((entry) => entry.primarySessionKey === plan.primarySessionKey)
          .map((entry) => entry.sessionKey),
      ])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
  const planFounderSetsBySession = new Map<string, Set<GenesisFounderOrigin>>();
  const getPlanFounderSet = (primarySessionKey: string) => {
    const existing = planFounderSetsBySession.get(primarySessionKey);
    if (existing) {
      return existing;
    }
    const next = new Set<GenesisFounderOrigin>();
    planFounderSetsBySession.set(primarySessionKey, next);
    return next;
  };
  for (const plan of dispatchSummary.activePlans ?? []) {
    if (!plan.primarySessionKey?.trim()) {
      continue;
    }
    const founders = getPlanFounderSet(plan.primarySessionKey);
    const primaryFounder = resolveGenesisFounderOriginFromAgentId(plan.primaryAgentId);
    if (primaryFounder) {
      founders.add(primaryFounder);
    }
  }
  for (const entry of dispatchSummary.coordinationQueue ?? []) {
    if (!entry.primarySessionKey?.trim()) {
      continue;
    }
    const founder = resolveGenesisFounderOriginFromAgentId(entry.agentId);
    if (!founder) {
      continue;
    }
    getPlanFounderSet(entry.primarySessionKey).add(founder);
  }
  const planFounderSets = [...planFounderSetsBySession.values()];
  const founderLinkMap = new Map<GenesisFounderOrigin, Set<GenesisFounderOrigin>>();
  for (const founder of KNOWN_FOUNDER_ORIGINS) {
    founderLinkMap.set(founder, new Set<GenesisFounderOrigin>());
  }
  const founderCoordinationStats = new Map<
    GenesisFounderOrigin,
    {
      leadAgentIds: Set<string>;
      supportAgentIds: Set<string>;
      reviveAgentIds: Set<string>;
      leadYieldScore: number;
      supportYieldScore: number;
      reviveYieldScore: number;
    }
  >();
  for (const founder of KNOWN_FOUNDER_ORIGINS) {
    founderCoordinationStats.set(founder, {
      leadAgentIds: new Set<string>(),
      supportAgentIds: new Set<string>(),
      reviveAgentIds: new Set<string>(),
      leadYieldScore: 0,
      supportYieldScore: 0,
      reviveYieldScore: 0,
    });
  }
  for (const founders of planFounderSets) {
    const members = [...founders];
    for (const founder of members) {
      const linked = founderLinkMap.get(founder);
      if (!linked) {
        continue;
      }
      for (const peer of members) {
        if (peer !== founder) {
          linked.add(peer);
        }
      }
    }
  }
  for (const entry of dispatchSummary.coordinationQueue ?? []) {
    const founder = resolveGenesisFounderOriginFromAgentId(entry.agentId);
    if (!founder) {
      continue;
    }
    const stats = founderCoordinationStats.get(founder);
    if (!stats) {
      continue;
    }
    const lineage = lineagesById.get(entry.agentId);
    const yieldScore = (lineage?.publicValue ?? 0) + (lineage?.survivalCredit ?? 0);
    if (entry.action === "lead") {
      if (!stats.leadAgentIds.has(entry.agentId)) {
        stats.leadAgentIds.add(entry.agentId);
        stats.leadYieldScore += yieldScore;
      }
    } else if (entry.action === "assist") {
      if (!stats.supportAgentIds.has(entry.agentId)) {
        stats.supportAgentIds.add(entry.agentId);
        stats.supportYieldScore += yieldScore;
      }
    } else if (entry.action === "reactivate") {
      if (!stats.reviveAgentIds.has(entry.agentId)) {
        stats.reviveAgentIds.add(entry.agentId);
        stats.reviveYieldScore += yieldScore;
      }
    }
  }
  const reactivatedAgentIds = new Set(
    (dispatchSummary.coordinationQueue ?? [])
      .filter((entry) => entry.action === "reactivate")
      .map((entry) => entry.agentId)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );
  const childCounts = new Map<string, number>();
  const replicationLatencies: number[] = [];
  let childLineageCount = 0;
  let specialtyOnlyChildCount = 0;
  let superpowerChildCount = 0;
  let pressureAmplifiedSuperpowerChildCount = 0;
  let pressureAmplifiedSuperpowerWorkingChildCount = 0;
  let specialtyWorkingChildCount = 0;
  let specialtyProactiveChildCount = 0;
  let specialtyChildPublicValue = 0;
  let superpowerWorkingChildCount = 0;
  let superpowerProactiveChildCount = 0;
  let superpowerChildPublicValue = 0;
  let multiGenerationLineageCount = 0;
  let secondGenerationChildCount = 0;
  let thirdGenerationChildCount = 0;
  let deepestGenerationDepth = 0;
  let multiGenerationWorkingChildCount = 0;
  let multiGenerationProactiveChildCount = 0;
  let multiGenerationSuperpowerChildCount = 0;
  let multiGenerationPublicValue = 0;
  let childWorkingLineageCount = 0;
  let heartbeatLineageCount = 0;
  let workingLineageCount = 0;
  let proactiveWorkingLineageCount = 0;
  let totalPublicValue = 0;
  let totalPrivateValue = 0;
  let totalSurvivalCredit = 0;
  let totalExpansionCredit = 0;
  let climateResponsiveReplicationParentCount = 0;
  let survivalResponsiveReplicationParentCount = 0;
  let proactiveReplicationParentCount = 0;
  let stressedLineageCount = 0;
  let dormantLineageCount = 0;
  let extinctLineageCount = 0;
  let nearDeathLineageCount = 0;
  let recoverableLineageCount = 0;
  let terminalLineageCount = 0;
  let backslidingLineageCount = 0;
  let climatePressuredChildCount = 0;
  let climatePressuredSuperpowerChildCount = 0;
  let climatePressuredChildValueScore = 0;
  let climateSpecialtyWorkingChildCount = 0;
  let climateSpecialtyProactiveChildCount = 0;
  let climateSpecialtyChildPublicValue = 0;
  let climateSuperpowerWorkingChildCount = 0;
  let climateSuperpowerProactiveChildCount = 0;
  let climateSuperpowerChildPublicValue = 0;
  let survivalPressuredChildCount = 0;
  let survivalPressuredSuperpowerChildCount = 0;
  let survivalPressuredChildValueScore = 0;
  let survivalSpecialtyWorkingChildCount = 0;
  let survivalSpecialtyProactiveChildCount = 0;
  let survivalSpecialtyChildPublicValue = 0;
  let survivalSuperpowerWorkingChildCount = 0;
  let survivalSuperpowerProactiveChildCount = 0;
  let survivalSuperpowerChildPublicValue = 0;
  let founderRoleCoverageCount = 0;
  let founderYieldCoverageCount = 0;
  let roleAlignedWorkingLineageCount = 0;
  let roleAlignedProactiveLineageCount = 0;
  let roleAlignedProactiveYieldScore = 0;
  const founderRoleBreakdownMap = new Map<GenesisFounderOrigin, GenesisFounderRoleBreakdown>();
  const climateResponsiveParentIds = new Set<string>();
  const survivalResponsiveParentIds = new Set<string>();
  for (const lineage of lineages) {
    const productive = isProductiveLineage(lineage);
    const founderOrigin = resolveGenesisFounderOrigin(lineage);
    const ecologyState = resolveGenesisEcologyState({ lineage, world });
    const roleSignals = founderOrigin
      ? lineageHasRoleAlignedSignals({
          founderOrigin,
          lineageId: lineage.lineageId,
          env,
        })
      : { activeFocusCount: 0, activeTriggerCount: 0, aligned: false };
    const lowSurvivalMargin = lineage.survivalCredit <= (world?.currentPressure ?? 0) + 0.25;
    const nearDeath =
      ecologyState === "stressed" || ecologyState === "dormant" || ecologyState === "extinct" || lowSurvivalMargin;
    const recoverable =
      (ecologyState === "dormant" || ecologyState === "extinct" || lowSurvivalMargin) &&
      (roleSignals.activeFocusCount > 0 ||
        roleSignals.activeTriggerCount > 0 ||
        reactivatedAgentIds.has(lineage.lineageId));
    if (ecologyState === "stressed") {
      stressedLineageCount += 1;
    } else if (ecologyState === "dormant") {
      dormantLineageCount += 1;
    } else if (ecologyState === "extinct") {
      extinctLineageCount += 1;
    }
    if (nearDeath) {
      nearDeathLineageCount += 1;
    }
    if (recoverable) {
      recoverableLineageCount += 1;
    }
    const terminal = (ecologyState === "dormant" || ecologyState === "extinct") && !recoverable;
    const backsliding = nearDeath && !recoverable;
    if (terminal) {
      terminalLineageCount += 1;
    }
    if (backsliding) {
      backslidingLineageCount += 1;
    }
    const proactiveWorking =
      productive &&
      (lineage.lastReason?.trim().toLowerCase() === "heartbeat" ||
        roleSignals.activeFocusCount > 0 ||
        roleSignals.activeTriggerCount > 0);
    if (productive) {
      workingLineageCount += 1;
    }
    totalPublicValue += lineage.publicValue;
    totalPrivateValue += lineage.privateValue;
    totalSurvivalCredit += lineage.survivalCredit;
    totalExpansionCredit += lineage.expansionCredit;
    if (lineage.parentLineageId?.trim()) {
      const generationDepth = resolveGenerationDepth(lineage.lineageId);
      childLineageCount += 1;
      deepestGenerationDepth = Math.max(deepestGenerationDepth, generationDepth);
      if (generationDepth >= 2) {
        multiGenerationLineageCount += 1;
        multiGenerationPublicValue += lineage.publicValue;
        if (productive) {
          multiGenerationWorkingChildCount += 1;
        }
        if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
          multiGenerationProactiveChildCount += 1;
        }
        if (lineage.superpowerInherited === true) {
          multiGenerationSuperpowerChildCount += 1;
        }
      }
      if (generationDepth === 2) {
        secondGenerationChildCount += 1;
      }
      if (generationDepth >= 3) {
        thirdGenerationChildCount += 1;
      }
      if (founderOrigin) {
        const existing = founderRoleBreakdownMap.get(founderOrigin) ?? {
          founderOrigin,
          lineageCount: 0,
          workingLineageCount: 0,
          proactiveWorkingLineageCount: 0,
          roleAlignedLineageCount: 0,
          roleAlignedProactiveLineageCount: 0,
          activeFocusCount: 0,
          activeTriggerCount: 0,
          historyIntentScore: 0,
          profileIntentScore: 0,
          userIntentAlignmentScore: 0,
          publicValue: 0,
          survivalCredit: 0,
          proactivePublicValue: 0,
          proactiveSurvivalCredit: 0,
          alignedProactiveYieldScore: 0,
          proactiveYieldEfficiency: 0,
          childCount: 0,
          workingChildCount: 0,
          proactiveChildCount: 0,
          superpowerChildCount: 0,
          superpowerWorkingChildCount: 0,
          superpowerProactiveChildCount: 0,
          superpowerChildValueScore: 0,
          superpowerChildYieldEfficiency: 0,
          superpowerChildSustainedValueScore: 0,
          deepestGenerationDepth: 0,
          secondGenerationChildCount: 0,
          thirdGenerationChildCount: 0,
          multiGenerationChildCount: 0,
          multiGenerationWorkingChildCount: 0,
          multiGenerationProactiveChildCount: 0,
          multiGenerationSuperpowerChildCount: 0,
          multiGenerationSuperpowerWorkingChildCount: 0,
          multiGenerationSuperpowerProactiveChildCount: 0,
          multiGenerationSuperpowerValueScore: 0,
          multiGenerationValueScore: 0,
          multiGenerationYieldEfficiency: 0,
          replicationValueScore: 0,
          degradedChildCount: 0,
          degradedSuperpowerChildCount: 0,
          childDegradationScore: 0,
          superpowerChildDurabilityPenaltyScore: 0,
          superpowerChildDurabilityScore: 0,
          longTermDegradationScore: 0,
          longTermRecoveryScore: 0,
        };
        existing.childCount += 1;
        existing.deepestGenerationDepth = Math.max(
          existing.deepestGenerationDepth ?? 0,
          generationDepth,
        );
        if (generationDepth >= 2) {
          existing.multiGenerationChildCount = (existing.multiGenerationChildCount ?? 0) + 1;
          existing.multiGenerationValueScore =
            (existing.multiGenerationValueScore ?? 0) +
            lineage.publicValue +
            lineage.survivalCredit;
          if (productive) {
            existing.multiGenerationWorkingChildCount =
              (existing.multiGenerationWorkingChildCount ?? 0) + 1;
          }
          if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
            existing.multiGenerationProactiveChildCount =
              (existing.multiGenerationProactiveChildCount ?? 0) + 1;
          }
          if (lineage.superpowerInherited === true) {
            existing.multiGenerationSuperpowerChildCount =
              (existing.multiGenerationSuperpowerChildCount ?? 0) + 1;
            existing.multiGenerationSuperpowerValueScore =
              (existing.multiGenerationSuperpowerValueScore ?? 0) +
              lineage.publicValue +
              lineage.survivalCredit;
            if (productive) {
              existing.multiGenerationSuperpowerWorkingChildCount =
                (existing.multiGenerationSuperpowerWorkingChildCount ?? 0) + 1;
            }
            if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
              existing.multiGenerationSuperpowerProactiveChildCount =
                (existing.multiGenerationSuperpowerProactiveChildCount ?? 0) + 1;
            }
          }
        }
        if (generationDepth === 2) {
          existing.secondGenerationChildCount =
            (existing.secondGenerationChildCount ?? 0) + 1;
        }
        if (generationDepth >= 3) {
          existing.thirdGenerationChildCount =
            (existing.thirdGenerationChildCount ?? 0) + 1;
        }
        if (productive) {
          existing.workingChildCount += 1;
        }
        if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
          existing.proactiveChildCount += 1;
        }
        if (lineage.superpowerInherited === true) {
          existing.superpowerChildCount += 1;
          existing.superpowerChildValueScore =
            (existing.superpowerChildValueScore ?? 0) +
            lineage.publicValue +
            lineage.survivalCredit;
          if (productive) {
            existing.superpowerWorkingChildCount =
              (existing.superpowerWorkingChildCount ?? 0) + 1;
          }
          if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
            existing.superpowerProactiveChildCount =
              (existing.superpowerProactiveChildCount ?? 0) + 1;
          }
        }
        existing.replicationValueScore += lineage.publicValue + lineage.survivalCredit;
        founderRoleBreakdownMap.set(founderOrigin, existing);
      }
      if (lineage.superpowerInherited === true) {
        superpowerChildCount += 1;
        superpowerChildPublicValue += lineage.publicValue;
        if (lineage.privilegeInheritanceReason === "genesis_pressure_contribution_inheritance") {
          pressureAmplifiedSuperpowerChildCount += 1;
        }
        if (productive) {
          superpowerWorkingChildCount += 1;
          if (lineage.privilegeInheritanceReason === "genesis_pressure_contribution_inheritance") {
            pressureAmplifiedSuperpowerWorkingChildCount += 1;
          }
        }
      } else {
        specialtyOnlyChildCount += 1;
        specialtyChildPublicValue += lineage.publicValue;
        if (productive) {
          specialtyWorkingChildCount += 1;
        }
      }
      if (productive) {
        childWorkingLineageCount += 1;
      }
      childCounts.set(
        lineage.parentLineageId,
        (childCounts.get(lineage.parentLineageId) ?? 0) + 1,
      );
      const parentLineage = lineagesById.get(lineage.parentLineageId);
      if (
        parentLineage &&
        Number.isFinite(parentLineage.lastCompletionTs) &&
        Number.isFinite(lineage.lastCompletionTs) &&
        lineage.lastCompletionTs >= parentLineage.lastCompletionTs
      ) {
        replicationLatencies.push(lineage.lastCompletionTs - parentLineage.lastCompletionTs);
      }
    }
    if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
      heartbeatLineageCount += 1;
    }
    if (proactiveWorking) {
      proactiveWorkingLineageCount += 1;
      if (lineage.parentLineageId?.trim()) {
        if (lineage.superpowerInherited === true) {
          superpowerProactiveChildCount += 1;
        } else {
          specialtyProactiveChildCount += 1;
        }
      }
    }
    if (founderOrigin) {
      const existing = founderRoleBreakdownMap.get(founderOrigin) ?? {
        founderOrigin,
        lineageCount: 0,
        workingLineageCount: 0,
        proactiveWorkingLineageCount: 0,
        roleAlignedLineageCount: 0,
        roleAlignedProactiveLineageCount: 0,
        activeFocusCount: 0,
        activeTriggerCount: 0,
        historyIntentScore: 0,
        profileIntentScore: 0,
        userIntentAlignmentScore: 0,
        publicValue: 0,
        survivalCredit: 0,
        proactivePublicValue: 0,
        proactiveSurvivalCredit: 0,
        alignedProactiveYieldScore: 0,
        proactiveYieldEfficiency: 0,
        childCount: 0,
        workingChildCount: 0,
        proactiveChildCount: 0,
        superpowerChildCount: 0,
        superpowerWorkingChildCount: 0,
        superpowerProactiveChildCount: 0,
        superpowerChildValueScore: 0,
        superpowerChildYieldEfficiency: 0,
        superpowerChildSustainedValueScore: 0,
        replicationValueScore: 0,
        degradedChildCount: 0,
        degradedSuperpowerChildCount: 0,
        childDegradationScore: 0,
        superpowerChildDurabilityPenaltyScore: 0,
        superpowerChildDurabilityScore: 0,
        longTermDegradationScore: 0,
        longTermRecoveryScore: 0,
      };
      existing.lineageCount += 1;
      existing.publicValue += lineage.publicValue;
      existing.survivalCredit += lineage.survivalCredit;
      existing.activeFocusCount += roleSignals.activeFocusCount;
      existing.activeTriggerCount += roleSignals.activeTriggerCount;
      if (productive) {
        existing.workingLineageCount += 1;
      }
      if (proactiveWorking) {
        existing.proactiveWorkingLineageCount += 1;
        existing.proactivePublicValue += lineage.publicValue;
        existing.proactiveSurvivalCredit += lineage.survivalCredit;
      }
      if (ecologyState === "stressed") {
        existing.stressedLineageCount = (existing.stressedLineageCount ?? 0) + 1;
      } else if (ecologyState === "dormant") {
        existing.dormantLineageCount = (existing.dormantLineageCount ?? 0) + 1;
      } else if (ecologyState === "extinct") {
        existing.extinctLineageCount = (existing.extinctLineageCount ?? 0) + 1;
      }
      if (nearDeath) {
        existing.nearDeathLineageCount = (existing.nearDeathLineageCount ?? 0) + 1;
      }
      if (recoverable) {
        existing.recoverableLineageCount = (existing.recoverableLineageCount ?? 0) + 1;
      }
      if (terminal) {
        existing.terminalLineageCount = (existing.terminalLineageCount ?? 0) + 1;
      }
      if (backsliding) {
        existing.backslidingLineageCount = (existing.backslidingLineageCount ?? 0) + 1;
      }
      if (roleSignals.aligned) {
        existing.roleAlignedLineageCount += 1;
        if (productive) {
          roleAlignedWorkingLineageCount += 1;
        }
        if (proactiveWorking) {
          existing.roleAlignedProactiveLineageCount += 1;
          existing.alignedProactiveYieldScore += lineage.publicValue + lineage.survivalCredit;
          roleAlignedProactiveLineageCount += 1;
          roleAlignedProactiveYieldScore += lineage.publicValue + lineage.survivalCredit;
        }
      }
      founderRoleBreakdownMap.set(founderOrigin, existing);
    }
  }
  const founderRoleBreakdown = [...founderRoleBreakdownMap.values()];
  const userIntentLeaderMap = new Map(
    (userIntentSummary?.founderIntentLeaders ?? []).map((entry) => [entry.founderOrigin, entry] as const),
  );
  let historyDrivenProactiveLineageCount = 0;
  let userProfileDrivenProactiveLineageCount = 0;
  let userIntentDrivenProactiveYieldScore = 0;
  for (const entry of founderRoleBreakdown) {
    const userIntentLeader = userIntentLeaderMap.get(entry.founderOrigin);
    entry.historyIntentScore = userIntentLeader?.historyIntentScore ?? 0;
    entry.profileIntentScore = userIntentLeader?.profileIntentScore ?? 0;
    entry.userIntentAlignmentScore = userIntentLeader?.userIntentAlignmentScore ?? 0;
    entry.timeWeightedHistoryIntentScore = userIntentLeader?.timeWeightedHistoryIntentScore ?? 0;
    entry.workProfileIntentScore = userIntentLeader?.workProfileIntentScore ?? 0;
    entry.interestProfileIntentScore = userIntentLeader?.interestProfileIntentScore ?? 0;
    entry.longTermIntentAlignmentScore = userIntentLeader?.longTermIntentAlignmentScore ?? 0;
    const baselineCount =
      entry.roleAlignedProactiveLineageCount > 0
        ? entry.roleAlignedProactiveLineageCount
        : entry.proactiveWorkingLineageCount;
    const baselineYield =
      entry.roleAlignedProactiveLineageCount > 0
        ? entry.alignedProactiveYieldScore
        : entry.proactivePublicValue + entry.proactiveSurvivalCredit;
    entry.proactiveYieldEfficiency =
      baselineCount > 0 ? baselineYield / baselineCount : 0;
    entry.superpowerChildYieldEfficiency =
      (entry.superpowerWorkingChildCount ?? 0) > 0
        ? ((entry.superpowerChildValueScore ?? 0) +
            (entry.superpowerProactiveChildCount ?? 0) * 0.25) /
          Math.max(1, entry.superpowerWorkingChildCount ?? 0)
        : 0;
    entry.superpowerChildSustainedValueScore =
      (entry.superpowerChildYieldEfficiency ?? 0) * 0.55 +
      Math.max(0, entry.multiGenerationSuperpowerValueScore ?? 0) * 0.45 +
      Math.max(0, entry.multiGenerationSuperpowerProactiveChildCount ?? 0) * 0.15;
    entry.multiGenerationYieldEfficiency =
      (entry.multiGenerationWorkingChildCount ?? 0) > 0
        ? ((entry.multiGenerationValueScore ?? 0) +
            (entry.multiGenerationProactiveChildCount ?? 0) * 0.25) /
          Math.max(1, entry.multiGenerationWorkingChildCount ?? 0)
        : 0;
    if ((entry.historyIntentScore ?? 0) > 0) {
      historyDrivenProactiveLineageCount += entry.proactiveWorkingLineageCount;
    }
    if ((entry.profileIntentScore ?? 0) > 0) {
      userProfileDrivenProactiveLineageCount += entry.proactiveWorkingLineageCount;
    }
    if ((entry.userIntentAlignmentScore ?? 0) > 0) {
      userIntentDrivenProactiveYieldScore +=
        (entry.alignedProactiveYieldScore ?? 0) + (entry.proactiveYieldEfficiency ?? 0) * 0.5;
    }
    const linkedFounders = [...(founderLinkMap.get(entry.founderOrigin) ?? new Set<GenesisFounderOrigin>())];
    entry.linkedFounders = linkedFounders;
    entry.linkedFounderCount = linkedFounders.length;
    entry.collaborativeChildCount =
      entry.linkedFounderCount > 0 ? (entry.childCount ?? 0) : 0;
    entry.linkedExpansionScore =
      (entry.collaborativeChildCount ?? 0) +
      (entry.proactiveChildCount ?? 0) * 0.5 +
      (entry.linkedFounderCount ?? 0) * 0.75;
    entry.collaborationInfluenceScore =
      (entry.linkedFounderCount ?? 0) * 1.5 +
      entry.proactiveWorkingLineageCount * 0.5 +
      entry.roleAlignedProactiveLineageCount * 0.75 +
      entry.alignedProactiveYieldScore * 0.25;
    entry.cooperativeYieldScore =
      (entry.linkedFounderCount ?? 0) > 0
        ? (entry.alignedProactiveYieldScore +
            (entry.linkedExpansionScore ?? 0) * 0.75 +
            entry.proactiveWorkingLineageCount * 0.5) /
          Math.max(1, entry.linkedFounderCount ?? 0)
        : 0;
    const coordinationStats = founderCoordinationStats.get(entry.founderOrigin);
    entry.leadAssignmentCount = coordinationStats?.leadAgentIds.size ?? 0;
    entry.supportAssignmentCount = coordinationStats?.supportAgentIds.size ?? 0;
    entry.reviveAssignmentCount = coordinationStats?.reviveAgentIds.size ?? 0;
    entry.leadYieldScore = coordinationStats?.leadYieldScore ?? 0;
    entry.supportYieldScore = coordinationStats?.supportYieldScore ?? 0;
    entry.reviveYieldScore = coordinationStats?.reviveYieldScore ?? 0;
    entry.leadCooperationScore =
      (entry.leadAssignmentCount ?? 0) > 0
        ? ((entry.leadYieldScore ?? 0) +
            (entry.linkedFounderCount ?? 0) * 0.75 +
            entry.alignedProactiveYieldScore * 0.25) /
          Math.max(1, entry.leadAssignmentCount ?? 0)
        : 0;
    entry.supportCooperationScore =
      (entry.supportAssignmentCount ?? 0) > 0
        ? ((entry.supportYieldScore ?? 0) +
            (entry.linkedFounderCount ?? 0) * 0.5 +
            entry.proactiveWorkingLineageCount * 0.25) /
          Math.max(1, entry.supportAssignmentCount ?? 0)
        : 0;
    entry.mortalityScore =
      (entry.stressedLineageCount ?? 0) +
      (entry.dormantLineageCount ?? 0) * 2 +
      (entry.extinctLineageCount ?? 0) * 3 +
      (entry.nearDeathLineageCount ?? 0) * 0.5 -
      (entry.recoverableLineageCount ?? 0) * 0.25;
    entry.terminalMortalityScore = Math.max(
      0,
      (entry.terminalLineageCount ?? 0) * 1.6 +
        (entry.backslidingLineageCount ?? 0) * 0.6 +
        (entry.extinctLineageCount ?? 0) * 0.4 -
        (entry.recoverableLineageCount ?? 0) * 0.2,
    );
    entry.recoveryInfluenceScore =
      (entry.recoverableLineageCount ?? 0) * 2 +
      (entry.linkedFounderCount ?? 0) * 0.75 +
      entry.proactiveWorkingLineageCount * 0.5 +
      (entry.activeFocusCount > 0 ? 0.25 : 0) +
      (entry.activeTriggerCount > 0 ? 0.25 : 0);
    entry.stableRecoveryScore =
      (entry.recoverableLineageCount ?? 0) * 2.5 +
      entry.proactiveWorkingLineageCount * 0.5 +
      (entry.linkedFounderCount ?? 0) * 0.75 +
      entry.alignedProactiveYieldScore * 0.15 -
      (entry.dormantLineageCount ?? 0) * 0.5 -
      (entry.extinctLineageCount ?? 0) -
      (entry.nearDeathLineageCount ?? 0) * 0.25;
    const recoveryPressureLoad =
      (entry.nearDeathLineageCount ?? 0) +
      (entry.dormantLineageCount ?? 0) * 1.5 +
      (entry.extinctLineageCount ?? 0) * 2 +
      (entry.stressedLineageCount ?? 0) * 0.5;
    const durableRecoveryBase =
      (entry.recoverableLineageCount ?? 0) * 2 +
      entry.proactiveWorkingLineageCount * 0.5 +
      (entry.linkedFounderCount ?? 0) * 0.5 +
      entry.alignedProactiveYieldScore * 0.1;
    entry.durableRecoveryScore =
      durableRecoveryBase > 0 ? durableRecoveryBase / Math.max(1, recoveryPressureLoad) : 0;
    entry.reviveCooperationScore =
      (entry.reviveAssignmentCount ?? 0) > 0
        ? ((entry.reviveYieldScore ?? 0) +
            (entry.recoverableLineageCount ?? 0) * 0.75 +
            (entry.stableRecoveryScore ?? 0) * 0.25) /
          Math.max(1, entry.reviveAssignmentCount ?? 0)
        : 0;
    entry.transientRecoveryScore = Math.max(
      0,
      (entry.recoveryInfluenceScore ?? 0) +
        (entry.nearDeathLineageCount ?? 0) * 0.4 +
        (entry.dormantLineageCount ?? 0) * 0.6 -
        (entry.stableRecoveryScore ?? 0) * 0.7 -
        (entry.durableRecoveryScore ?? 0) * 0.9,
    );
    entry.transientRecoveryRate =
      (entry.nearDeathLineageCount ?? 0) > 0
        ? (entry.transientRecoveryScore ?? 0) / Math.max(1, entry.nearDeathLineageCount ?? 0)
        : 0;
    entry.stableRecoveryRate =
      (entry.recoverableLineageCount ?? 0) > 0
        ? (entry.stableRecoveryScore ?? 0) / Math.max(1, entry.recoverableLineageCount ?? 0)
        : 0;
    entry.durableRecoveryRate =
      recoveryPressureLoad > 0
        ? (entry.durableRecoveryScore ?? 0) / Math.max(1, recoveryPressureLoad)
        : 0;
    entry.recoveryChainScore =
      (entry.transientRecoveryRate ?? 0) * 0.2 +
      (entry.stableRecoveryRate ?? 0) * 0.45 +
      (entry.durableRecoveryRate ?? 0) * 0.85;
    entry.survivalClosureScore = Math.max(
      0,
      (entry.stableRecoveryScore ?? 0) * 0.35 +
        (entry.durableRecoveryScore ?? 0) * 0.9 +
        (entry.recoveryChainScore ?? 0) * 1.1 -
        (entry.terminalMortalityScore ?? 0) * 0.45 -
        (entry.transientRecoveryScore ?? 0) * 0.15,
    );
    const nonWorkingChildCount = Math.max(
      0,
      (entry.childCount ?? 0) - (entry.workingChildCount ?? 0),
    );
    const nonProactiveChildCount = Math.max(
      0,
      (entry.workingChildCount ?? 0) - (entry.proactiveChildCount ?? 0),
    );
    const multiGenerationDropoffCount = Math.max(
      0,
      (entry.multiGenerationChildCount ?? 0) - (entry.multiGenerationWorkingChildCount ?? 0),
    );
    entry.degradedChildCount = nonWorkingChildCount + multiGenerationDropoffCount;
    entry.degradedSuperpowerChildCount = Math.max(
      0,
      (entry.superpowerChildCount ?? 0) - (entry.superpowerWorkingChildCount ?? 0),
    );
    entry.childDegradationScore = Math.max(
      0,
      (entry.degradedChildCount ?? 0) * 0.75 +
        nonProactiveChildCount * 0.35 +
        (entry.degradedSuperpowerChildCount ?? 0) * 1.1 +
        Math.max(0, entry.dormantLineageCount ?? 0) *
          profile.learningMortalityDebtDormantWeight *
          0.35 +
        Math.max(0, entry.extinctLineageCount ?? 0) *
          profile.learningMortalityDebtExtinctWeight *
          0.22 +
        (entry.terminalMortalityScore ?? 0) * 0.2 -
        (entry.multiGenerationYieldEfficiency ?? 0) * 0.4 -
        (entry.survivalClosureScore ?? 0) * 0.15,
    );
    const superpowerMultiGenerationDropoffCount = Math.max(
      0,
      (entry.multiGenerationSuperpowerChildCount ?? 0) -
        (entry.multiGenerationSuperpowerWorkingChildCount ?? 0),
    );
    entry.superpowerChildDurabilityPenaltyScore = Math.max(
      0,
      (entry.degradedSuperpowerChildCount ?? 0) * 1.15 +
        superpowerMultiGenerationDropoffCount * 0.95 +
        Math.max(0, (entry.multiGenerationSuperpowerChildCount ?? 0) -
          (entry.multiGenerationSuperpowerProactiveChildCount ?? 0)) *
          0.35 +
        (entry.childDegradationScore ?? 0) * 0.45 +
        Math.max(0, entry.terminalMortalityScore ?? 0) * 0.18 -
        (entry.superpowerChildYieldEfficiency ?? 0) * 0.4 -
        (entry.superpowerChildSustainedValueScore ?? 0) * 0.22 -
        (entry.survivalClosureScore ?? 0) * 0.1,
    );
    entry.superpowerChildDurabilityScore = Math.max(
      0,
      (entry.superpowerChildSustainedValueScore ?? 0) -
        (entry.superpowerChildDurabilityPenaltyScore ?? 0),
    );
    entry.longTermDegradationScore = Math.max(
      0,
      (entry.childDegradationScore ?? 0) * 0.7 +
        (entry.superpowerChildDurabilityPenaltyScore ?? 0) * 1.05 +
        Math.max(0, entry.terminalMortalityScore ?? 0) * 0.45 +
        Math.max(0, entry.backslidingLineageCount ?? 0) * 0.35 -
        (entry.survivalClosureScore ?? 0) * 0.25 -
        (entry.multiGenerationEffectiveScore ?? 0) * 0.18,
    );
    entry.multiGenerationEffectiveScore = Math.max(
      0,
      (entry.multiGenerationValueScore ?? 0) +
        (entry.multiGenerationYieldEfficiency ?? 0) * 0.6 -
        (entry.superpowerChildDurabilityPenaltyScore ?? 0) * 0.9,
    );
    entry.longTermRecoveryScore = Math.max(
      0,
      (entry.multiGenerationEffectiveScore ?? 0) * 0.85 +
        (entry.multiGenerationYieldEfficiency ?? 0) * 0.55 +
        (entry.stableRecoveryScore ?? 0) * 0.5 +
        (entry.durableRecoveryScore ?? 0) * 0.8 +
        (entry.recoveryChainScore ?? 0) * 0.7 +
        (entry.survivalClosureScore ?? 0) * 0.65 -
        (entry.longTermDegradationScore ?? 0) * 0.6,
    );
    entry.replicationTempoScore =
      (entry.childCount ?? 0) +
      (entry.workingChildCount ?? 0) * 0.5 +
      (entry.proactiveChildCount ?? 0) * 0.75 +
      (entry.superpowerChildCount ?? 0) * 0.5;
  }
  founderRoleBreakdown.sort(
    (left, right) =>
      (right.proactiveYieldEfficiency ?? 0) - (left.proactiveYieldEfficiency ?? 0) ||
      right.roleAlignedProactiveLineageCount - left.roleAlignedProactiveLineageCount ||
      right.proactiveWorkingLineageCount - left.proactiveWorkingLineageCount ||
      left.founderOrigin.localeCompare(right.founderOrigin),
  );
  founderRoleCoverageCount = founderRoleBreakdown.filter(
    (entry) => entry.roleAlignedProactiveLineageCount > 0,
  ).length;
  founderYieldCoverageCount = founderRoleBreakdown.filter(
    (entry) => entry.alignedProactiveYieldScore > 0,
  ).length;
  const topParentLineages = [...childCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([lineageId, childCount]) => {
      const lineage = lineages.find((entry) => entry.lineageId === lineageId) ?? null;
      return {
        lineageId,
        childCount,
        ecologyState: resolveGenesisEcologyState({ lineage, world }),
      };
    });
  const replicatingParentCount = childCounts.size;
  const replicatingParentIds = [...childCounts.keys()];
  const isClimateResponsiveParent = (lineage: GenesisLineageRecord | undefined) =>
    !!lineage &&
    (((world?.currentPressure ?? 0) >= 0.75 || (world?.stormMomentum ?? 0) >= 0.75) ||
      climateDrivenSessionKeys.has(lineage.latestSessionKey));
  const isSurvivalResponsiveParent = (lineage: GenesisLineageRecord | undefined) => {
    if (!lineage) {
      return false;
    }
    const ecologyState = resolveGenesisEcologyState({ lineage, world });
    const productiveProactive =
      lineage.lastReason?.trim().toLowerCase() === "heartbeat" &&
      isProductiveLineage(lineage);
    const lowSurvivalMargin = lineage.survivalCredit <= 1;
    return (
      lineage.survivalCredit < (world?.currentPressure ?? 0) ||
      (productiveProactive && lowSurvivalMargin) ||
      (productiveProactive &&
        (ecologyState === "stressed" || ecologyState === "dormant"))
    );
  };
  const replicatingWorkingParentCount = replicatingParentIds.filter((lineageId) => {
    const lineage = lineagesById.get(lineageId);
    return lineage ? isProductiveLineage(lineage) : false;
  }).length;
  climateResponsiveReplicationParentCount = replicatingParentIds.filter((lineageId) => {
    const lineage = lineagesById.get(lineageId);
    const responsive = isClimateResponsiveParent(lineage);
    if (responsive) {
      climateResponsiveParentIds.add(lineageId);
    }
    return responsive;
  }).length;
  survivalResponsiveReplicationParentCount = replicatingParentIds.filter((lineageId) => {
    const lineage = lineagesById.get(lineageId);
    const responsive = isSurvivalResponsiveParent(lineage);
    if (responsive) {
      survivalResponsiveParentIds.add(lineageId);
    }
    return responsive;
  }).length;
  proactiveReplicationParentCount = replicatingParentIds.filter((lineageId) => {
    const lineage = lineagesById.get(lineageId);
    if (!lineage) {
      return false;
    }
    return lineage.lastReason?.trim().toLowerCase() === "heartbeat";
  }).length;
  for (const lineage of lineages) {
    const parentLineageId = lineage.parentLineageId?.trim();
    if (!parentLineageId) {
      continue;
    }
    const founderOrigin = resolveGenesisFounderOrigin(lineage);
    if (climateResponsiveParentIds.has(parentLineageId)) {
      climatePressuredChildCount += 1;
      climatePressuredChildValueScore += lineage.publicValue + lineage.survivalCredit;
      if (lineage.superpowerInherited === true) {
        climatePressuredSuperpowerChildCount += 1;
        if (isProductiveLineage(lineage)) {
          climateSuperpowerWorkingChildCount += 1;
        }
        if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
          climateSuperpowerProactiveChildCount += 1;
        }
        climateSuperpowerChildPublicValue += lineage.publicValue;
      } else {
        if (isProductiveLineage(lineage)) {
          climateSpecialtyWorkingChildCount += 1;
        }
        if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
          climateSpecialtyProactiveChildCount += 1;
        }
        climateSpecialtyChildPublicValue += lineage.publicValue;
      }
      if (founderOrigin) {
        const existing = founderRoleBreakdownMap.get(founderOrigin);
        if (existing) {
          existing.climateChildCount = (existing.climateChildCount ?? 0) + 1;
          existing.climateReplicationValueScore =
            (existing.climateReplicationValueScore ?? 0) +
            lineage.publicValue +
            lineage.survivalCredit;
          if (lineage.superpowerInherited === true) {
            existing.climateSuperpowerChildCount =
              (existing.climateSuperpowerChildCount ?? 0) + 1;
          }
        }
      }
    }
    if (survivalResponsiveParentIds.has(parentLineageId)) {
      survivalPressuredChildCount += 1;
      survivalPressuredChildValueScore += lineage.publicValue + lineage.survivalCredit;
      if (lineage.superpowerInherited === true) {
        survivalPressuredSuperpowerChildCount += 1;
        if (isProductiveLineage(lineage)) {
          survivalSuperpowerWorkingChildCount += 1;
        }
        if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
          survivalSuperpowerProactiveChildCount += 1;
        }
        survivalSuperpowerChildPublicValue += lineage.publicValue;
      } else {
        if (isProductiveLineage(lineage)) {
          survivalSpecialtyWorkingChildCount += 1;
        }
        if (lineage.lastReason?.trim().toLowerCase() === "heartbeat") {
          survivalSpecialtyProactiveChildCount += 1;
        }
        survivalSpecialtyChildPublicValue += lineage.publicValue;
      }
      if (founderOrigin) {
        const existing = founderRoleBreakdownMap.get(founderOrigin);
        if (existing) {
          existing.survivalChildCount = (existing.survivalChildCount ?? 0) + 1;
          existing.survivalReplicationValueScore =
            (existing.survivalReplicationValueScore ?? 0) +
            lineage.publicValue +
            lineage.survivalCredit;
          if (lineage.superpowerInherited === true) {
            existing.survivalSuperpowerChildCount =
              (existing.survivalSuperpowerChildCount ?? 0) + 1;
          }
        }
      }
    }
  }
  const maxChildrenPerParent =
    topParentLineages.length > 0 ? topParentLineages[0]!.childCount : 0;
  const proactiveReadyLineageCount = Math.max(
    focusSummary.activeLineageCount,
    skillEvolutionSummary.topLineages.filter(
      (entry) => entry.capturedCount > 0 || entry.derivedCount > 0,
    ).length,
  );
  const proactiveSignalScore =
    focusSummary.activeFocusCount * 1.5 +
    focusSummary.activeTriggerCount +
    skillEvolutionSummary.modeCounts.captured * 0.75 +
    skillEvolutionSummary.modeCounts.derived * 0.5 +
    heartbeatLineageCount * 0.5 +
    childLineageCount * 0.25;
  const autonomousExpansionScore =
    childLineageCount +
    childWorkingLineageCount * 1.5 +
    replicatingWorkingParentCount +
    totalExpansionCredit;
  const proactiveSpecializationScore =
    roleAlignedProactiveLineageCount * 1.5 +
    founderRoleCoverageCount +
    roleAlignedWorkingLineageCount * 0.75;
  const specialtyChildYieldEfficiency =
    specialtyWorkingChildCount > 0
      ? (specialtyChildPublicValue + specialtyProactiveChildCount * 0.25) /
        specialtyWorkingChildCount
      : 0;
  const specialtyChildSustainedValueScore =
    specialtyChildPublicValue + specialtyProactiveChildCount * 0.5;
  const superpowerChildYieldEfficiency =
    superpowerWorkingChildCount > 0
      ? (superpowerChildPublicValue + superpowerProactiveChildCount * 0.25) /
        superpowerWorkingChildCount
      : 0;
  const superpowerChildSustainedValueScore =
    superpowerChildPublicValue + superpowerProactiveChildCount * 0.5;
  const childYieldLeader =
    specialtyChildYieldEfficiency > superpowerChildYieldEfficiency
      ? "specialty"
      : superpowerChildYieldEfficiency > specialtyChildYieldEfficiency
        ? "superpower"
        : specialtyChildYieldEfficiency > 0 || superpowerChildYieldEfficiency > 0
          ? "tie"
          : null;
  const childYieldEfficiencyGap = Math.abs(
    superpowerChildYieldEfficiency - specialtyChildYieldEfficiency,
  );
  const multiGenerationYieldEfficiency =
    multiGenerationWorkingChildCount > 0
      ? (multiGenerationPublicValue + multiGenerationProactiveChildCount * 0.25) /
        multiGenerationWorkingChildCount
      : 0;
  const multiGenerationSustainedValueScore =
    multiGenerationPublicValue + multiGenerationProactiveChildCount * 0.5;
  const climateSpecialtyChildYieldEfficiency =
    climateSpecialtyWorkingChildCount > 0
      ? (climateSpecialtyChildPublicValue + climateSpecialtyProactiveChildCount * 0.25) /
        climateSpecialtyWorkingChildCount
      : 0;
  const climateSpecialtyChildSustainedValueScore =
    climateSpecialtyChildPublicValue + climateSpecialtyProactiveChildCount * 0.5;
  const climateSuperpowerChildYieldEfficiency =
    climateSuperpowerWorkingChildCount > 0
      ? (climateSuperpowerChildPublicValue + climateSuperpowerProactiveChildCount * 0.25) /
        climateSuperpowerWorkingChildCount
      : 0;
  const climateSuperpowerChildSustainedValueScore =
    climateSuperpowerChildPublicValue + climateSuperpowerProactiveChildCount * 0.5;
  const climateChildYieldLeader =
    climateSpecialtyChildYieldEfficiency > climateSuperpowerChildYieldEfficiency
      ? "specialty"
      : climateSuperpowerChildYieldEfficiency > climateSpecialtyChildYieldEfficiency
        ? "superpower"
        : climateSpecialtyChildYieldEfficiency > 0 || climateSuperpowerChildYieldEfficiency > 0
          ? "tie"
          : null;
  const climateChildYieldEfficiencyGap = Math.abs(
    climateSuperpowerChildYieldEfficiency - climateSpecialtyChildYieldEfficiency,
  );
  const survivalSpecialtyChildYieldEfficiency =
    survivalSpecialtyWorkingChildCount > 0
      ? (survivalSpecialtyChildPublicValue + survivalSpecialtyProactiveChildCount * 0.25) /
        survivalSpecialtyWorkingChildCount
      : 0;
  const survivalSpecialtyChildSustainedValueScore =
    survivalSpecialtyChildPublicValue + survivalSpecialtyProactiveChildCount * 0.5;
  const survivalSuperpowerChildYieldEfficiency =
    survivalSuperpowerWorkingChildCount > 0
      ? (survivalSuperpowerChildPublicValue + survivalSuperpowerProactiveChildCount * 0.25) /
        survivalSuperpowerWorkingChildCount
      : 0;
  const survivalSuperpowerChildSustainedValueScore =
    survivalSuperpowerChildPublicValue + survivalSuperpowerProactiveChildCount * 0.5;
  const survivalChildYieldLeader =
    survivalSpecialtyChildYieldEfficiency > survivalSuperpowerChildYieldEfficiency
      ? "specialty"
      : survivalSuperpowerChildYieldEfficiency > survivalSpecialtyChildYieldEfficiency
        ? "superpower"
        : survivalSpecialtyChildYieldEfficiency > 0 || survivalSuperpowerChildYieldEfficiency > 0
          ? "tie"
          : null;
  const survivalChildYieldEfficiencyGap = Math.abs(
    survivalSuperpowerChildYieldEfficiency - survivalSpecialtyChildYieldEfficiency,
  );
  const climateReplicationPressureScore =
    Math.max(0, world?.currentPressure ?? 0) +
    Math.max(0, world?.stormMomentum ?? 0) +
    Math.max(0, world?.replicationBoost ?? 0);
  const survivalReplicationPressureScore = lineages.reduce((sum, lineage) => {
    const ecologyState = resolveGenesisEcologyState({ lineage, world });
    const productiveProactive =
      lineage.lastReason?.trim().toLowerCase() === "heartbeat" &&
      isProductiveLineage(lineage);
    return (
      sum +
      Math.max(0, (world?.currentPressure ?? 0) - lineage.survivalCredit) +
      (productiveProactive
        ? ecologyState === "stressed"
          ? 0.75
          : ecologyState === "dormant"
            ? 0.35
            : 0
        : 0)
    );
  }, 0);
  const productiveReplicationCapacityScore =
    replicatingWorkingParentCount +
    proactiveReplicationParentCount * 0.75 +
    childWorkingLineageCount * 0.5 +
    totalExpansionCredit;
  const replicationFrequencyScore =
    childLineageCount +
    climateResponsiveReplicationParentCount * 0.5 +
    survivalResponsiveReplicationParentCount * 0.75 +
    proactiveReplicationParentCount * 0.75;
  const replicationTriggerFrequencyScore =
    climateResponsiveReplicationParentCount +
    survivalResponsiveReplicationParentCount +
    proactiveReplicationParentCount * 1.25;
  const replicationSuccessFrequencyScore =
    childLineageCount +
    replicatingParentCount * 0.5 +
    childWorkingLineageCount * 0.5;
  const averageReplicationLatency =
    replicationLatencies.length > 0
      ? replicationLatencies.reduce((sum, latency) => sum + latency, 0) /
        replicationLatencies.length
      : 0;
  const replicationSpeedScore =
    replicationSuccessFrequencyScore +
    (averageReplicationLatency > 0
      ? Math.min(2, 3 / Math.max(1, averageReplicationLatency))
      : 0);
  const highestYieldFounderOrigin =
    founderRoleBreakdown[0]?.proactiveYieldEfficiency &&
    founderRoleBreakdown[0].proactiveYieldEfficiency > 0
      ? founderRoleBreakdown[0].founderOrigin
      : null;
  const highestYieldFounderScore = founderRoleBreakdown[0]?.proactiveYieldEfficiency ?? 0;
  const proactiveYieldLeaders = founderRoleBreakdown.slice(0, 3).map((entry) => ({
    founderOrigin: entry.founderOrigin,
    proactiveYieldEfficiency: entry.proactiveYieldEfficiency ?? 0,
    alignedProactiveYieldScore: entry.alignedProactiveYieldScore,
    proactiveWorkingLineageCount: entry.proactiveWorkingLineageCount,
  }));
  const userIntentLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.userIntentAlignmentScore ?? 0) - (left.userIntentAlignmentScore ?? 0) ||
        (right.historyIntentScore ?? 0) - (left.historyIntentScore ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.userIntentAlignmentScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      historyIntentScore: entry.historyIntentScore ?? 0,
      profileIntentScore: entry.profileIntentScore ?? 0,
      userIntentAlignmentScore: entry.userIntentAlignmentScore ?? 0,
      proactiveWorkingLineageCount: entry.proactiveWorkingLineageCount,
      alignedProactiveYieldScore: entry.alignedProactiveYieldScore,
    }));
  const highestUserIntentFounderOrigin =
    userIntentLeaders[0]?.userIntentAlignmentScore && userIntentLeaders[0].userIntentAlignmentScore > 0
      ? userIntentLeaders[0].founderOrigin
      : null;
  const highestUserIntentFounderScore = userIntentLeaders[0]?.userIntentAlignmentScore ?? 0;
  const replicationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.replicationValueScore ?? 0) - (left.replicationValueScore ?? 0) ||
        (right.childCount ?? 0) - (left.childCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.childCount ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      childCount: entry.childCount ?? 0,
      workingChildCount: entry.workingChildCount ?? 0,
      proactiveChildCount: entry.proactiveChildCount ?? 0,
      superpowerChildCount: entry.superpowerChildCount ?? 0,
      replicationValueScore: entry.replicationValueScore ?? 0,
    }));
  const highestReplicationFounderOrigin =
    replicationLeaders[0]?.replicationValueScore && replicationLeaders[0].replicationValueScore > 0
      ? replicationLeaders[0].founderOrigin
      : null;
  const highestReplicationFounderScore = replicationLeaders[0]?.replicationValueScore ?? 0;
  const multiGenerationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.multiGenerationEffectiveScore ?? 0) - (left.multiGenerationEffectiveScore ?? 0) ||
        (right.multiGenerationValueScore ?? 0) - (left.multiGenerationValueScore ?? 0) ||
        (right.deepestGenerationDepth ?? 0) - (left.deepestGenerationDepth ?? 0) ||
        (right.multiGenerationChildCount ?? 0) - (left.multiGenerationChildCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.multiGenerationChildCount ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      deepestGenerationDepth: entry.deepestGenerationDepth ?? 0,
      secondGenerationChildCount: entry.secondGenerationChildCount ?? 0,
      thirdGenerationChildCount: entry.thirdGenerationChildCount ?? 0,
      multiGenerationChildCount: entry.multiGenerationChildCount ?? 0,
      multiGenerationWorkingChildCount: entry.multiGenerationWorkingChildCount ?? 0,
      multiGenerationProactiveChildCount: entry.multiGenerationProactiveChildCount ?? 0,
      multiGenerationSuperpowerChildCount: entry.multiGenerationSuperpowerChildCount ?? 0,
      multiGenerationValueScore: entry.multiGenerationValueScore ?? 0,
      multiGenerationYieldEfficiency: entry.multiGenerationYieldEfficiency ?? 0,
      multiGenerationEffectiveScore: entry.multiGenerationEffectiveScore ?? 0,
      superpowerChildDurabilityPenaltyScore: entry.superpowerChildDurabilityPenaltyScore ?? 0,
    }));
  const multigenerationFounderCount = multiGenerationLeaders.length;
  const highestMultigenerationFounderOrigin =
    multiGenerationLeaders[0]?.multiGenerationEffectiveScore &&
    multiGenerationLeaders[0].multiGenerationEffectiveScore > 0
      ? multiGenerationLeaders[0].founderOrigin
      : null;
  const highestMultigenerationFounderScore =
    multiGenerationLeaders[0]?.multiGenerationEffectiveScore ?? 0;
  const childDegradationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.childDegradationScore ?? 0) - (left.childDegradationScore ?? 0) ||
        (right.degradedSuperpowerChildCount ?? 0) - (left.degradedSuperpowerChildCount ?? 0) ||
        (right.degradedChildCount ?? 0) - (left.degradedChildCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.childDegradationScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      degradedChildCount: entry.degradedChildCount ?? 0,
      degradedSuperpowerChildCount: entry.degradedSuperpowerChildCount ?? 0,
      childDegradationScore: entry.childDegradationScore ?? 0,
    }));
  const childDegradationFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.childDegradationScore ?? 0) > 0,
  ).length;
  const highestChildDegradationFounderOrigin =
    childDegradationLeaders[0]?.childDegradationScore &&
    childDegradationLeaders[0].childDegradationScore > 0
      ? childDegradationLeaders[0].founderOrigin
      : null;
  const highestChildDegradationFounderScore =
    childDegradationLeaders[0]?.childDegradationScore ?? 0;
  const superpowerDurabilityLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.superpowerChildDurabilityPenaltyScore ?? 0) -
          (left.superpowerChildDurabilityPenaltyScore ?? 0) ||
        (left.superpowerChildDurabilityScore ?? 0) - (right.superpowerChildDurabilityScore ?? 0) ||
        (right.degradedSuperpowerChildCount ?? 0) - (left.degradedSuperpowerChildCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.superpowerChildDurabilityPenaltyScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      superpowerChildCount: entry.superpowerChildCount ?? 0,
      multiGenerationSuperpowerChildCount: entry.multiGenerationSuperpowerChildCount ?? 0,
      superpowerChildYieldEfficiency: entry.superpowerChildYieldEfficiency ?? 0,
      superpowerChildSustainedValueScore: entry.superpowerChildSustainedValueScore ?? 0,
      superpowerChildDurabilityPenaltyScore: entry.superpowerChildDurabilityPenaltyScore ?? 0,
      superpowerChildDurabilityScore: entry.superpowerChildDurabilityScore ?? 0,
    }));
  const superpowerDurabilityFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.superpowerChildDurabilityPenaltyScore ?? 0) > 0,
  ).length;
  const highestSuperpowerDurabilityFounderOrigin =
    superpowerDurabilityLeaders[0]?.superpowerChildDurabilityPenaltyScore &&
    superpowerDurabilityLeaders[0].superpowerChildDurabilityPenaltyScore > 0
      ? superpowerDurabilityLeaders[0].founderOrigin
      : null;
  const highestSuperpowerDurabilityFounderScore =
    superpowerDurabilityLeaders[0]?.superpowerChildDurabilityPenaltyScore ?? 0;
  const longTermDegradationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.longTermDegradationScore ?? 0) - (left.longTermDegradationScore ?? 0) ||
        (right.superpowerChildDurabilityPenaltyScore ?? 0) -
          (left.superpowerChildDurabilityPenaltyScore ?? 0) ||
        (right.childDegradationScore ?? 0) - (left.childDegradationScore ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.longTermDegradationScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      childDegradationScore: entry.childDegradationScore ?? 0,
      superpowerChildDurabilityPenaltyScore: entry.superpowerChildDurabilityPenaltyScore ?? 0,
      terminalMortalityScore: entry.terminalMortalityScore ?? 0,
      longTermDegradationScore: entry.longTermDegradationScore ?? 0,
    }));
  const longTermDegradationFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.longTermDegradationScore ?? 0) > 0,
  ).length;
  const highestLongTermDegradationFounderOrigin =
    longTermDegradationLeaders[0]?.longTermDegradationScore &&
    longTermDegradationLeaders[0].longTermDegradationScore > 0
      ? longTermDegradationLeaders[0].founderOrigin
      : null;
  const highestLongTermDegradationFounderScore =
    longTermDegradationLeaders[0]?.longTermDegradationScore ?? 0;
  const longTermRecoveryLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.longTermRecoveryScore ?? 0) - (left.longTermRecoveryScore ?? 0) ||
        (right.multiGenerationEffectiveScore ?? 0) - (left.multiGenerationEffectiveScore ?? 0) ||
        (right.survivalClosureScore ?? 0) - (left.survivalClosureScore ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.longTermRecoveryScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      multiGenerationEffectiveScore: entry.multiGenerationEffectiveScore ?? 0,
      stableRecoveryScore: entry.stableRecoveryScore ?? 0,
      durableRecoveryScore: entry.durableRecoveryScore ?? 0,
      survivalClosureScore: entry.survivalClosureScore ?? 0,
      longTermRecoveryScore: entry.longTermRecoveryScore ?? 0,
    }));
  const longTermRecoveryFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.longTermRecoveryScore ?? 0) > 0,
  ).length;
  const highestLongTermRecoveryFounderOrigin =
    longTermRecoveryLeaders[0]?.longTermRecoveryScore &&
    longTermRecoveryLeaders[0].longTermRecoveryScore > 0
      ? longTermRecoveryLeaders[0].founderOrigin
      : null;
  const highestLongTermRecoveryFounderScore =
    longTermRecoveryLeaders[0]?.longTermRecoveryScore ?? 0;
  const replicationTempoLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.replicationTempoScore ?? 0) - (left.replicationTempoScore ?? 0) ||
        (right.childCount ?? 0) - (left.childCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.childCount ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      replicationTempoScore: entry.replicationTempoScore ?? 0,
      childCount: entry.childCount ?? 0,
      proactiveChildCount: entry.proactiveChildCount ?? 0,
      superpowerChildCount: entry.superpowerChildCount ?? 0,
    }));
  const highestReplicationTempoFounderOrigin =
    replicationTempoLeaders[0]?.replicationTempoScore &&
    replicationTempoLeaders[0].replicationTempoScore > 0
      ? replicationTempoLeaders[0].founderOrigin
      : null;
  const highestReplicationTempoFounderScore =
    replicationTempoLeaders[0]?.replicationTempoScore ?? 0;
  const climateReplicationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.climateReplicationValueScore ?? 0) - (left.climateReplicationValueScore ?? 0) ||
        (right.climateChildCount ?? 0) - (left.climateChildCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.climateChildCount ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      climateReplicationValueScore: entry.climateReplicationValueScore ?? 0,
      climateChildCount: entry.climateChildCount ?? 0,
      climateSuperpowerChildCount: entry.climateSuperpowerChildCount ?? 0,
    }));
  const highestClimateReplicationFounderOrigin =
    climateReplicationLeaders[0]?.climateReplicationValueScore &&
    climateReplicationLeaders[0].climateReplicationValueScore > 0
      ? climateReplicationLeaders[0].founderOrigin
      : null;
  const highestClimateReplicationFounderScore =
    climateReplicationLeaders[0]?.climateReplicationValueScore ?? 0;
  const survivalReplicationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.survivalReplicationValueScore ?? 0) -
          (left.survivalReplicationValueScore ?? 0) ||
        (right.survivalChildCount ?? 0) - (left.survivalChildCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.survivalChildCount ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      survivalReplicationValueScore: entry.survivalReplicationValueScore ?? 0,
      survivalChildCount: entry.survivalChildCount ?? 0,
      survivalSuperpowerChildCount: entry.survivalSuperpowerChildCount ?? 0,
    }));
  const highestSurvivalReplicationFounderOrigin =
    survivalReplicationLeaders[0]?.survivalReplicationValueScore &&
    survivalReplicationLeaders[0].survivalReplicationValueScore > 0
      ? survivalReplicationLeaders[0].founderOrigin
      : null;
  const highestSurvivalReplicationFounderScore =
    survivalReplicationLeaders[0]?.survivalReplicationValueScore ?? 0;
  const expansionLinkLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.linkedExpansionScore ?? 0) - (left.linkedExpansionScore ?? 0) ||
        (right.linkedFounderCount ?? 0) - (left.linkedFounderCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.linkedExpansionScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      linkedFounderCount: entry.linkedFounderCount ?? 0,
      collaborativeChildCount: entry.collaborativeChildCount ?? 0,
      linkedExpansionScore: entry.linkedExpansionScore ?? 0,
      linkedFounders: entry.linkedFounders ?? [],
    }));
  const collaborativeExpansionFounderCount = expansionLinkLeaders.length;
  const crossFounderExpansionLinkCount = [...founderLinkMap.values()].reduce(
    (sum, linked) => sum + linked.size,
    0,
  ) / 2;
  const crossFounderExpansionScore = expansionLinkLeaders.reduce(
    (sum, entry) => sum + entry.linkedExpansionScore,
    0,
  );
  const collaborationInfluenceLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.collaborationInfluenceScore ?? 0) - (left.collaborationInfluenceScore ?? 0) ||
        (right.linkedFounderCount ?? 0) - (left.linkedFounderCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.collaborationInfluenceScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      linkedFounderCount: entry.linkedFounderCount ?? 0,
      proactiveWorkingLineageCount: entry.proactiveWorkingLineageCount,
      roleAlignedProactiveYieldScore: entry.alignedProactiveYieldScore,
      collaborationInfluenceScore: entry.collaborationInfluenceScore ?? 0,
    }));
  const highestCollaborationInfluenceFounderOrigin =
    collaborationInfluenceLeaders[0]?.collaborationInfluenceScore &&
    collaborationInfluenceLeaders[0].collaborationInfluenceScore > 0
      ? collaborationInfluenceLeaders[0].founderOrigin
      : null;
  const highestCollaborationInfluenceFounderScore =
    collaborationInfluenceLeaders[0]?.collaborationInfluenceScore ?? 0;
  const cooperativeYieldLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.cooperativeYieldScore ?? 0) - (left.cooperativeYieldScore ?? 0) ||
        (right.linkedFounderCount ?? 0) - (left.linkedFounderCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.cooperativeYieldScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      linkedFounderCount: entry.linkedFounderCount ?? 0,
      roleAlignedProactiveYieldScore: entry.alignedProactiveYieldScore,
      linkedExpansionScore: entry.linkedExpansionScore ?? 0,
      cooperativeYieldScore: entry.cooperativeYieldScore ?? 0,
    }));
  const cooperativeYieldFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.cooperativeYieldScore ?? 0) > 0,
  ).length;
  const highestCooperativeYieldFounderOrigin =
    cooperativeYieldLeaders[0]?.cooperativeYieldScore &&
    cooperativeYieldLeaders[0].cooperativeYieldScore > 0
      ? cooperativeYieldLeaders[0].founderOrigin
      : null;
  const highestCooperativeYieldFounderScore =
    cooperativeYieldLeaders[0]?.cooperativeYieldScore ?? 0;
  const leadCooperationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.leadCooperationScore ?? 0) - (left.leadCooperationScore ?? 0) ||
        (right.leadAssignmentCount ?? 0) - (left.leadAssignmentCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.leadCooperationScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      leadAssignmentCount: entry.leadAssignmentCount ?? 0,
      leadYieldScore: entry.leadYieldScore ?? 0,
      leadCooperationScore: entry.leadCooperationScore ?? 0,
    }));
  const leadCooperationFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.leadCooperationScore ?? 0) > 0,
  ).length;
  const highestLeadCooperationFounderOrigin =
    leadCooperationLeaders[0]?.leadCooperationScore &&
    leadCooperationLeaders[0].leadCooperationScore > 0
      ? leadCooperationLeaders[0].founderOrigin
      : null;
  const highestLeadCooperationFounderScore =
    leadCooperationLeaders[0]?.leadCooperationScore ?? 0;
  const supportCooperationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.supportCooperationScore ?? 0) - (left.supportCooperationScore ?? 0) ||
        (right.supportAssignmentCount ?? 0) - (left.supportAssignmentCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.supportCooperationScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      supportAssignmentCount: entry.supportAssignmentCount ?? 0,
      supportYieldScore: entry.supportYieldScore ?? 0,
      supportCooperationScore: entry.supportCooperationScore ?? 0,
    }));
  const supportCooperationFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.supportCooperationScore ?? 0) > 0,
  ).length;
  const highestSupportCooperationFounderOrigin =
    supportCooperationLeaders[0]?.supportCooperationScore &&
    supportCooperationLeaders[0].supportCooperationScore > 0
      ? supportCooperationLeaders[0].founderOrigin
      : null;
  const highestSupportCooperationFounderScore =
    supportCooperationLeaders[0]?.supportCooperationScore ?? 0;
  const reviveCooperationLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.reviveCooperationScore ?? 0) - (left.reviveCooperationScore ?? 0) ||
        (right.reviveAssignmentCount ?? 0) - (left.reviveAssignmentCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.reviveCooperationScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      reviveAssignmentCount: entry.reviveAssignmentCount ?? 0,
      reviveYieldScore: entry.reviveYieldScore ?? 0,
      reviveCooperationScore: entry.reviveCooperationScore ?? 0,
    }));
  const reviveCooperationFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.reviveCooperationScore ?? 0) > 0,
  ).length;
  const highestReviveCooperationFounderOrigin =
    reviveCooperationLeaders[0]?.reviveCooperationScore &&
    reviveCooperationLeaders[0].reviveCooperationScore > 0
      ? reviveCooperationLeaders[0].founderOrigin
      : null;
  const highestReviveCooperationFounderScore =
    reviveCooperationLeaders[0]?.reviveCooperationScore ?? 0;
  const highestExpansionInfluenceFounderOrigin =
    expansionLinkLeaders[0]?.linkedExpansionScore && expansionLinkLeaders[0].linkedExpansionScore > 0
      ? expansionLinkLeaders[0].founderOrigin
      : null;
  const highestExpansionInfluenceFounderScore = expansionLinkLeaders[0]?.linkedExpansionScore ?? 0;
  const mortalityLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.mortalityScore ?? 0) - (left.mortalityScore ?? 0) ||
        (right.nearDeathLineageCount ?? 0) - (left.nearDeathLineageCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.mortalityScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      stressedLineageCount: entry.stressedLineageCount ?? 0,
      dormantLineageCount: entry.dormantLineageCount ?? 0,
      extinctLineageCount: entry.extinctLineageCount ?? 0,
      nearDeathLineageCount: entry.nearDeathLineageCount ?? 0,
      recoverableLineageCount: entry.recoverableLineageCount ?? 0,
      mortalityScore: entry.mortalityScore ?? 0,
    }));
  const mortalityPressureScore = mortalityLeaders.reduce(
    (sum, entry) => sum + entry.mortalityScore,
    0,
  );
  const highestMortalityFounderOrigin =
    mortalityLeaders[0]?.mortalityScore && mortalityLeaders[0].mortalityScore > 0
      ? mortalityLeaders[0].founderOrigin
      : null;
  const highestMortalityFounderScore = mortalityLeaders[0]?.mortalityScore ?? 0;
  const terminalMortalityLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.terminalMortalityScore ?? 0) - (left.terminalMortalityScore ?? 0) ||
        (right.terminalLineageCount ?? 0) - (left.terminalLineageCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.terminalMortalityScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      terminalLineageCount: entry.terminalLineageCount ?? 0,
      backslidingLineageCount: entry.backslidingLineageCount ?? 0,
      terminalMortalityScore: entry.terminalMortalityScore ?? 0,
    }));
  const terminalMortalityFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.terminalMortalityScore ?? 0) > 0,
  ).length;
  const highestTerminalMortalityFounderOrigin =
    terminalMortalityLeaders[0]?.terminalMortalityScore &&
    terminalMortalityLeaders[0].terminalMortalityScore > 0
      ? terminalMortalityLeaders[0].founderOrigin
      : null;
  const highestTerminalMortalityFounderScore =
    terminalMortalityLeaders[0]?.terminalMortalityScore ?? 0;
  const recoveryLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.recoveryInfluenceScore ?? 0) - (left.recoveryInfluenceScore ?? 0) ||
        (right.recoverableLineageCount ?? 0) - (left.recoverableLineageCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.recoveryInfluenceScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      recoverableLineageCount: entry.recoverableLineageCount ?? 0,
      linkedFounderCount: entry.linkedFounderCount ?? 0,
      proactiveWorkingLineageCount: entry.proactiveWorkingLineageCount,
      recoveryInfluenceScore: entry.recoveryInfluenceScore ?? 0,
    }));
  const recoveryReadyFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.recoveryInfluenceScore ?? 0) > 0,
  ).length;
  const cooperativeRecoveryFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.linkedFounderCount ?? 0) > 0 && (entry.nearDeathLineageCount ?? 0) > 0,
  ).length;
  const recoveryReadyScore = recoveryLeaders.reduce(
    (sum, entry) => sum + entry.recoveryInfluenceScore,
    0,
  );
  const highestRecoveryFounderOrigin =
    recoveryLeaders[0]?.recoveryInfluenceScore && recoveryLeaders[0].recoveryInfluenceScore > 0
      ? recoveryLeaders[0].founderOrigin
      : null;
  const highestRecoveryFounderScore = recoveryLeaders[0]?.recoveryInfluenceScore ?? 0;
  const stableRecoveryLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.stableRecoveryScore ?? 0) - (left.stableRecoveryScore ?? 0) ||
        (right.recoverableLineageCount ?? 0) - (left.recoverableLineageCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.stableRecoveryScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      recoverableLineageCount: entry.recoverableLineageCount ?? 0,
      nearDeathLineageCount: entry.nearDeathLineageCount ?? 0,
      proactiveWorkingLineageCount: entry.proactiveWorkingLineageCount,
      stableRecoveryScore: entry.stableRecoveryScore ?? 0,
    }));
  const stableRecoveryFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.stableRecoveryScore ?? 0) > 0,
  ).length;
  const highestStableRecoveryFounderOrigin =
    stableRecoveryLeaders[0]?.stableRecoveryScore && stableRecoveryLeaders[0].stableRecoveryScore > 0
      ? stableRecoveryLeaders[0].founderOrigin
      : null;
  const highestStableRecoveryFounderScore = stableRecoveryLeaders[0]?.stableRecoveryScore ?? 0;
  const durableRecoveryLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.durableRecoveryScore ?? 0) - (left.durableRecoveryScore ?? 0) ||
        (right.recoverableLineageCount ?? 0) - (left.recoverableLineageCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.durableRecoveryScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      recoverableLineageCount: entry.recoverableLineageCount ?? 0,
      nearDeathLineageCount: entry.nearDeathLineageCount ?? 0,
      dormantLineageCount: entry.dormantLineageCount ?? 0,
      durableRecoveryScore: entry.durableRecoveryScore ?? 0,
    }));
  const durableRecoveryFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.durableRecoveryScore ?? 0) > 0,
  ).length;
  const highestDurableRecoveryFounderOrigin =
    durableRecoveryLeaders[0]?.durableRecoveryScore &&
    durableRecoveryLeaders[0].durableRecoveryScore > 0
      ? durableRecoveryLeaders[0].founderOrigin
      : null;
  const highestDurableRecoveryFounderScore =
    durableRecoveryLeaders[0]?.durableRecoveryScore ?? 0;
  const transientRecoveryLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.transientRecoveryScore ?? 0) - (left.transientRecoveryScore ?? 0) ||
        (right.recoverableLineageCount ?? 0) - (left.recoverableLineageCount ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.transientRecoveryScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      recoverableLineageCount: entry.recoverableLineageCount ?? 0,
      nearDeathLineageCount: entry.nearDeathLineageCount ?? 0,
      dormantLineageCount: entry.dormantLineageCount ?? 0,
      transientRecoveryScore: entry.transientRecoveryScore ?? 0,
    }));
  const transientRecoveryFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.transientRecoveryScore ?? 0) > 0,
  ).length;
  const highestTransientRecoveryFounderOrigin =
    transientRecoveryLeaders[0]?.transientRecoveryScore &&
    transientRecoveryLeaders[0].transientRecoveryScore > 0
      ? transientRecoveryLeaders[0].founderOrigin
      : null;
  const highestTransientRecoveryFounderScore =
    transientRecoveryLeaders[0]?.transientRecoveryScore ?? 0;
  const recoveryChainLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.recoveryChainScore ?? 0) - (left.recoveryChainScore ?? 0) ||
        (right.durableRecoveryRate ?? 0) - (left.durableRecoveryRate ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.recoveryChainScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      transientRecoveryRate: entry.transientRecoveryRate ?? 0,
      stableRecoveryRate: entry.stableRecoveryRate ?? 0,
      durableRecoveryRate: entry.durableRecoveryRate ?? 0,
      recoveryChainScore: entry.recoveryChainScore ?? 0,
    }));
  const recoveryChainFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.recoveryChainScore ?? 0) > 0,
  ).length;
  const highestRecoveryChainFounderOrigin =
    recoveryChainLeaders[0]?.recoveryChainScore &&
    recoveryChainLeaders[0].recoveryChainScore > 0
      ? recoveryChainLeaders[0].founderOrigin
      : null;
  const highestRecoveryChainFounderScore =
    recoveryChainLeaders[0]?.recoveryChainScore ?? 0;
  const survivalClosureLeaders = [...founderRoleBreakdown]
    .sort(
      (left, right) =>
        (right.survivalClosureScore ?? 0) - (left.survivalClosureScore ?? 0) ||
        (right.durableRecoveryRate ?? 0) - (left.durableRecoveryRate ?? 0) ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    )
    .filter((entry) => (entry.survivalClosureScore ?? 0) > 0)
    .slice(0, 3)
    .map((entry) => ({
      founderOrigin: entry.founderOrigin,
      terminalLineageCount: entry.terminalLineageCount ?? 0,
      stableRecoveryRate: entry.stableRecoveryRate ?? 0,
      durableRecoveryRate: entry.durableRecoveryRate ?? 0,
      survivalClosureScore: entry.survivalClosureScore ?? 0,
    }));
  const survivalClosureFounderCount = founderRoleBreakdown.filter(
    (entry) => (entry.survivalClosureScore ?? 0) > 0,
  ).length;
  const highestSurvivalClosureFounderOrigin =
    survivalClosureLeaders[0]?.survivalClosureScore &&
    survivalClosureLeaders[0].survivalClosureScore > 0
      ? survivalClosureLeaders[0].founderOrigin
      : null;
  const highestSurvivalClosureFounderScore =
    survivalClosureLeaders[0]?.survivalClosureScore ?? 0;
  const buildRecoveryStageExplanation = (
    entry: GenesisFounderRoleBreakdown,
    components: Array<{
      key: string;
      score: number;
    }>,
  ) => ({
    components: components
      .map((component) => ({
        key: component.key,
        score: Math.max(0, component.score),
      }))
      .filter((component) => component.score > 0)
      .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
      .slice(0, 4),
  });
  const buildRecoveryStageEntry = (params: {
    stage: "stressed" | "dormant" | "extinct" | "recoverable" | "stable";
    basis:
      | "transient_recovery"
      | "revive_cooperation"
      | "survival_closure"
      | "stable_recovery"
      | "recovery_chain";
    lineageCount: number;
    score: (entry: GenesisFounderRoleBreakdown) => {
      total: number;
      components: Array<{
        key: string;
        score: number;
      }>;
    };
  }) => {
    const ranked = founderRoleBreakdown
      .map((entry) => ({
        founderOrigin: entry.founderOrigin,
        scored: params.score(entry),
      }))
      .filter((entry) => entry.scored.total > 0)
      .sort(
        (left, right) =>
          right.scored.total - left.scored.total ||
          left.founderOrigin.localeCompare(right.founderOrigin),
      );
    return {
      stage: params.stage,
      founderOrigin: ranked[0]?.founderOrigin ?? null,
      score: ranked[0]?.scored.total ?? 0,
      runnerUpFounderOrigin: ranked[1]?.founderOrigin ?? null,
      runnerUpScore: ranked[1]?.scored.total ?? 0,
      ...(ranked[0]
        ? {
            leaderExplanation: buildRecoveryStageExplanation(
              founderRoleBreakdown.find(
                (entry) => entry.founderOrigin === ranked[0]?.founderOrigin,
              )!,
              ranked[0].scored.components,
            ),
          }
        : {}),
      ...(ranked[1]
        ? {
            runnerUpExplanation: buildRecoveryStageExplanation(
              founderRoleBreakdown.find(
                (entry) => entry.founderOrigin === ranked[1]?.founderOrigin,
              )!,
              ranked[1].scored.components,
            ),
          }
        : {}),
      basis: params.basis,
      lineageCount: params.lineageCount,
    };
  };
  const recoveryStageMap = {
    stages: [
      buildRecoveryStageEntry({
        stage: "stressed",
        basis: "transient_recovery",
        lineageCount: stressedLineageCount,
        score: (entry) => {
          const components = [
            { key: "transient_recovery", score: (entry.transientRecoveryScore ?? 0) * 0.7 },
            { key: "transient_recovery_rate", score: (entry.transientRecoveryRate ?? 0) * 1.1 },
            { key: "terminal_mortality", score: (entry.terminalMortalityScore ?? 0) * 0.14 },
            { key: "mortality_pressure", score: (entry.mortalityScore ?? 0) * 0.04 },
            { key: "support_cooperation", score: (entry.supportCooperationScore ?? 0) * 0.16 },
            { key: "recovery_chain", score: (entry.recoveryChainScore ?? 0) * 0.16 },
            { key: "long_term_recovery", score: (entry.longTermRecoveryScore ?? 0) * 0.12 },
            { key: "long_term_intent", score: (entry.longTermIntentAlignmentScore ?? 0) * 0.2 },
          ];
          return {
            total: components.reduce((sum, component) => sum + component.score, 0),
            components,
          };
        },
      }),
      buildRecoveryStageEntry({
        stage: "dormant",
        basis: "revive_cooperation",
        lineageCount: dormantLineageCount,
        score: (entry) => {
          const components = [
            { key: "revive_cooperation", score: (entry.reviveCooperationScore ?? 0) * 0.65 },
            { key: "stable_recovery", score: (entry.stableRecoveryScore ?? 0) * 0.15 },
            { key: "durable_recovery", score: (entry.durableRecoveryScore ?? 0) * 0.12 },
            { key: "survival_closure", score: (entry.survivalClosureScore ?? 0) * 0.08 },
          ];
          return {
            total: components.reduce((sum, component) => sum + component.score, 0),
            components,
          };
        },
      }),
      buildRecoveryStageEntry({
        stage: "extinct",
        basis: "survival_closure",
        lineageCount: extinctLineageCount,
        score: (entry) => {
          const components = [
            { key: "survival_closure", score: (entry.survivalClosureScore ?? 0) * 0.72 },
            { key: "durable_recovery", score: (entry.durableRecoveryScore ?? 0) * 0.18 },
            { key: "durable_recovery_rate", score: (entry.durableRecoveryRate ?? 0) * 0.45 },
            { key: "recovery_chain", score: (entry.recoveryChainScore ?? 0) * 0.08 },
            { key: "terminal_mortality", score: (entry.terminalMortalityScore ?? 0) * 0.3 },
            { key: "mortality_pressure", score: (entry.mortalityScore ?? 0) * 0.06 },
          ];
          return {
            total: components.reduce((sum, component) => sum + component.score, 0),
            components,
          };
        },
      }),
      buildRecoveryStageEntry({
        stage: "recoverable",
        basis: "stable_recovery",
        lineageCount: recoverableLineageCount,
        score: (entry) => {
          const components = [
            { key: "stable_recovery", score: (entry.stableRecoveryScore ?? 0) * 0.48 },
            { key: "durable_recovery", score: (entry.durableRecoveryScore ?? 0) * 0.22 },
            { key: "stable_recovery_rate", score: (entry.stableRecoveryRate ?? 0) * 0.9 },
            { key: "recovery_chain", score: (entry.recoveryChainScore ?? 0) * 0.22 },
            { key: "support_cooperation", score: (entry.supportCooperationScore ?? 0) * 0.2 },
            { key: "long_term_recovery", score: (entry.longTermRecoveryScore ?? 0) * 0.18 },
            { key: "long_term_intent", score: (entry.longTermIntentAlignmentScore ?? 0) * 0.22 },
          ];
          return {
            total: components.reduce((sum, component) => sum + component.score, 0),
            components,
          };
        },
      }),
      buildRecoveryStageEntry({
        stage: "stable",
        basis: "recovery_chain",
        lineageCount: ecologyCounts.active,
        score: (entry) => {
          const components = [
            { key: "recovery_chain", score: (entry.recoveryChainScore ?? 0) * 0.65 },
            { key: "durable_recovery_rate", score: (entry.durableRecoveryRate ?? 0) * 0.55 },
            { key: "durable_recovery", score: (entry.durableRecoveryScore ?? 0) * 0.15 },
            { key: "support_cooperation", score: (entry.supportCooperationScore ?? 0) * 0.16 },
            { key: "long_term_recovery", score: (entry.longTermRecoveryScore ?? 0) * 0.16 },
            { key: "long_term_intent", score: (entry.longTermIntentAlignmentScore ?? 0) * 0.24 },
          ];
          return {
            total: components.reduce((sum, component) => sum + component.score, 0),
            components,
          };
        },
      }),
    ],
  };
  const topLineages = [...lineages]
    .sort((left, right) => {
      const leftScore =
        left.survivalCredit +
        left.expansionCredit -
        left.accumulatedPrivilegeTax * 0.5 +
        resolveGenesisSkillEvolutionBias(left.lineageId, env);
      const rightScore =
        right.survivalCredit +
        right.expansionCredit -
        right.accumulatedPrivilegeTax * 0.5 +
        resolveGenesisSkillEvolutionBias(right.lineageId, env);
      return rightScore - leftScore || right.lastCompletionTs - left.lastCompletionTs;
    })
    .slice(0, 5)
    .map((lineage) => ({
      lineageId: lineage.lineageId,
      ecologyState: resolveGenesisEcologyState({ lineage, world }),
      survivalCredit: lineage.survivalCredit,
      expansionCredit: lineage.expansionCredit,
      accumulatedPrivilegeTax: lineage.accumulatedPrivilegeTax,
      skillEvolutionBias: resolveGenesisSkillEvolutionBias(lineage.lineageId, env),
      latestSessionKey: lineage.latestSessionKey,
    }));
  return {
    ecologyCounts,
    topLineages,
    vitalitySummary: {
      lineageCount: lineages.length,
      childLineageCount,
      specialtyOnlyChildCount,
      superpowerChildCount,
      pressureAmplifiedSuperpowerChildCount,
      pressureAmplifiedSuperpowerWorkingChildCount,
      specialtyWorkingChildCount,
      specialtyProactiveChildCount,
      specialtyChildPublicValue,
      specialtyChildYieldEfficiency,
      specialtyChildSustainedValueScore,
      superpowerWorkingChildCount,
      superpowerProactiveChildCount,
      superpowerChildPublicValue,
      superpowerChildYieldEfficiency,
      superpowerChildSustainedValueScore,
      childYieldLeader,
      childYieldEfficiencyGap,
      multiGenerationLineageCount,
      secondGenerationChildCount,
      thirdGenerationChildCount,
      deepestGenerationDepth,
      multiGenerationWorkingChildCount,
      multiGenerationProactiveChildCount,
      multiGenerationSuperpowerChildCount,
      multiGenerationPublicValue,
      multiGenerationYieldEfficiency,
      multiGenerationSustainedValueScore,
      multigenerationFounderCount,
      highestMultigenerationFounderOrigin,
      highestMultigenerationFounderScore,
      multiGenerationLeaders,
      childDegradationFounderCount,
      highestChildDegradationFounderOrigin,
      highestChildDegradationFounderScore,
      childDegradationLeaders,
      superpowerDurabilityFounderCount,
      highestSuperpowerDurabilityFounderOrigin,
      highestSuperpowerDurabilityFounderScore,
      superpowerDurabilityLeaders,
      longTermDegradationFounderCount,
      highestLongTermDegradationFounderOrigin,
      highestLongTermDegradationFounderScore,
      longTermDegradationLeaders,
      longTermRecoveryFounderCount,
      highestLongTermRecoveryFounderOrigin,
      highestLongTermRecoveryFounderScore,
      longTermRecoveryLeaders,
      climateReplicationPressureScore,
      survivalReplicationPressureScore,
      productiveReplicationCapacityScore,
      replicationFrequencyScore,
      replicationTriggerFrequencyScore,
      replicationSuccessFrequencyScore,
      averageReplicationLatency,
      replicationSpeedScore,
      climatePressuredChildCount,
      climatePressuredSuperpowerChildCount,
      climatePressuredChildValueScore,
      climateSpecialtyWorkingChildCount,
      climateSpecialtyProactiveChildCount,
      climateSpecialtyChildPublicValue,
      climateSpecialtyChildYieldEfficiency,
      climateSpecialtyChildSustainedValueScore,
      climateSuperpowerWorkingChildCount,
      climateSuperpowerProactiveChildCount,
      climateSuperpowerChildPublicValue,
      climateSuperpowerChildYieldEfficiency,
      climateSuperpowerChildSustainedValueScore,
      climateChildYieldLeader,
      climateChildYieldEfficiencyGap,
      survivalPressuredChildCount,
      survivalPressuredSuperpowerChildCount,
      survivalPressuredChildValueScore,
      survivalSpecialtyWorkingChildCount,
      survivalSpecialtyProactiveChildCount,
      survivalSpecialtyChildPublicValue,
      survivalSpecialtyChildYieldEfficiency,
      survivalSpecialtyChildSustainedValueScore,
      survivalSuperpowerWorkingChildCount,
      survivalSuperpowerProactiveChildCount,
      survivalSuperpowerChildPublicValue,
      survivalSuperpowerChildYieldEfficiency,
      survivalSuperpowerChildSustainedValueScore,
      survivalChildYieldLeader,
      survivalChildYieldEfficiencyGap,
      climateResponsiveReplicationParentCount,
      survivalResponsiveReplicationParentCount,
      proactiveReplicationParentCount,
      collaborativeExpansionFounderCount,
      crossFounderExpansionLinkCount,
      crossFounderExpansionScore,
      cooperativeYieldFounderCount,
      leadCooperationFounderCount,
      highestLeadCooperationFounderOrigin,
      highestLeadCooperationFounderScore,
      supportCooperationFounderCount,
      highestSupportCooperationFounderOrigin,
      highestSupportCooperationFounderScore,
      reviveCooperationFounderCount,
      highestReviveCooperationFounderOrigin,
      highestReviveCooperationFounderScore,
      highestCollaborationInfluenceFounderOrigin,
      highestCollaborationInfluenceFounderScore,
      highestCooperativeYieldFounderOrigin,
      highestCooperativeYieldFounderScore,
      highestExpansionInfluenceFounderOrigin,
      highestExpansionInfluenceFounderScore,
      expansionLinkLeaders,
      collaborationInfluenceLeaders,
      cooperativeYieldLeaders,
      leadCooperationLeaders,
      supportCooperationLeaders,
      reviveCooperationLeaders,
      stressedLineageCount,
      dormantLineageCount,
      extinctLineageCount,
      nearDeathLineageCount,
      recoverableLineageCount,
      terminalLineageCount,
      backslidingLineageCount,
      mortalityPressureScore,
      highestMortalityFounderOrigin,
      highestMortalityFounderScore,
      terminalMortalityFounderCount,
      highestTerminalMortalityFounderOrigin,
      highestTerminalMortalityFounderScore,
      recoveryReadyFounderCount,
      cooperativeRecoveryFounderCount,
      recoveryReadyScore,
      highestRecoveryFounderOrigin,
      highestRecoveryFounderScore,
      stableRecoveryFounderCount,
      durableRecoveryFounderCount,
      transientRecoveryFounderCount,
      recoveryChainFounderCount,
      highestStableRecoveryFounderOrigin,
      highestStableRecoveryFounderScore,
      highestDurableRecoveryFounderOrigin,
      highestDurableRecoveryFounderScore,
      highestTransientRecoveryFounderOrigin,
      highestTransientRecoveryFounderScore,
      highestRecoveryChainFounderOrigin,
      highestRecoveryChainFounderScore,
      survivalClosureFounderCount,
      highestSurvivalClosureFounderOrigin,
      highestSurvivalClosureFounderScore,
      recoveryStageMap,
      mortalityLeaders,
      terminalMortalityLeaders,
      recoveryLeaders,
      stableRecoveryLeaders,
      durableRecoveryLeaders,
      transientRecoveryLeaders,
      recoveryChainLeaders,
      survivalClosureLeaders,
      replicatingParentCount,
      maxChildrenPerParent,
      workingLineageCount,
      childWorkingLineageCount,
      replicatingWorkingParentCount,
      heartbeatLineageCount,
      proactiveReadyLineageCount,
      proactiveWorkingLineageCount,
      activeFocusLineageCount: focusSummary.activeLineageCount,
      activeTriggerCount: focusSummary.activeTriggerCount,
      recentCapturedSkillCount: skillEvolutionSummary.modeCounts.captured,
      recentDerivedSkillCount: skillEvolutionSummary.modeCounts.derived,
      totalPublicValue,
      totalPrivateValue,
      totalSurvivalCredit,
      totalExpansionCredit,
      proactiveSignalScore,
      autonomousExpansionScore,
      founderRoleCoverageCount,
      founderYieldCoverageCount,
      roleAlignedWorkingLineageCount,
      roleAlignedProactiveLineageCount,
      roleAlignedProactiveYieldScore,
      highestYieldFounderOrigin,
      highestYieldFounderScore,
      proactiveYieldLeaders,
      highestReplicationFounderOrigin,
      highestReplicationFounderScore,
      replicationLeaders,
      highestMultigenerationFounderOrigin,
      highestMultigenerationFounderScore,
      multiGenerationLeaders,
      highestReplicationTempoFounderOrigin,
      highestReplicationTempoFounderScore,
      replicationTempoLeaders,
      highestClimateReplicationFounderOrigin,
      highestClimateReplicationFounderScore,
      highestSurvivalReplicationFounderOrigin,
      highestSurvivalReplicationFounderScore,
      climateReplicationLeaders,
      survivalReplicationLeaders,
      historyDrivenProactiveLineageCount,
      userProfileDrivenProactiveLineageCount,
      userIntentDrivenProactiveYieldScore,
      highestUserIntentFounderOrigin,
      highestUserIntentFounderScore,
      userIntentLeaders,
      proactiveSpecializationScore,
      founderRoleBreakdown,
      topParentLineages,
    },
  };
}

export function readGenesisLineageSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageSummary | null {
  const snapshot = readJsonFileSync<GenesisLineageSummary>(resolveGenesisLineageSummaryPath(env));
  if (!snapshot) {
    return null;
  }
  return {
    ecologyCounts: {
      ...DEFAULT_GENESIS_LINEAGE_SUMMARY.ecologyCounts,
      ...(snapshot.ecologyCounts ?? {}),
    },
    vitalitySummary: {
      ...DEFAULT_GENESIS_LINEAGE_SUMMARY.vitalitySummary,
      ...(snapshot.vitalitySummary ?? {}),
      founderRoleBreakdown: Array.isArray(snapshot.vitalitySummary?.founderRoleBreakdown)
        ? snapshot.vitalitySummary.founderRoleBreakdown
        : [],
      topParentLineages: Array.isArray(snapshot.vitalitySummary?.topParentLineages)
        ? snapshot.vitalitySummary.topParentLineages
        : [],
    },
    topLineages: Array.isArray(snapshot.topLineages) ? snapshot.topLineages : [],
  };
}

export function writeGenesisLineageSummarySnapshotSync(
  summary: GenesisLineageSummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisLineageSummaryPath(env);
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

export function refreshGenesisLineageSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageSummary {
  const summary = readGenesisLineageSummarySync(env);
  writeGenesisLineageSummarySnapshotSync(summary, env);
  return summary;
}
