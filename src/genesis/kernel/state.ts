import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { resolveStateDir } from "../../config/paths.js";

export type GenesisEcologyState = "active" | "stressed" | "dormant" | "extinct";

export type GenesisWorldState = {
  totalEnvironmentEvents: number;
  totalRunCompletions: number;
  cumulativeIntensity: number;
  currentPressure?: number;
  stormMomentum?: number;
  replicationBoost?: number;
  triggerCounts: Record<"cron" | "heartbeat" | "workflow", number>;
  lastEventTs?: number;
  lastEventSummary?: string;
  lastShockTs?: number;
  updatedAt: number;
};

export type GenesisUserIntentHistoryEntry = {
  kind: "search" | "query" | "consultation";
  summary: string;
  ts: number;
  sourceRef?: string;
};

export type GenesisUserIntentHistoryState = {
  entries: GenesisUserIntentHistoryEntry[];
  updatedAt: number;
};

export type GenesisProactiveWorkEntry = {
  workId: string;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  agentId: string;
  lineageId?: string;
  sessionKey: string;
  platform?: string;
  accountRecordId?: string;
  accountLabel?: string;
  action: "lead" | "assist" | "reactivate";
  climateKind?: string;
  workType: string;
  task: string;
  status: "planned" | "in_progress" | "completed";
  executionStage?: "skill_check" | "skill_use" | "skill_build" | "execute" | null;
  skillTarget?: string;
  usedSkillName?: string;
  builtSkillName?: string;
  driverKind?: "history" | "profile" | "event" | "outcome" | "hotspot" | "fallback" | null;
  driverHistoryKind?: "search" | "query" | "consultation" | null;
  driverTopicCluster?: string | null;
  driverKeywords?: string[];
  driverSummary?: string;
  hotspotTitle?: string;
  hotspotUrl?: string;
  trafficFingerprint?: string;
  resultPreview?: string;
  artifactLabel?: string;
  effectType?:
    | "publication"
    | "registration"
    | "bounty"
    | "opportunity"
    | "skill_tool"
    | "report"
    | null;
  effectEvidence?: string;
  externalCapability?: string;
  externalStatus?: "executed" | "failed" | "pending" | null;
  externalEvidenceType?: "url" | "post_id" | "thread_id" | "task_id" | "screenshot" | "file" | "text" | null;
  externalEvidenceValue?: string;
  externalId?: string;
  contentPreview?: string;
  source: "workflow_dispatch" | "run_completion" | "daily_learning";
  ts: number;
  updatedAt: number;
};

export type GenesisDailyTrafficLogEntry = {
  logId: string;
  platform: string;
  capability: string;
  fingerprint: string;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  workId: string;
  driverSummary?: string;
  hotspotTitle?: string;
  hotspotUrl?: string;
  contentPreview?: string;
  evidenceValue?: string;
  externalId?: string;
  publishedAt: number;
};

export type GenesisProactiveWorkSummary = {
  totalEntryCount: number;
  plannedCount: number;
  inProgressCount: number;
  completedCount: number;
  learningPlannedCount: number;
  learningInProgressCount: number;
  learningCompletedCount: number;
  activeLearningFounderCount: number;
  activeFounderCount: number;
  highestActiveFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  highestActiveFounderScore?: number;
  highestLearningFounderOrigin?:
    | "scout"
    | "builder"
    | "creator"
    | "auditor"
    | "negotiator"
    | null;
  concreteOutcomeCount: number;
  highestConcreteOutcomeFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
  founderActivityLeaders: Array<{
    founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
    plannedCount: number;
    inProgressCount: number;
    completedCount: number;
    learningPlannedCount: number;
    learningInProgressCount: number;
    learningCompletedCount: number;
    resultCount: number;
    outcomeCount: number;
    activityScore: number;
  }>;
  recentLearningEntries: GenesisProactiveWorkEntry[];
  recentLearningOutcomes: GenesisProactiveWorkEntry[];
  recentConcreteOutcomes: GenesisProactiveWorkEntry[];
  recentEntries: GenesisProactiveWorkEntry[];
};

export type GenesisSkillCapabilitySummary = {
  workspaceDir: string;
  totalSkillCount: number;
  readySkillCount: number;
  degradedSkillCount: number;
  blockedSkillCount: number;
  installableSkillCount: number;
  alwaysOnSkillCount: number;
  publishCapableSkillCount: number;
  researchCapableSkillCount: number;
  automationCapableSkillCount: number;
  highestSkillCapabilityFounderOrigin?:
    | "scout"
    | "builder"
    | "creator"
    | "auditor"
    | "negotiator"
    | null;
  highestSkillGapFounderOrigin?:
    | "scout"
    | "builder"
    | "creator"
    | "auditor"
    | "negotiator"
    | null;
  readySkillNames: string[];
  degradedSkillNames: string[];
  installableSkillNames: string[];
  founderSkillLeaders: Array<{
    founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
    readyScore: number;
    gapScore: number;
    readySkillCount: number;
    degradedSkillCount: number;
    installableSkillCount: number;
  }>;
};

export type GenesisPlatformCapability =
  | "publish"
  | "browse"
  | "comment"
  | "message"
  | "claim_bounty"
  | "submit_report"
  | "automation";

export type GenesisPlatformAccountStatus =
  | "pending"
  | "ready"
  | "busy"
  | "cooldown"
  | "blocked"
  | "expired"
  | "relogin_needed";

export type GenesisPlatformAuthMode = "storage_state" | "profile_dir" | "cookie" | "token";

export type GenesisPlatformAccountRecord = {
  recordId: string;
  platform: string;
  accountId?: string;
  accountLabel?: string;
  browserKind?: "chrome" | "msedge";
  browserProfileName?: string;
  loginUrl: string;
  status: GenesisPlatformAccountStatus;
  authMode: GenesisPlatformAuthMode;
  storageStatePath?: string;
  profileDirPath?: string;
  profileDirectoryName?: string;
  cookieCount?: number;
  originCount?: number;
  capabilities: GenesisPlatformCapability[];
  lastUsedBy?: string;
  lastUsedAt?: number;
  currentTask?: string;
  lastVerifiedAt?: number;
  lastOutcome?: string;
  source: "manual_bootstrap" | "browser_popup" | "browser_scan";
  updatedAt: number;
  createdAt: number;
};

export type GenesisLoginStatePoolSummary = {
  totalAccountCount: number;
  readyAccountCount: number;
  busyAccountCount: number;
  pendingAccountCount: number;
  reloginNeededCount: number;
  blockedAccountCount: number;
  highestReadyPlatform?: string | null;
  highestGapPlatform?: string | null;
  recentAccounts: GenesisPlatformAccountRecord[];
  platformLeaders: Array<{
    platform: string;
    readyCount: number;
    pendingCount: number;
    reloginNeededCount: number;
    blockedCount: number;
    capabilityCount: number;
  }>;
};

