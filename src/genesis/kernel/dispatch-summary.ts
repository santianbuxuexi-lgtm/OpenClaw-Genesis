import fs from "node:fs";
import path from "node:path";
import {
  readJsonDirSync,
  readJsonFileSync,
  resolveGenesisDispatchPlanPath,
  resolveGenesisDispatchSummaryPath,
  resolveGenesisRecommendedAction,
  resolveGenesisStateDir,
  type GenesisDispatchPlanRecord,
  type GenesisLineageRecord,
  type GenesisSocietyPlanDetail,
  type GenesisSocietySummary,
} from "./state.js";

export type GenesisDispatchSummary = Pick<
  GenesisSocietySummary,
  | "activeDispatchCount"
  | "reviveDispatchCount"
  | "activePlans"
  | "coordinationQueue"
  | "coordinationBatches"
  | "collaborationSummary"
>;

const DEFAULT_GENESIS_DISPATCH_SUMMARY: GenesisDispatchSummary = {
  activeDispatchCount: 0,
  reviveDispatchCount: 0,
  activePlans: [],
  coordinationQueue: [],
  coordinationBatches: [],
  collaborationSummary: {
    activePlanCount: 0,
    collaborativePlanCount: 0,
    emergencyPlanCount: 0,
    forcedCollaborationPlanCount: 0,
    highCoveragePlanCount: 0,
    mobilizedAgentCount: 0,
    averageMobilizedCoverageRatio: 0,
    averageTargetCoverageRatio: 0,
    leadAssignmentCount: 0,
    supportAssignmentCount: 0,
    reviveAssignmentCount: 0,
    productiveMobilizedLineageCount: 0,
    productiveLeadLineageCount: 0,
    productiveSupportLineageCount: 0,
    productiveReviveLineageCount: 0,
    productiveAssignmentCoverageRatio: 0,
    leadYieldScore: 0,
    supportYieldScore: 0,
    reviveYieldScore: 0,
    queuedAssignmentCount: 0,
    averageAssignmentsPerPlan: 0,
    coordinationScore: 0,
    collaborationEffectScore: 0,
  },
};

function isProductiveLineage(lineage: GenesisLineageRecord | null | undefined): boolean {
  if (!lineage) {
    return false;
  }
  return (
    lineage.completionCount > 0 ||
    lineage.publicValue > 0 ||
    lineage.privateValue > 0 ||
    lineage.survivalCredit > 0 ||
    lineage.expansionCredit > 0
  );
}