export type GenesisOpenCliScoutItem = {
  source: string;
  title: string;
  url?: string;
  summary?: string;
  ts: number;
};

export type GenesisOpenCliCapabilitySummary = {
  available: boolean;
  invocation: "global" | "npx" | "none";
  commandCount: number;
  browserBridgeConnected: boolean;
  hotSourceCount: number;
  readyHotSourceNames: string[];
  lastProbeAt?: number;
  lastProbeError?: string | null;
  lastScoutAt?: number;
  lastScoutError?: string | null;
  latestScoutSource?: string | null;
  latestScoutTitle?: string | null;
  latestScoutUrl?: string | null;
  recentScoutItems: GenesisOpenCliScoutItem[];
};

export type GenesisLineageRecord = {
  lineageId: string;
  parentLineageId?: string;
  inheritanceMode?: "specialty" | "superpower" | "hybrid";
  specialtyOrigin?: string;
  superpowerInherited?: boolean;
  privilegeInheritanceReason?: string;
  runtimeProfile?: "observe" | "lab";
  latestSessionKey: string;
  completionCount: number;
  lastCompletionTs: number;
  lastReason?: string;
  accumulatedPrivilegeTax: number;
  publicValue: number;
  privateValue: number;
  survivalCredit: number;
  expansionCredit: number;
  ecologyState?: GenesisEcologyState;
  updatedAt: number;
};

export type GenesisLineageDispatchDecision = {
  lineageId: string;
  ecologyState: GenesisEcologyState;
  proactiveAllowed: boolean;
  reason?: string;
  pressure: number;
  lineage?: GenesisLineageRecord | null;
};

export type GenesisDispatchAssignmentRecord = {
  primaryAgentId: string;
  primarySessionKey: string;
  intensity: number;
  lane: "workflow" | "workflow-staggered";
  dispatchMode: "immediate" | "staggered" | "emergency";
  updatedAt: number;
  lineageId?: string;
  founderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator";
  assignment: {
    agentId: string;
    sessionKey: string;
    mode: "primary" | "support" | "revive";
    action: "lead" | "assist" | "reactivate";
    ecologyState: GenesisEcologyState;
    queued: boolean;
    lane: "workflow" | "workflow-staggered";
    dispatchMode: "immediate" | "staggered" | "emergency";
    delayMs: number;
    priorityBias: number;
  };
};

export type GenesisDispatchPlanRecord = {
  primaryAgentId: string;
  primarySessionKey: string;
  intensity: number;
  climateKind?: string;
  forcedCollaboration?: boolean;
  availableAgentCount?: number;
  targetCoverageRatio?: number;
  mobilizedCoverageRatio?: number;
  lane: "workflow" | "workflow-staggered";
  dispatchMode: "immediate" | "staggered" | "emergency";
  assignments?: Array<{
    agentId?: string;
    sessionKey?: string;
    mode?: string;
    action?: string;
    ecologyState?: string;
    queued?: boolean;
    lane?: string;
    dispatchMode?: string;
    delayMs?: number;
    priorityBias?: number;
  }>;
  reviveSessionKeys?: string[];
  deferredAgentIds?: string[];
  updatedAt: number;
};

export type GenesisSessionCoordination = {
  primaryAgentId: string;
  primarySessionKey: string;
  intensity: number;
  lane: "workflow" | "workflow-staggered";
  dispatchMode: "immediate" | "staggered" | "emergency";
  updatedAt: number;
  freshnessMs: number;
  supportCount: number;
  reviveCount: number;
  deferredCount: number;
  recommendedAction: "execute_primary" | "fanout_support" | "reactivate_lineages";
  assignment: {
    agentId: string;
    sessionKey: string;
    mode: "primary" | "support" | "revive";
    action: "lead" | "assist" | "reactivate";
    ecologyState: GenesisEcologyState;
    queued: boolean;
    lane: "workflow" | "workflow-staggered";
    dispatchMode: "immediate" | "staggered" | "emergency";
    delayMs: number;
    priorityBias: number;
  };
};

export type GenesisSocietySummary = {
  world: GenesisWorldState | null;
  tickState: GenesisSocietyTickState | null;
  proactiveWorkSummary?: GenesisProactiveWorkSummary;
  skillCapabilitySummary?: GenesisSkillCapabilitySummary;
  openCliCapabilitySummary?: GenesisOpenCliCapabilitySummary;
  loginStatePoolSummary?: GenesisLoginStatePoolSummary;
  collaborationSummary?: {
    activePlanCount: number;
    collaborativePlanCount: number;
    emergencyPlanCount: number;
    forcedCollaborationPlanCount: number;
    highCoveragePlanCount: number;
    mobilizedAgentCount: number;
    averageMobilizedCoverageRatio: number;
    averageTargetCoverageRatio: number;
    leadAssignmentCount: number;
    supportAssignmentCount: number;
    reviveAssignmentCount: number;
    productiveMobilizedLineageCount: number;
    productiveLeadLineageCount: number;
    productiveSupportLineageCount: number;
    productiveReviveLineageCount: number;
    productiveAssignmentCoverageRatio: number;
    leadYieldScore: number;
    supportYieldScore: number;
    reviveYieldScore: number;
    queuedAssignmentCount: number;
    averageAssignmentsPerPlan: number;
    coordinationScore: number;
    collaborationEffectScore: number;
  };
  vitalitySummary?: {
    lineageCount: number;
    childLineageCount: number;
    specialtyOnlyChildCount: number;
    superpowerChildCount: number;
    pressureAmplifiedSuperpowerChildCount?: number;
    pressureAmplifiedSuperpowerWorkingChildCount?: number;
    specialtyWorkingChildCount: number;
    specialtyProactiveChildCount: number;
    specialtyChildPublicValue: number;
    specialtyChildYieldEfficiency?: number;
    specialtyChildSustainedValueScore?: number;
    superpowerWorkingChildCount: number;
    superpowerProactiveChildCount: number;
    superpowerChildPublicValue: number;
    superpowerChildYieldEfficiency?: number;
    superpowerChildSustainedValueScore?: number;
    childYieldLeader?: "specialty" | "superpower" | "tie" | null;
    childYieldEfficiencyGap?: number;
    multiGenerationLineageCount?: number;
    secondGenerationChildCount?: number;
    thirdGenerationChildCount?: number;
    deepestGenerationDepth?: number;
    multiGenerationWorkingChildCount?: number;
    multiGenerationProactiveChildCount?: number;
    multiGenerationSuperpowerChildCount?: number;
    multiGenerationPublicValue?: number;
    multiGenerationYieldEfficiency?: number;
    multiGenerationSustainedValueScore?: number;
    multigenerationFounderCount?: number;
    highestMultigenerationFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestMultigenerationFounderScore?: number;
    multiGenerationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      deepestGenerationDepth: number;
      secondGenerationChildCount: number;
      thirdGenerationChildCount: number;
      multiGenerationChildCount: number;
      multiGenerationWorkingChildCount: number;
      multiGenerationProactiveChildCount: number;
      multiGenerationSuperpowerChildCount: number;
      multiGenerationValueScore: number;
      multiGenerationYieldEfficiency: number;
      multiGenerationEffectiveScore?: number;
      superpowerChildDurabilityPenaltyScore?: number;
    }>;
    childDegradationFounderCount?: number;
    highestChildDegradationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestChildDegradationFounderScore?: number;
    childDegradationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      degradedChildCount: number;
      degradedSuperpowerChildCount: number;
      childDegradationScore: number;
    }>;
    superpowerDurabilityFounderCount?: number;
    highestSuperpowerDurabilityFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestSuperpowerDurabilityFounderScore?: number;
    superpowerDurabilityLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      superpowerChildCount: number;
      multiGenerationSuperpowerChildCount?: number;
      superpowerChildYieldEfficiency?: number;
      superpowerChildSustainedValueScore?: number;
      superpowerChildDurabilityPenaltyScore?: number;
      superpowerChildDurabilityScore?: number;
    }>;
    longTermDegradationFounderCount?: number;
    highestLongTermDegradationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLongTermDegradationFounderScore?: number;
    longTermDegradationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      childDegradationScore?: number;
      superpowerChildDurabilityPenaltyScore?: number;
      terminalMortalityScore?: number;
      longTermDegradationScore?: number;
    }>;
    longTermRecoveryFounderCount?: number;
    highestLongTermRecoveryFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLongTermRecoveryFounderScore?: number;
    longTermRecoveryLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      multiGenerationEffectiveScore?: number;
      stableRecoveryScore?: number;
      durableRecoveryScore?: number;
      survivalClosureScore?: number;
      longTermRecoveryScore?: number;
    }>;
    climateReplicationPressureScore?: number;
    survivalReplicationPressureScore?: number;
    productiveReplicationCapacityScore?: number;
    replicationFrequencyScore?: number;
    replicationTriggerFrequencyScore?: number;
    replicationSuccessFrequencyScore?: number;
    averageReplicationLatency?: number;
    replicationSpeedScore?: number;
    climatePressuredChildCount?: number;
    climatePressuredSuperpowerChildCount?: number;
    climatePressuredChildValueScore?: number;
    climateSpecialtyWorkingChildCount?: number;
    climateSpecialtyProactiveChildCount?: number;
    climateSpecialtyChildPublicValue?: number;
    climateSpecialtyChildYieldEfficiency?: number;
    climateSpecialtyChildSustainedValueScore?: number;
    climateSuperpowerWorkingChildCount?: number;
    climateSuperpowerProactiveChildCount?: number;
    climateSuperpowerChildPublicValue?: number;
    climateSuperpowerChildYieldEfficiency?: number;
    climateSuperpowerChildSustainedValueScore?: number;
    climateChildYieldLeader?: "specialty" | "superpower" | "tie" | null;
    climateChildYieldEfficiencyGap?: number;
    survivalPressuredChildCount?: number;
    survivalPressuredSuperpowerChildCount?: number;
    survivalPressuredChildValueScore?: number;
    survivalSpecialtyWorkingChildCount?: number;
    survivalSpecialtyProactiveChildCount?: number;
    survivalSpecialtyChildPublicValue?: number;
    survivalSpecialtyChildYieldEfficiency?: number;
    survivalSpecialtyChildSustainedValueScore?: number;
    survivalSuperpowerWorkingChildCount?: number;
    survivalSuperpowerProactiveChildCount?: number;
    survivalSuperpowerChildPublicValue?: number;
    survivalSuperpowerChildYieldEfficiency?: number;
    survivalSuperpowerChildSustainedValueScore?: number;
    survivalChildYieldLeader?: "specialty" | "superpower" | "tie" | null;
    survivalChildYieldEfficiencyGap?: number;
    climateResponsiveReplicationParentCount?: number;
    survivalResponsiveReplicationParentCount?: number;
    proactiveReplicationParentCount?: number;
    collaborativeExpansionFounderCount?: number;
    crossFounderExpansionLinkCount?: number;
    crossFounderExpansionScore?: number;
    cooperativeYieldFounderCount?: number;
    highestCollaborationInfluenceFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestCollaborationInfluenceFounderScore?: number;
    highestCooperativeYieldFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestCooperativeYieldFounderScore?: number;
    leadCooperationFounderCount?: number;
    highestLeadCooperationFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestLeadCooperationFounderScore?: number;
    supportCooperationFounderCount?: number;
    highestSupportCooperationFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestSupportCooperationFounderScore?: number;
    reviveCooperationFounderCount?: number;
    highestReviveCooperationFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestReviveCooperationFounderScore?: number;
    highestExpansionInfluenceFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestExpansionInfluenceFounderScore?: number;
    expansionLinkLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      linkedFounderCount: number;
      collaborativeChildCount: number;
      linkedExpansionScore: number;
      linkedFounders: Array<"scout" | "builder" | "creator" | "auditor" | "negotiator">;
    }>;
    collaborationInfluenceLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      linkedFounderCount: number;
      proactiveWorkingLineageCount: number;
      roleAlignedProactiveYieldScore: number;
      collaborationInfluenceScore: number;
    }>;
    cooperativeYieldLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      linkedFounderCount: number;
      roleAlignedProactiveYieldScore: number;
      linkedExpansionScore: number;
      cooperativeYieldScore: number;
    }>;
    leadCooperationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      leadAssignmentCount: number;
      leadYieldScore: number;
      leadCooperationScore: number;
    }>;
    supportCooperationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      supportAssignmentCount: number;
      supportYieldScore: number;
      supportCooperationScore: number;
    }>;
    reviveCooperationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      reviveAssignmentCount: number;
      reviveYieldScore: number;
      reviveCooperationScore: number;
    }>;
    stressedLineageCount?: number;
    dormantLineageCount?: number;
    extinctLineageCount?: number;
    nearDeathLineageCount?: number;
    recoverableLineageCount?: number;
    terminalLineageCount?: number;
    backslidingLineageCount?: number;
    mortalityPressureScore?: number;
    highestMortalityFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestMortalityFounderScore?: number;
    terminalMortalityFounderCount?: number;
    highestTerminalMortalityFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestTerminalMortalityFounderScore?: number;
    recoveryReadyFounderCount?: number;
    cooperativeRecoveryFounderCount?: number;
    recoveryReadyScore?: number;
    highestRecoveryFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestRecoveryFounderScore?: number;
    stableRecoveryFounderCount?: number;
    durableRecoveryFounderCount?: number;
    transientRecoveryFounderCount?: number;
    recoveryChainFounderCount?: number;
    highestStableRecoveryFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestStableRecoveryFounderScore?: number;
    highestDurableRecoveryFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestDurableRecoveryFounderScore?: number;
    highestTransientRecoveryFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestTransientRecoveryFounderScore?: number;
    highestRecoveryChainFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestRecoveryChainFounderScore?: number;
    survivalClosureFounderCount?: number;
    highestSurvivalClosureFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestSurvivalClosureFounderScore?: number;
    recoveryStageMap?: {
      stages: Array<{
        stage: "stressed" | "dormant" | "extinct" | "recoverable" | "stable";
        founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
        score: number;
        runnerUpFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
        runnerUpScore?: number;
        leaderExplanation?: {
          components: Array<{
            key: string;
            score: number;
          }>;
        };
        runnerUpExplanation?: {
          components: Array<{
            key: string;
            score: number;
          }>;
        };
        basis:
          | "transient_recovery"
          | "revive_cooperation"
          | "survival_closure"
          | "stable_recovery"
          | "recovery_chain";
        lineageCount: number;
      }>;
    };
    mortalityLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      stressedLineageCount: number;
      dormantLineageCount: number;
      extinctLineageCount: number;
      nearDeathLineageCount: number;
      recoverableLineageCount: number;
      mortalityScore: number;
    }>;
    terminalMortalityLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      terminalLineageCount: number;
      backslidingLineageCount: number;
      terminalMortalityScore: number;
    }>;
    recoveryLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      recoverableLineageCount: number;
      linkedFounderCount: number;
      proactiveWorkingLineageCount: number;
      recoveryInfluenceScore: number;
    }>;
    stableRecoveryLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      recoverableLineageCount: number;
      nearDeathLineageCount: number;
      proactiveWorkingLineageCount: number;
      stableRecoveryScore: number;
    }>;
    durableRecoveryLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      recoverableLineageCount: number;
      nearDeathLineageCount: number;
      dormantLineageCount: number;
      durableRecoveryScore: number;
    }>;
    transientRecoveryLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      recoverableLineageCount: number;
      nearDeathLineageCount: number;
      dormantLineageCount: number;
      transientRecoveryScore: number;
    }>;
    recoveryChainLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      transientRecoveryRate: number;
      stableRecoveryRate: number;
      durableRecoveryRate: number;
      recoveryChainScore: number;
    }>;
    survivalClosureLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      terminalLineageCount: number;
      stableRecoveryRate: number;
      durableRecoveryRate: number;
      survivalClosureScore: number;
    }>;
    replicatingParentCount: number;
    maxChildrenPerParent: number;
    workingLineageCount: number;
    childWorkingLineageCount: number;
    replicatingWorkingParentCount: number;
    heartbeatLineageCount: number;
    proactiveReadyLineageCount: number;
    proactiveWorkingLineageCount: number;
    activeFocusLineageCount: number;
    activeTriggerCount: number;
    recentCapturedSkillCount: number;
    recentDerivedSkillCount: number;
    totalPublicValue: number;
    totalPrivateValue: number;
    totalSurvivalCredit: number;
    totalExpansionCredit: number;
    proactiveSignalScore: number;
    autonomousExpansionScore: number;
    founderRoleCoverageCount: number;
    founderYieldCoverageCount: number;
    roleAlignedWorkingLineageCount: number;
    roleAlignedProactiveLineageCount: number;
    roleAlignedProactiveYieldScore: number;
    highestYieldFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestYieldFounderScore?: number;
    proactiveYieldLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      proactiveYieldEfficiency: number;
      alignedProactiveYieldScore: number;
      proactiveWorkingLineageCount: number;
    }>;
    highestReplicationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestReplicationFounderScore?: number;
    highestReplicationTempoFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestReplicationTempoFounderScore?: number;
    highestClimateReplicationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestClimateReplicationFounderScore?: number;
    highestSurvivalReplicationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestSurvivalReplicationFounderScore?: number;
    replicationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      childCount: number;
      workingChildCount: number;
      proactiveChildCount: number;
      superpowerChildCount: number;
      replicationValueScore: number;
    }>;
    replicationTempoLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      replicationTempoScore: number;
      childCount: number;
      proactiveChildCount: number;
      superpowerChildCount: number;
    }>;
    climateReplicationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      climateReplicationValueScore: number;
      climateChildCount: number;
      climateSuperpowerChildCount: number;
    }>;
    survivalReplicationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      survivalReplicationValueScore: number;
      survivalChildCount: number;
      survivalSuperpowerChildCount: number;
    }>;
    historyDrivenProactiveLineageCount?: number;
    userProfileDrivenProactiveLineageCount?: number;
    userIntentDrivenProactiveYieldScore?: number;
    highestUserIntentFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestUserIntentFounderScore?: number;
    userIntentLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      historyIntentScore: number;
      profileIntentScore: number;
      userIntentAlignmentScore: number;
      proactiveWorkingLineageCount: number;
      alignedProactiveYieldScore: number;
    }>;
    proactiveSpecializationScore: number;
    founderRoleBreakdown: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      lineageCount: number;
      workingLineageCount: number;
      proactiveWorkingLineageCount: number;
      roleAlignedLineageCount: number;
      roleAlignedProactiveLineageCount: number;
      activeFocusCount: number;
      activeTriggerCount: number;
      historyIntentScore?: number;
      profileIntentScore?: number;
      userIntentAlignmentScore?: number;
      timeWeightedHistoryIntentScore?: number;
      workProfileIntentScore?: number;
      interestProfileIntentScore?: number;
      longTermIntentAlignmentScore?: number;
      publicValue: number;
      survivalCredit: number;
      proactivePublicValue: number;
      proactiveSurvivalCredit: number;
      alignedProactiveYieldScore: number;
      proactiveYieldEfficiency?: number;
      childCount?: number;
      workingChildCount?: number;
      proactiveChildCount?: number;
      superpowerChildCount?: number;
      superpowerWorkingChildCount?: number;
      superpowerProactiveChildCount?: number;
      superpowerChildValueScore?: number;
      superpowerChildYieldEfficiency?: number;
      superpowerChildSustainedValueScore?: number;
      deepestGenerationDepth?: number;
      secondGenerationChildCount?: number;
      thirdGenerationChildCount?: number;
      multiGenerationChildCount?: number;
      multiGenerationWorkingChildCount?: number;
      multiGenerationProactiveChildCount?: number;
      multiGenerationSuperpowerChildCount?: number;
      multiGenerationSuperpowerWorkingChildCount?: number;
      multiGenerationSuperpowerProactiveChildCount?: number;
      multiGenerationSuperpowerValueScore?: number;
      multiGenerationValueScore?: number;
      multiGenerationEffectiveScore?: number;
      multiGenerationYieldEfficiency?: number;
      replicationValueScore?: number;
      degradedChildCount?: number;
      degradedSuperpowerChildCount?: number;
      childDegradationScore?: number;
      superpowerChildDurabilityPenaltyScore?: number;
      superpowerChildDurabilityScore?: number;
      longTermDegradationScore?: number;
      longTermRecoveryScore?: number;
      replicationTempoScore?: number;
      climateChildCount?: number;
      climateSuperpowerChildCount?: number;
      climateReplicationValueScore?: number;
      survivalChildCount?: number;
      survivalSuperpowerChildCount?: number;
      survivalReplicationValueScore?: number;
      linkedFounderCount?: number;
      collaborativeChildCount?: number;
      linkedExpansionScore?: number;
      linkedFounders?: Array<"scout" | "builder" | "creator" | "auditor" | "negotiator">;
      stressedLineageCount?: number;
      dormantLineageCount?: number;
      extinctLineageCount?: number;
      nearDeathLineageCount?: number;
      recoverableLineageCount?: number;
      terminalLineageCount?: number;
      backslidingLineageCount?: number;
      mortalityScore?: number;
      terminalMortalityScore?: number;
      recoveryInfluenceScore?: number;
      collaborationInfluenceScore?: number;
      cooperativeYieldScore?: number;
      leadAssignmentCount?: number;
      supportAssignmentCount?: number;
      reviveAssignmentCount?: number;
      leadYieldScore?: number;
      supportYieldScore?: number;
      reviveYieldScore?: number;
      leadCooperationScore?: number;
      supportCooperationScore?: number;
      reviveCooperationScore?: number;
      stableRecoveryScore?: number;
      durableRecoveryScore?: number;
      transientRecoveryScore?: number;
      transientRecoveryRate?: number;
      stableRecoveryRate?: number;
      durableRecoveryRate?: number;
      recoveryChainScore?: number;
      survivalClosureScore?: number;
    }>;
    topParentLineages: Array<{
      lineageId: string;
      childCount: number;
      ecologyState: GenesisEcologyState;
    }>;
  };
  experimentSignals?: {
    defaultMinIntervalMs: number;
    defaultMaxTicks: number;
    defaultMaxActions: number;
    defaultMaxRounds: number;
    defaultMaxFailureRounds: number;
    defaultMaxStableRounds: number;
    nextPlanSkillEvolutionBias: number;
    amplificationScore: number;
    runawayRiskScore: number;
    phaseState: "stable" | "amplifying" | "runaway-risk";
  };
  skillEvolutionSummary?: {
    recentEventCount: number;
    modeCounts: Record<"fix" | "derived" | "captured", number>;
    topLineages: Array<{
      lineageId: string;
      eventCount: number;
      fixCount: number;
      derivedCount: number;
      capturedCount: number;
      lastMode?: "fix" | "derived" | "captured";
      lastReason?: string;
    }>;
  };
  focusSummary: {
    activeFocusCount: number;
    activeLineageCount: number;
    activeTriggerCount?: number;
    topFocusedLineages: Array<{
      lineageId: string;
      activeFocusCount: number;
      activeTriggerCount?: number;
      totalIntensity: number;
      strongestFocusTitle?: string;
    }>;
  };
  eventLogSummary?: {
    recentEntryCount: number;
    environmentEventCount: number;
    runCompletionCount: number;
    workflowDispatchCount: number;
    recentEnvironmentTriggers: Record<"cron" | "heartbeat" | "workflow", number>;
    lastEntryTs?: number;
    lastEnvironmentTs?: number;
    lastEnvironmentSummary?: string;
  };
  trajectorySummary?: {
    recentTrajectoryCount: number;
    climateTrajectoryCount: number;
    survivalTrajectoryCount: number;
    recoveryTrajectoryCount: number;
    replicationTrajectoryCount: number;
    idleTrajectoryCount: number;
    averageProcessReward: number;
    averageOutcomeReward: number;
    averageTotalReward: number;
    latestMode?: "climate" | "survival" | "recovery" | "replication" | "idle";
    lastTrajectoryTs?: number;
    highestRewardFounderOrigin?: "scout" | "builder" | "creator" | "auditor" | "negotiator" | null;
    highestRewardFounderScore?: number;
  };
  metaClawSummary?: {
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
  userIntentSummary?: {
    historyEntryCount: number;
    searchHistoryCount: number;
    queryHistoryCount: number;
    consultationHistoryCount: number;
    dominantHistoryKind?: "search" | "query" | "consultation" | null;
    profileVisible: boolean;
    profileKeywordCount: number;
    timeWeightedHistorySignalScore?: number;
    workProfileSignalScore?: number;
    interestProfileSignalScore?: number;
    strongestTopicCluster?: string | null;
    strongestTopicSignalScore?: number;
    historyDrivenFounderCount: number;
    profileDrivenFounderCount: number;
    proactiveIntentFounderCount: number;
    longTermIntentFounderCount?: number;
    highestIntentFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestIntentFounderScore?: number;
    highestLongTermIntentFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLongTermIntentFounderScore?: number;
    historySignalScore: number;
    profileSignalScore: number;
    combinedSignalScore: number;
    recentKeywords: string[];
    topicClusters?: Array<{
      cluster: string;
      weightedSignalScore: number;
      historySignalScore: number;
      profileSignalScore: number;
    }>;
    founderIntentLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      historyIntentScore: number;
      profileIntentScore: number;
      userIntentAlignmentScore: number;
      timeWeightedHistoryIntentScore?: number;
      workProfileIntentScore?: number;
      interestProfileIntentScore?: number;
      longTermIntentAlignmentScore?: number;
      matchedTopicClusters?: string[];
      matchedHistoryCount: number;
      matchedProfileKeywordCount: number;
    }>;
  };
  learningSummary?: {
    learningFounderCount: number;
    trajectoryRewardLeaderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    trajectoryRewardLeaderScore?: number;
    metaClawTargetFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    metaClawOptimizationActive: boolean;
    highestLearningVelocityFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLearningVelocityFounderScore?: number;
    highestLearningConversionFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLearningConversionFounderScore?: number;
    highestLearningInheritanceFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLearningInheritanceFounderScore?: number;
    highestLearningMomentumFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestLearningMomentumFounderScore?: number;
    highestReplicationLearningMomentumFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestReplicationLearningMomentumFounderScore?: number;
    highestRecoveryLearningMomentumFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestRecoveryLearningMomentumFounderScore?: number;
    highestReplicationQualificationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestReplicationQualificationFounderScore?: number;
    highestRecoveryQualificationFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestRecoveryQualificationFounderScore?: number;
    nicheBalancedFounderCount?: number;
    highestNicheBalanceFounderOrigin?:
      | "scout"
      | "builder"
      | "creator"
      | "auditor"
      | "negotiator"
      | null;
    highestNicheBalanceFounderScore?: number;
    learningVelocityLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      learningVelocityScore: number;
      trajectoryRewardBias: number;
      metaClawBias: number;
      proactiveYieldEfficiency: number;
      alignedProactiveYieldScore: number;
      cooperativeYieldScore: number;
      recoveryChainScore: number;
    }>;
    learningConversionLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      learningConversionScore: number;
      learningVelocityScore: number;
      replicationValueScore: number;
      climateReplicationValueScore: number;
      survivalReplicationValueScore: number;
      stableRecoveryScore: number;
      durableRecoveryScore: number;
      recoveryChainScore: number;
    }>;
    learningInheritanceLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      learningInheritanceScore: number;
      learningConversionScore: number;
      childCount: number;
      workingChildCount: number;
      proactiveChildCount: number;
      superpowerChildCount: number;
      inheritanceTransferRate: number;
      superpowerInheritanceRate: number;
      childDegradationScore?: number;
      superpowerChildDurabilityPenaltyScore?: number;
      superpowerChildDurabilityScore?: number;
    }>;
    learningMomentumLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      learningMomentumScore: number;
      replicationLearningMomentumScore?: number;
      recoveryLearningMomentumScore?: number;
      trajectoryRewardBias: number;
      metaClawBias: number;
      learningVelocityScore: number;
      learningConversionScore: number;
      proactiveYieldEfficiency: number;
      recoveryChainScore: number;
    }>;
    replicationLearningMomentumLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      replicationLearningMomentumScore: number;
      learningMomentumScore: number;
      replicationValueScore: number;
      climateReplicationValueScore: number;
      survivalReplicationValueScore: number;
      leadCooperationScore?: number;
      multiGenerationEffectiveScore?: number;
    }>;
    recoveryLearningMomentumLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      recoveryLearningMomentumScore: number;
      learningMomentumScore: number;
      stableRecoveryRate?: number;
      durableRecoveryRate?: number;
      recoveryChainScore: number;
      supportCooperationScore?: number;
      reviveCooperationScore?: number;
      longTermRecoveryScore?: number;
    }>;
    replicationQualificationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      replicationQualificationScore: number;
      learningInheritanceScore: number;
      learningConversionScore: number;
      learningMomentumScore?: number;
      replicationLearningMomentumScore?: number;
      replicationValueScore: number;
      climateReplicationValueScore: number;
      survivalReplicationValueScore: number;
      superpowerInheritanceRate: number;
      mortalityDebtScore?: number;
      childDegradationScore?: number;
      superpowerChildDurabilityPenaltyScore?: number;
      superpowerChildDurabilityScore?: number;
      longTermDegradationScore?: number;
      longTermRecoveryScore?: number;
      multiGenerationEffectiveScore?: number;
      nicheBalanceScore?: number;
      nicheDistinctivenessScore?: number;
      nicheResilienceScore?: number;
      nicheIrreplaceabilityScore?: number;
      dominancePressure?: number;
    }>;
    recoveryQualificationLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      recoveryQualificationScore: number;
      learningConversionScore: number;
      learningMomentumScore?: number;
      recoveryLearningMomentumScore?: number;
      stableRecoveryScore: number;
      durableRecoveryScore: number;
      recoveryChainScore: number;
      stableRecoveryRate?: number;
      durableRecoveryRate?: number;
      transientRecoveryRate?: number;
      survivalClosureScore?: number;
      mortalityDebtScore?: number;
      longTermDegradationScore?: number;
      longTermRecoveryScore?: number;
      metaClawBias: number;
      trajectoryRewardBias: number;
      nicheBalanceScore?: number;
      nicheDistinctivenessScore?: number;
      nicheResilienceScore?: number;
      nicheIrreplaceabilityScore?: number;
      dominancePressure?: number;
    }>;
    nicheBalanceLeaders?: Array<{
      founderOrigin: "scout" | "builder" | "creator" | "auditor" | "negotiator";
      nicheBalanceScore: number;
      nicheStrengthScore: number;
      nicheDistinctivenessScore?: number;
      nicheResilienceScore?: number;
      nicheIrreplaceabilityScore?: number;
      roleLeadershipBonus?: number;
      scarcityAlignmentBonus?: number;
      dominancePenaltyApplied?: number;
      underrepresentedBoost: number;
      dominancePressure: number;
      mortalityDebtScore?: number;
    }>;
  };
  ecologyCounts: Record<GenesisEcologyState, number>;
  activeDispatchCount: number;
  reviveDispatchCount: number;
  activePlans: Array<{
    primaryAgentId: string;
    primarySessionKey: string;
    intensity: number;
    climateKind?: string;
    forcedCollaboration?: boolean;
    availableAgentCount?: number;
    targetCoverageRatio?: number;
    mobilizedCoverageRatio?: number;
    lane: "workflow" | "workflow-staggered";
    dispatchMode: "immediate" | "staggered" | "emergency";
    supportCount: number;
    reviveCount: number;
    deferredCount: number;
    updatedAt: number;
  }>;
  coordinationQueue: Array<{
    primaryAgentId: string;
    primarySessionKey: string;
    intensity: number;
    updatedAt: number;
    agentId: string;
    sessionKey: string;
    mode: "primary" | "support" | "revive";
    action: "lead" | "assist" | "reactivate";
    ecologyState: GenesisEcologyState;
    lane: "workflow" | "workflow-staggered";
    dispatchMode: "immediate" | "staggered" | "emergency";
    delayMs: number;
    priorityBias: number;
    queued: boolean;
  }>;
  coordinationBatches: Array<{
    primaryAgentId: string;
    primarySessionKey: string;
    intensity: number;
    lane: "workflow" | "workflow-staggered";
    dispatchMode: "immediate" | "staggered" | "emergency";
    updatedAt: number;
    lead: {
      agentId: string;
      sessionKey: string;
      priorityBias: number;
    } | null;
    support: Array<{
      agentId: string;
      sessionKey: string;
      priorityBias: number;
      delayMs: number;
    }>;
    revive: Array<{
      agentId: string;
      sessionKey: string;
      priorityBias: number;
      delayMs: number;
    }>;
    deferredCount: number;
    recommendedAction: "execute_primary" | "fanout_support" | "reactivate_lineages";
  }>;
  topLineages: Array<{
    lineageId: string;
    ecologyState: GenesisEcologyState;
    survivalCredit: number;
    expansionCredit: number;
    accumulatedPrivilegeTax: number;
    skillEvolutionBias?: number;
    latestSessionKey: string;
  }>;
};