function buildGenesisDispatchSummary(
  dispatchPlans: GenesisDispatchPlanRecord[],
  lineages: GenesisLineageRecord[],
): GenesisDispatchSummary {
  const lineageById = new Map(lineages.map((lineage) => [lineage.lineageId, lineage]));
  const activePlans = [...dispatchPlans]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 10)
    .map((plan) => ({
      primaryAgentId: plan.primaryAgentId,
      primarySessionKey: plan.primarySessionKey,
      intensity: plan.intensity,
      climateKind: typeof plan.climateKind === "string" ? plan.climateKind : undefined,
      forcedCollaboration: plan.forcedCollaboration === true,
      availableAgentCount:
        typeof plan.availableAgentCount === "number" ? plan.availableAgentCount : undefined,
      targetCoverageRatio:
        typeof plan.targetCoverageRatio === "number" ? plan.targetCoverageRatio : undefined,
      mobilizedCoverageRatio:
        typeof plan.mobilizedCoverageRatio === "number" ? plan.mobilizedCoverageRatio : undefined,
      lane: plan.lane,
      dispatchMode: plan.dispatchMode,
      supportCount: (plan.assignments ?? []).filter((assignment) => assignment.mode === "support")
        .length,
      reviveCount: Array.isArray(plan.reviveSessionKeys) ? plan.reviveSessionKeys.length : 0,
      deferredCount: Array.isArray(plan.deferredAgentIds) ? plan.deferredAgentIds.length : 0,
      updatedAt: plan.updatedAt,
    }));

  const coordinationQueue = [...dispatchPlans]
    .flatMap((plan) =>
      (Array.isArray(plan.assignments) ? plan.assignments : []).map((assignment) => ({
        primaryAgentId: plan.primaryAgentId,
        primarySessionKey: plan.primarySessionKey,
        intensity: plan.intensity,
        updatedAt: plan.updatedAt,
        agentId: typeof assignment.agentId === "string" ? assignment.agentId : "",
        sessionKey: typeof assignment.sessionKey === "string" ? assignment.sessionKey : "",
        mode:
          assignment.mode === "primary" || assignment.mode === "support" || assignment.mode === "revive"
            ? assignment.mode
            : "support",
        action:
          assignment.action === "lead" ||
          assignment.action === "assist" ||
          assignment.action === "reactivate"
            ? assignment.action
            : "assist",
        ecologyState:
          assignment.ecologyState === "active" ||
          assignment.ecologyState === "stressed" ||
          assignment.ecologyState === "dormant" ||
          assignment.ecologyState === "extinct"
            ? assignment.ecologyState
            : "active",
        lane:
          assignment.lane === "workflow" || assignment.lane === "workflow-staggered"
            ? assignment.lane
            : plan.lane,
        dispatchMode:
          assignment.dispatchMode === "immediate" ||
          assignment.dispatchMode === "staggered" ||
          assignment.dispatchMode === "emergency"
            ? assignment.dispatchMode
            : plan.dispatchMode,
        delayMs: typeof assignment.delayMs === "number" ? assignment.delayMs : 0,
        priorityBias: typeof assignment.priorityBias === "number" ? assignment.priorityBias : 0,
        queued: assignment.queued === true,
      })),
    )
    .filter((entry) => entry.agentId && entry.sessionKey)
    .sort((left, right) => {
      const leftScore =
        left.priorityBias + (left.action === "lead" ? 3 : left.action === "reactivate" ? 2 : 1);
      const rightScore =
        right.priorityBias + (right.action === "lead" ? 3 : right.action === "reactivate" ? 2 : 1);
      return (
        rightScore - leftScore ||
        right.updatedAt - left.updatedAt ||
        left.delayMs - right.delayMs
      );
    })
    .slice(0, 32);

  const coordinationBatches = [...dispatchPlans]
    .sort((left, right) => right.updatedAt - left.updatedAt || right.intensity - left.intensity)
    .slice(0, 12)
    .map((plan) => {
      const assignments = (Array.isArray(plan.assignments) ? plan.assignments : [])
        .map((assignment) => ({
          agentId: typeof assignment.agentId === "string" ? assignment.agentId : "",
          sessionKey: typeof assignment.sessionKey === "string" ? assignment.sessionKey : "",
          action:
            assignment.action === "lead" ||
            assignment.action === "assist" ||
            assignment.action === "reactivate"
              ? assignment.action
              : "assist",
          priorityBias: typeof assignment.priorityBias === "number" ? assignment.priorityBias : 0,
          delayMs: typeof assignment.delayMs === "number" ? assignment.delayMs : 0,
        }))
        .filter((assignment) => assignment.agentId && assignment.sessionKey);
      const lead = assignments.find((assignment) => assignment.action === "lead") ?? null;
      const support = assignments.filter((assignment) => assignment.action === "assist");
      const revive = assignments.filter((assignment) => assignment.action === "reactivate");
      const recommendedAction = resolveGenesisRecommendedAction(plan);
      return {
        primaryAgentId: plan.primaryAgentId,
        primarySessionKey: plan.primarySessionKey,
        intensity: plan.intensity,
        lane: plan.lane,
        dispatchMode: plan.dispatchMode,
        updatedAt: plan.updatedAt,
        lead: lead
          ? {
              agentId: lead.agentId,
              sessionKey: lead.sessionKey,
              priorityBias: lead.priorityBias,
            }
          : null,
        support: support.map((assignment) => ({
          agentId: assignment.agentId,
          sessionKey: assignment.sessionKey,
          priorityBias: assignment.priorityBias,
          delayMs: assignment.delayMs,
        })),
        revive: revive.map((assignment) => ({
          agentId: assignment.agentId,
          sessionKey: assignment.sessionKey,
          priorityBias: assignment.priorityBias,
          delayMs: assignment.delayMs,
        })),
        deferredCount: Array.isArray(plan.deferredAgentIds) ? plan.deferredAgentIds.length : 0,
        recommendedAction,
      };
    });

  const mobilizedAgentCount = new Set(coordinationQueue.map((entry) => entry.agentId)).size;
  const leadAssignmentCount = coordinationQueue.filter((entry) => entry.action === "lead").length;
  const supportAssignmentCount = coordinationQueue.filter(
    (entry) => entry.action === "assist",
  ).length;
  const reviveAssignmentCount = coordinationQueue.filter(
    (entry) => entry.action === "reactivate",
  ).length;
  const productiveEntries = coordinationQueue.filter((entry) =>
    isProductiveLineage(lineageById.get(entry.agentId)),
  );
  const productiveMobilizedLineageCount = new Set(productiveEntries.map((entry) => entry.agentId)).size;
  const productiveLeadLineageCount = new Set(
    productiveEntries.filter((entry) => entry.action === "lead").map((entry) => entry.agentId),
  ).size;
  const productiveSupportLineageCount = new Set(
    productiveEntries.filter((entry) => entry.action === "assist").map((entry) => entry.agentId),
  ).size;
  const productiveReviveLineageCount = new Set(
    productiveEntries
      .filter((entry) => entry.action === "reactivate")
      .map((entry) => entry.agentId),
  ).size;
  const leadYieldScore = [...new Set(
    productiveEntries.filter((entry) => entry.action === "lead").map((entry) => entry.agentId),
  )].reduce((total, agentId) => {
    const lineage = lineageById.get(agentId);
    return total + (lineage?.publicValue ?? 0) + (lineage?.survivalCredit ?? 0);
  }, 0);
  const supportYieldScore = [...new Set(
    productiveEntries.filter((entry) => entry.action === "assist").map((entry) => entry.agentId),
  )].reduce((total, agentId) => {
    const lineage = lineageById.get(agentId);
    return total + (lineage?.publicValue ?? 0) + (lineage?.survivalCredit ?? 0);
  }, 0);
  const reviveYieldScore = [...new Set(
    productiveEntries.filter((entry) => entry.action === "reactivate").map((entry) => entry.agentId),
  )].reduce((total, agentId) => {
    const lineage = lineageById.get(agentId);
    return total + (lineage?.publicValue ?? 0) + (lineage?.survivalCredit ?? 0);
  }, 0);
  const queuedAssignmentCount = coordinationQueue.filter((entry) => entry.queued).length;
  const activePlanCount = activePlans.length;
  const collaborativePlanCount = activePlans.filter(
    (plan) => plan.supportCount > 0 || plan.reviveCount > 0,
  ).length;
  const emergencyPlanCount = activePlans.filter(
    (plan) => plan.dispatchMode === "emergency",
  ).length;
  const forcedCollaborationPlanCount = activePlans.filter((plan) => plan.forcedCollaboration).length;
  const highCoveragePlanCount = activePlans.filter(
    (plan) => (plan.mobilizedCoverageRatio ?? 0) >= 0.8,
  ).length;
  const averageAssignmentsPerPlan =
    activePlanCount > 0 ? coordinationQueue.length / activePlanCount : 0;
  const averageMobilizedCoverageRatio =
    activePlanCount > 0
      ? activePlans.reduce((total, plan) => total + (plan.mobilizedCoverageRatio ?? 0), 0) /
        activePlanCount
      : 0;
  const averageTargetCoverageRatio =
    activePlanCount > 0
      ? activePlans.reduce((total, plan) => total + (plan.targetCoverageRatio ?? 0), 0) /
        activePlanCount
      : 0;
  const coordinationScore =
    leadAssignmentCount * 2 +
    supportAssignmentCount * 1.5 +
    reviveAssignmentCount * 2.5 +
    mobilizedAgentCount +
    emergencyPlanCount * 0.5;
  const collaborationEffectScore =
    coordinationScore +
    productiveMobilizedLineageCount * 1.5 +
    productiveLeadLineageCount * 1.5 +
    productiveSupportLineageCount +
    productiveReviveLineageCount * 1.25;
  const productiveAssignmentCoverageRatio =
    coordinationQueue.length > 0 ? productiveEntries.length / coordinationQueue.length : 0;

  return {
    activeDispatchCount: dispatchPlans.length,
    reviveDispatchCount: dispatchPlans.reduce(
      (total, plan) =>
        total + (Array.isArray(plan.reviveSessionKeys) ? plan.reviveSessionKeys.length : 0),
      0,
    ),
    activePlans,
    coordinationQueue,
    coordinationBatches,
    collaborationSummary: {
      activePlanCount,
      collaborativePlanCount,
      emergencyPlanCount,
      forcedCollaborationPlanCount,
      highCoveragePlanCount,
      mobilizedAgentCount,
      averageMobilizedCoverageRatio,
      averageTargetCoverageRatio,
      leadAssignmentCount,
      supportAssignmentCount,
      reviveAssignmentCount,
      productiveMobilizedLineageCount,
      productiveLeadLineageCount,
      productiveSupportLineageCount,
      productiveReviveLineageCount,
      productiveAssignmentCoverageRatio,
      leadYieldScore,
      supportYieldScore,
      reviveYieldScore,
      queuedAssignmentCount,
      averageAssignmentsPerPlan,
      coordinationScore,
      collaborationEffectScore,
    },
  };
}