export type GenesisSocietyPlanDetail = {
  primaryAgentId: string;
  primarySessionKey: string;
  intensity: number;
  climateKind?: string;
  forcedCollaboration?: boolean;
  availableAgentCount?: number;
  targetCoverageRatio?: number;
  mobilizedCoverageRatio?: number;
  lane: "workflow" | "workflow-staggered";
  dispatchMode: "immediate" | "staggered" | "emergency";
  updatedAt: number;
  supportCount: number;
  reviveCount: number;
  deferredCount: number;
  recommendedAction: "execute_primary" | "fanout_support" | "reactivate_lineages";
  reviveSessionKeys: string[];
  deferredAgentIds: string[];
  lead: {
    agentId: string;
    sessionKey: string;
    priorityBias: number;
  } | null;
  support: Array<{
    agentId: string;
    sessionKey: string;
    priorityBias: number;
    delayMs: number;
  }>;
  revive: Array<{
    agentId: string;
    sessionKey: string;
    priorityBias: number;
    delayMs: number;
  }>;
  assignments: Array<{
    agentId: string;
    sessionKey: string;
    mode: "primary" | "support" | "revive";
    action: "lead" | "assist" | "reactivate";
    ecologyState: GenesisEcologyState;
    lane: "workflow" | "workflow-staggered";
    dispatchMode: "immediate" | "staggered" | "emergency";
    delayMs: number;
    priorityBias: number;
    queued: boolean;
  }>;
  executionPhases: Array<{
    phase: "reactivate" | "lead" | "support";
    reason: "reactivate_lineages" | "execute_primary" | "fanout_support";
    count: number;
    sessions: Array<{
      agentId: string;
      sessionKey: string;
      action: "lead" | "assist" | "reactivate";
      priorityBias: number;
      delayMs: number;
      queued: boolean;
    }>;
  }>;
};

export type GenesisSocietyNextPlan = {
  reason:
    | "reactivate_lineages"
    | "fanout_support"
    | "execute_primary"
    | "no_active_plans";
  score: number;
  plan: GenesisSocietyPlanDetail | null;
};

export type GenesisSocietyTickState = {
  version: number;
  lastTickAt?: number;
  lastPrimarySessionKey?: string;
  lastTerminationReason?: string;
  runCount: number;
  skipCount: number;
  idleStreak: number;
  updatedAt: number;
};

export const GENESIS_DISPATCH_ASSIGNMENT_FRESH_MS = 20 * 60_000;

function resolveGenesisCanonicalStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "genesis");
}

function normalizeGenesisPath(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

function isGenesisDistributionBaseDir(stateDir: string): boolean {
  const normalized = normalizeGenesisPath(stateDir);
  return (
    normalized.endsWith("/.openclaw-genesis") ||
    normalized.includes("/.openclaw-genesis/")
  );
}

function resolveLegacyGenesisStateDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const currentBaseDir = resolveStateDir(env);
  if (!isGenesisDistributionBaseDir(currentBaseDir)) {
    return null;
  }
  const homeDir = env.HOME ?? env.USERPROFILE ?? os.homedir();
  const legacyDir = path.join(homeDir, ".openclaw", "genesis");
  const currentDir = resolveGenesisCanonicalStateDir(env);
  if (normalizeGenesisPath(legacyDir) === normalizeGenesisPath(currentDir)) {
    return null;
  }
  return fs.existsSync(legacyDir) ? legacyDir : null;
}