export function readGenesisDispatchSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisDispatchSummary {
  const dispatchPlans = readJsonDirSync<GenesisDispatchPlanRecord>(
    path.join(resolveGenesisStateDir(env), "dispatch-plans"),
  );
  const lineages = readJsonDirSync<GenesisLineageRecord>(
    path.join(resolveGenesisStateDir(env), "lineages"),
  );
  return buildGenesisDispatchSummary(dispatchPlans, lineages);
}

export function readGenesisDispatchSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisDispatchSummary | null {
  const snapshot = readJsonFileSync<GenesisDispatchSummary>(resolveGenesisDispatchSummaryPath(env));
  if (!snapshot) {
    return null;
  }
  return {
    ...DEFAULT_GENESIS_DISPATCH_SUMMARY,
    ...snapshot,
    collaborationSummary: {
      ...DEFAULT_GENESIS_DISPATCH_SUMMARY.collaborationSummary,
      ...(snapshot.collaborationSummary ?? {}),
    },
    activePlans: Array.isArray(snapshot.activePlans) ? snapshot.activePlans : [],
    coordinationQueue: Array.isArray(snapshot.coordinationQueue) ? snapshot.coordinationQueue : [],
    coordinationBatches: Array.isArray(snapshot.coordinationBatches)
      ? snapshot.coordinationBatches
      : [],
  };
}