function ensureGenesisCanonicalStateSync(env: NodeJS.ProcessEnv = process.env): void {
  const currentDir = resolveGenesisCanonicalStateDir(env);
  const legacyDir = resolveLegacyGenesisStateDir(env);
  if (!legacyDir) {
    return;
  }
  const markerPath = path.join(currentDir, ".legacy-migrated");
  if (fs.existsSync(markerPath)) {
    return;
  }
  fs.mkdirSync(currentDir, { recursive: true });
  fs.cpSync(legacyDir, currentDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        migratedFrom: legacyDir,
        migratedAt: Date.now(),
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
}

export function resolveGenesisStateDir(env: NodeJS.ProcessEnv = process.env): string {
  ensureGenesisCanonicalStateSync(env);
  return resolveGenesisCanonicalStateDir(env);
}

export function resolveGenesisLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "ledger.jsonl");
}

export function resolveGenesisEventLogSummaryPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "event-log-summary.json");
}

export function resolveGenesisFocusSummaryPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "focus-summary.json");
}

export function resolveGenesisDispatchSummaryPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "dispatch-summary.json");
}

export function resolveGenesisLineageSummaryPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "lineage-summary.json");
}

export function resolveGenesisExperimentProfilePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "experiment-profile.json");
}

export function resolveGenesisSkillEvolutionLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "skill-evolution.jsonl");
}

export function resolveGenesisSkillEvolutionSummaryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "skill-evolution-summary.json");
}

export function resolveGenesisTrajectoryLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "trajectory-log.jsonl");
}

export function resolveGenesisTrajectorySummaryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "trajectory-summary.json");
}

export function resolveGenesisUserIntentHistoryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "user-intent-history.json");
}

export function resolveGenesisUserIntentSummaryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "user-intent-summary.json");
}

export function resolveGenesisMetaClawStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "metaclaw-state.json");
}

export function resolveGenesisProactiveWorkLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "proactive-work-log.jsonl");
}

export function resolveGenesisProactiveWorkSummaryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "proactive-work-summary.json");
}

export function resolveGenesisLoginStatePoolPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "login-state-pool.json");
}

export function resolveGenesisOpenCliCapabilitySummaryPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "opencli-capability-summary.json");
}

export function resolveGenesisDailyTrafficLogPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "daily-traffic-log.jsonl");
}

export function resolveGenesisLoginStateStorageDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "login-storage");
}

export function resolveGenesisRunCompletionsPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "run-completions.jsonl");
}

export function resolveGenesisWorldStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "world-state.json");
}

export function resolveGenesisTickStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveGenesisStateDir(env), "society-tick-state.json");
}

export function resolveGenesisSessionRecordPath(
  sessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    resolveGenesisStateDir(env),
    "session-records",
    `${encodeURIComponent(sessionKey)}.json`,
  );
}

export function resolveGenesisLineageRecordPath(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "lineages", `${encodeURIComponent(lineageId)}.json`);
}

export function resolveGenesisDispatchPlanPath(
  primarySessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    resolveGenesisStateDir(env),
    "dispatch-plans",
    `${encodeURIComponent(primarySessionKey)}.json`,
  );
}

export function resolveGenesisDispatchAssignmentPath(
  sessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    resolveGenesisStateDir(env),
    "dispatch-assignments",
    `${encodeURIComponent(sessionKey)}.json`,
  );
}