export function writeGenesisDispatchSummarySnapshotSync(
  summary: GenesisDispatchSummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisDispatchSummaryPath(env);
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

export function refreshGenesisDispatchSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisDispatchSummary {
  const summary = readGenesisDispatchSummarySync(env);
  writeGenesisDispatchSummarySnapshotSync(summary, env);
  return summary;
}

export function readGenesisSocietyPlanDetailFromPlan(
  plan: GenesisDispatchPlanRecord,
): GenesisSocietyPlanDetail {
  const assignments = (Array.isArray(plan.assignments) ? plan.assignments : [])
    .map((assignment) => ({
      agentId: typeof assignment.agentId === "string" ? assignment.agentId : "",
      sessionKey: typeof assignment.sessionKey === "string" ? assignment.sessionKey : "",
      mode:
        assignment.mode === "primary" || assignment.mode === "support" || assignment.mode === "revive"
          ? assignment.mode
          : "support",
      action:
        assignment.action === "lead" ||
        assignment.action === "assist" ||
        assignment.action === "reactivate"
          ? assignment.action
          : "assist",
      ecologyState:
        assignment.ecologyState === "active" ||
        assignment.ecologyState === "stressed" ||
        assignment.ecologyState === "dormant" ||
        assignment.ecologyState === "extinct"
          ? assignment.ecologyState
          : "active",
      lane:
        assignment.lane === "workflow" || assignment.lane === "workflow-staggered"
          ? assignment.lane
          : plan.lane,
      dispatchMode:
        assignment.dispatchMode === "immediate" ||
        assignment.dispatchMode === "staggered" ||
        assignment.dispatchMode === "emergency"
          ? assignment.dispatchMode
          : plan.dispatchMode,
      delayMs: typeof assignment.delayMs === "number" ? assignment.delayMs : 0,
      priorityBias: typeof assignment.priorityBias === "number" ? assignment.priorityBias : 0,
      queued: assignment.queued === true,
    }))
    .filter((assignment) => assignment.agentId && assignment.sessionKey);
  const lead = assignments.find((assignment) => assignment.action === "lead") ?? null;
  const support = assignments.filter((assignment) => assignment.action === "assist");
  const revive = assignments.filter((assignment) => assignment.action === "reactivate");
  const executionPhases = [
    {
      phase: "reactivate" as const,
      reason: "reactivate_lineages" as const,
      sessions: revive
        .toSorted(
          (left, right) =>
            right.priorityBias - left.priorityBias || left.delayMs - right.delayMs,
        )
        .map((assignment) => ({
          agentId: assignment.agentId,
          sessionKey: assignment.sessionKey,
          action: assignment.action,
          priorityBias: assignment.priorityBias,
          delayMs: assignment.delayMs,
          queued: assignment.queued,
        })),
    },
    {
      phase: "lead" as const,
      reason: "execute_primary" as const,
      sessions: lead
        ? [
            {
              agentId: lead.agentId,
              sessionKey: lead.sessionKey,
              action: lead.action,
              priorityBias: lead.priorityBias,
              delayMs: lead.delayMs,
              queued: lead.queued,
            },
          ]
        : [],
    },
    {
      phase: "support" as const,
      reason: "fanout_support" as const,
      sessions: support
        .toSorted(
          (left, right) =>
            right.priorityBias - left.priorityBias || left.delayMs - right.delayMs,
        )
        .map((assignment) => ({
          agentId: assignment.agentId,
          sessionKey: assignment.sessionKey,
          action: assignment.action,
          priorityBias: assignment.priorityBias,
          delayMs: assignment.delayMs,
          queued: assignment.queued,
        })),
    },
  ]
    .filter((phase) => phase.sessions.length > 0)
    .map((phase) => ({
      ...phase,
      count: phase.sessions.length,
    }));

  return {
    primaryAgentId: plan.primaryAgentId,
    primarySessionKey: plan.primarySessionKey,
    intensity: plan.intensity,
    climateKind: typeof plan.climateKind === "string" ? plan.climateKind : undefined,
    forcedCollaboration: plan.forcedCollaboration === true,
    availableAgentCount:
      typeof plan.availableAgentCount === "number" ? plan.availableAgentCount : undefined,
    targetCoverageRatio:
      typeof plan.targetCoverageRatio === "number" ? plan.targetCoverageRatio : undefined,
    mobilizedCoverageRatio:
      typeof plan.mobilizedCoverageRatio === "number" ? plan.mobilizedCoverageRatio : undefined,
    lane: plan.lane,
    dispatchMode: plan.dispatchMode,
    updatedAt: plan.updatedAt,
    supportCount: support.length,
    reviveCount: Array.isArray(plan.reviveSessionKeys) ? plan.reviveSessionKeys.length : revive.length,
    deferredCount: Array.isArray(plan.deferredAgentIds) ? plan.deferredAgentIds.length : 0,
    recommendedAction: resolveGenesisRecommendedAction(plan),
    reviveSessionKeys: Array.isArray(plan.reviveSessionKeys) ? plan.reviveSessionKeys : [],
    deferredAgentIds: Array.isArray(plan.deferredAgentIds) ? plan.deferredAgentIds : [],
    lead: lead
      ? {
          agentId: lead.agentId,
          sessionKey: lead.sessionKey,
          priorityBias: lead.priorityBias,
        }
      : null,
    support: support.map((assignment) => ({
      agentId: assignment.agentId,
      sessionKey: assignment.sessionKey,
      priorityBias: assignment.priorityBias,
      delayMs: assignment.delayMs,
    })),
    revive: revive.map((assignment) => ({
      agentId: assignment.agentId,
      sessionKey: assignment.sessionKey,
      priorityBias: assignment.priorityBias,
      delayMs: assignment.delayMs,
    })),
    assignments,
    executionPhases,
  };
}

export function readGenesisSocietyPlanDetailSync(
  primarySessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietyPlanDetail | null {
  const plan = readJsonFileSync<GenesisDispatchPlanRecord>(
    resolveGenesisDispatchPlanPath(primarySessionKey, env),
  );
  if (!plan) {
    return null;
  }
  return readGenesisSocietyPlanDetailFromPlan(plan);
}