export function readJsonFileSync<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    try {
      return JSON.parse(raw) as T;
    } catch (parseError) {
      const retryRaw = fs.readFileSync(filePath, "utf-8");
      if (!retryRaw.trim()) {
        return null;
      }
      return JSON.parse(retryRaw) as T;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function readJsonDirSync<T>(dirPath: string): T[] {
  try {
    return fs
      .readdirSync(dirPath)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFileSync<T>(path.join(dirPath, entry)))
      .filter((entry): entry is T => Boolean(entry));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function resolveGenesisRecommendedAction(plan: GenesisDispatchPlanRecord): "execute_primary" | "fanout_support" | "reactivate_lineages" {
  const assignments = Array.isArray(plan.assignments) ? plan.assignments : [];
  const supportCount = assignments.filter((assignment) => assignment.action === "assist").length;
  const reviveCount = assignments.filter((assignment) => assignment.action === "reactivate").length;
  const reviveSessionCount = Array.isArray(plan.reviveSessionKeys) ? plan.reviveSessionKeys.length : 0;
  if (reviveCount > 0 || reviveSessionCount > 0) {
    return "reactivate_lineages";
  }
  if (supportCount > 0) {
    return "fanout_support";
  }
  return "execute_primary";
}

function resolveLineageCandidateIds(lineageId: string): string[] {
  const trimmed = lineageId.trim();
  if (!trimmed) {
    return [];
  }
  const candidates = new Set<string>([trimmed]);
  if (!trimmed.includes(":")) {
    candidates.add(`agent:${trimmed}:main`);
  }
  const parsed = parseAgentSessionKey(trimmed);
  if (parsed?.agentId) {
    candidates.add(parsed.agentId);
    candidates.add(`agent:${parsed.agentId}:main`);
  }
  return [...candidates];
}

export function readGenesisWorldStateSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisWorldState | null {
  return readJsonFileSync<GenesisWorldState>(resolveGenesisWorldStatePath(env));
}

export function readGenesisSocietyTickStateSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietyTickState | null {
  return readJsonFileSync<GenesisSocietyTickState>(resolveGenesisTickStatePath(env));
}

export function writeGenesisSocietyTickStateSync(
  state: GenesisSocietyTickState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisTickStatePath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export function readGenesisLineageRecordSync(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageRecord | null {
  for (const candidate of resolveLineageCandidateIds(lineageId)) {
    const record = readJsonFileSync<GenesisLineageRecord>(
      resolveGenesisLineageRecordPath(candidate, env),
    );
    if (record) {
      return record;
    }
  }
  return null;
}

export function readGenesisDispatchAssignmentSync(
  sessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisDispatchAssignmentRecord | null {
  return readJsonFileSync<GenesisDispatchAssignmentRecord>(
    resolveGenesisDispatchAssignmentPath(sessionKey, env),
  );
}

export function isGenesisDispatchAssignmentFresh(
  assignment: GenesisDispatchAssignmentRecord | null | undefined,
  nowMs = Date.now(),
): assignment is GenesisDispatchAssignmentRecord {
  return Boolean(
    assignment &&
      Number.isFinite(assignment.updatedAt) &&
      nowMs - assignment.updatedAt <= GENESIS_DISPATCH_ASSIGNMENT_FRESH_MS,
  );
}

export function readFreshGenesisDispatchAssignmentSync(
  sessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs = Date.now(),
): GenesisDispatchAssignmentRecord | null {
  const assignment = readGenesisDispatchAssignmentSync(sessionKey, env);
  return isGenesisDispatchAssignmentFresh(assignment, nowMs) ? assignment : null;
}

export function readGenesisSessionCoordinationSync(
  sessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs = Date.now(),
): GenesisSessionCoordination | null {
  const assignment = readFreshGenesisDispatchAssignmentSync(sessionKey, env, nowMs);
  if (!assignment) {
    return null;
  }
  const plan =
    readJsonFileSync<GenesisDispatchPlanRecord>(
      resolveGenesisDispatchPlanPath(assignment.primarySessionKey, env),
    ) ?? {
      primaryAgentId: assignment.primaryAgentId,
      primarySessionKey: assignment.primarySessionKey,
      intensity: assignment.intensity,
      lane: assignment.lane,
      dispatchMode: assignment.dispatchMode,
      assignments: [assignment.assignment],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      updatedAt: assignment.updatedAt,
    };
  const assignments = Array.isArray(plan.assignments) ? plan.assignments : [];
  const supportCount = assignments.filter((entry) => entry.action === "assist").length;
  const reviveCount = Array.isArray(plan.reviveSessionKeys)
    ? plan.reviveSessionKeys.length
    : assignments.filter((entry) => entry.action === "reactivate").length;
  return {
    primaryAgentId: assignment.primaryAgentId,
    primarySessionKey: assignment.primarySessionKey,
    intensity: assignment.intensity,
    lane: assignment.lane,
    dispatchMode: assignment.dispatchMode,
    updatedAt: assignment.updatedAt,
    freshnessMs: Math.max(0, nowMs - assignment.updatedAt),
    supportCount,
    reviveCount,
    deferredCount: Array.isArray(plan.deferredAgentIds) ? plan.deferredAgentIds.length : 0,
    recommendedAction: resolveGenesisRecommendedAction(plan),
    assignment: assignment.assignment,
  };
}

export function resolveGenesisEcologyState(params: {
  lineage?: GenesisLineageRecord | null;
  world?: GenesisWorldState | null;
}): GenesisEcologyState {
  const lineage = params.lineage;
  if (!lineage) {
    return "active";
  }
  const now = Date.now();
  const pressure = params.world?.currentPressure ?? 0;
  const vitality =
    lineage.survivalCredit + lineage.expansionCredit - lineage.accumulatedPrivilegeTax * 0.5 - pressure;
  const latestActivityTs = Math.max(
    0,
    Number.isFinite(lineage.updatedAt) ? lineage.updatedAt : 0,
    Number.isFinite(lineage.lastCompletionTs) ? lineage.lastCompletionTs : 0,
  );
  const recentActivityAgeMs = latestActivityTs > 0 ? now - latestActivityTs : Number.POSITIVE_INFINITY;
  const recentParticipation =
    recentActivityAgeMs <= 20 * 60_000 &&
    lineage.publicValue + lineage.privateValue + lineage.survivalCredit + lineage.expansionCredit > 0;
  if (recentParticipation) {
    const participationCredit =
      lineage.publicValue + lineage.privateValue + lineage.survivalCredit + lineage.expansionCredit;
    const workflowSeedBuffer =
      lineage.lastReason?.trim().toLowerCase() === "workflow_seed" ? 0.9 : 0;
    const participationBuffer = Math.min(
      Math.max(1.25, pressure + 0.5) + workflowSeedBuffer,
      participationCredit * (3.5 + workflowSeedBuffer),
    );
    const effectiveVitality = vitality + participationBuffer;
    if (effectiveVitality < -1.5) {
      return "dormant";
    }
    if (effectiveVitality < 1.25 || pressure > lineage.survivalCredit + participationBuffer * 0.35) {
      return "stressed";
    }
    return "active";
  }

  if (vitality <= -1) {
    return "extinct";
  }
  if (vitality <= 0) {
    return "dormant";
  }
  if (vitality < 1 || pressure > lineage.survivalCredit) {
    return "stressed";
  }
  return "active";
}

export function resolveGenesisReplicationBoost(world?: GenesisWorldState | null): number {
  const raw = world?.replicationBoost ?? 0;
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.min(1.5, raw));
}

export function resolveGenesisLineageDispatchDecision(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageDispatchDecision {
  const lineage = readGenesisLineageRecordSync(lineageId, env);
  const world = readGenesisWorldStateSync(env);
  const ecologyState = resolveGenesisEcologyState({ lineage, world });
  const proactiveAllowed = ecologyState !== "dormant" && ecologyState !== "extinct";
  return {
    lineageId,
    ecologyState,
    proactiveAllowed,
    ...(proactiveAllowed ? {} : { reason: `genesis_lineage_${ecologyState}` }),
    pressure: world?.currentPressure ?? 0,
    ...(lineage ? { lineage } : {}),
  };
}
