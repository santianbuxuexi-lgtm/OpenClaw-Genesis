import fs from "node:fs/promises";
import path from "node:path";
import { loadSessionEntry } from "../../gateway/session-utils.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import {
  resolveGenesisDispatchAssignmentPath,
  resolveGenesisDispatchPlanPath,
  resolveGenesisEcologyState,
  resolveGenesisLedgerPath,
  resolveGenesisLineageRecordPath,
  resolveGenesisRunCompletionsPath,
  resolveGenesisSessionRecordPath,
  readGenesisDispatchAssignmentSync,
  resolveGenesisSkillEvolutionLogPath,
  resolveGenesisStateDir,
  resolveGenesisWorldStatePath,
  type GenesisEcologyState,
  type GenesisLineageRecord,
  type GenesisWorldState,
} from "./state.js";
import type { GenesisSocietyDispatchPlan } from "./workflow.js";
import {
  activateGenesisTriggersForEventSync,
  readGenesisLineageFocusItemsSync,
  readGenesisLineageTriggersSync,
  writeGenesisLineageFocusItemsSync,
  writeGenesisLineageTriggersSync,
  type GenesisLineageFocusItem,
  type GenesisLineageTriggerItem,
} from "./focus.js";
import {
  DEFAULT_GENESIS_EVENT_LOG_SUMMARY,
  reduceGenesisEventLogSummary,
  readGenesisEventLogSummarySnapshotSync,
  writeGenesisEventLogSummarySnapshotSync,
  type GenesisEventLogSummary,
} from "./event-log.js";
import { refreshGenesisDispatchSummarySnapshotSync } from "./dispatch-summary.js";
import { refreshGenesisLineageSummarySnapshotSync } from "./lineage-summary.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import {
  buildGenesisSkillEvolutionEvent,
  DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY,
  readGenesisSkillEvolutionSummarySnapshotSync,
  reduceGenesisSkillEvolutionSummary,
  writeGenesisSkillEvolutionSummarySnapshotSync,
} from "./skill-evolution.js";
import { readGenesisSocietySummarySync } from "./society-query.js";
import { runGenesisMetaClawIdleOptimizationSync } from "./meta-claw.js";
import {
  appendGenesisTrajectoryEntrySync,
  buildGenesisTrajectoryEntry,
  readGenesisTrajectorySummarySnapshotSync,
} from "./trajectory-log.js";
import {
  appendGenesisUserIntentHistoryEntrySync,
  refreshGenesisUserIntentSummarySnapshotSync,
} from "./user-intent.js";
import {
  appendGenesisProactiveWorkEntrySync,
  buildGenesisProactiveWorkTask,
  ensureGenesisDailyLearningEntriesSync,
  ensureGenesisExternalExecutionEntriesSync,
  ensureGenesisSkillCapabilityEntriesSync,
  refreshGenesisProactiveWorkSummarySnapshotSync,
  syncGenesisProactiveWorkOutcomesSync,
} from "./proactive-work.js";
import { resolveFounderPreviewForSession } from "./founder-result-digest.js";
import { readGenesisSkillCapabilitySummarySync } from "./skill-capability.js";
import { reconcileGenesisLoginStatePoolSync } from "./login-state-pool.js";

export type GenesisEnvironmentEvent = {
  trigger: "cron" | "heartbeat" | "workflow";
  summary: string;
  intensity: number;
  sourceRef?: string;
};

export type GenesisRunCompletion = {
  sessionKey: string;
  reason?: string;
  ts: number;
  runId?: string;
  source?: "session_lifecycle" | "agent_run";
};

export type GenesisWorkflowDispatchRecord = GenesisSocietyDispatchPlan & {
  runId?: string;
  requestSummary?: string;
  updatedAt: number;
};

type GenesisLedgerEntry =
  | {
      kind: "environment_event";
      ts: number;
      payload: GenesisEnvironmentEvent;
    }
  | {
      kind: "run_completion";
      ts: number;
      payload: GenesisRunCompletion;
    }
  | {
      kind: "workflow_dispatch";
      ts: number;
      payload: GenesisWorkflowDispatchRecord;
    };

const KNOWN_FOUNDER_AGENT_IDS = new Set([
  "scout",
  "builder",
  "creator",
  "auditor",
  "negotiator",
]);

const FOUNDER_WORKFLOW_SIGNALS: Record<string, { domain: string; keywords: string[] }> = {
  scout: {
    domain: "search",
    keywords: ["search", "signal", "source", "monitor", "research"],
  },
  builder: {
    domain: "workflow",
    keywords: ["workflow", "tool", "automation", "capability", "build"],
  },
  creator: {
    domain: "scenario_generation",
    keywords: ["scenario", "idea", "design", "strategy", "novel"],
  },
  auditor: {
    domain: "audit",
    keywords: ["audit", "risk", "recovery", "failure", "regression"],
  },
  negotiator: {
    domain: "coordination",
    keywords: ["coordination", "align", "resource", "consensus", "recovery"],
  },
};

type GenesisSessionRecord = {
  sessionKey: string;
  completionCount: number;
  lastCompletionTs: number;
  lastReason?: string;
  updatedAt: number;
};

type GenesisWorkflowReplicationCandidate = {
  lineageId: string;
  latestSessionKey: string;
  specialtyOrigin?: string;
  runtimeProfile?: "observe" | "lab";
  completionCount: number;
  publicValue: number;
  survivalCredit: number;
  expansionCredit: number;
  ecologyState: GenesisEcologyState;
  superpowerSeedEligible: boolean;
  privilegeInheritanceReason?: string;
};

type GenesisWorkflowSeedParent = {
  lineageId: string;
  latestSessionKey: string;
  specialtyOrigin?: string;
  runtimeProfile?: "observe" | "lab";
  completionCount: number;
  superpowerInherited?: boolean;
  privilegeInheritanceReason?: string;
  chainDepth: number;
  chainBonus: number;
};

function refreshGenesisRuntimeSnapshotsSync(env: NodeJS.ProcessEnv = process.env): void {
  refreshGenesisDispatchSummarySnapshotSync(env);
  refreshGenesisLineageSummarySnapshotSync(env);
  const intentSummary = refreshGenesisUserIntentSummarySnapshotSync(env);
  const skillSummary = readGenesisSkillCapabilitySummarySync(env);
  const loginSummary = reconcileGenesisLoginStatePoolSync(env);
  ensureGenesisDailyLearningEntriesSync({ env, intentSummary, ts: Date.now() });
  ensureGenesisSkillCapabilityEntriesSync({ env, skillSummary, ts: Date.now() });
  ensureGenesisExternalExecutionEntriesSync({
    env,
    ts: Date.now(),
    intentSummary,
    skillSummary,
    loginSummary,
  });
  syncGenesisProactiveWorkOutcomesSync({ env, ts: Date.now() });
  refreshGenesisProactiveWorkSummarySnapshotSync(env);
}

function resolveDispatchParticipationCreditDelta(params: {
  action: "lead" | "assist" | "reactivate";
  climateKind?: string;
  intensity: number;
}): Pick<
  GenesisLineageRecord,
  "publicValue" | "privateValue" | "survivalCredit" | "expansionCredit"
> {
  const intensity = Math.max(0.5, Math.min(2, params.intensity || 1));
  const climateBoost =
    params.climateKind === "search" ||
    params.climateKind === "query" ||
    params.climateKind === "consultation"
      ? 1.1
      : 1;
  const scale = intensity * climateBoost;
  switch (params.action) {
    case "lead":
      return {
        publicValue: 0.45 * scale,
        privateValue: 0.15 * scale,
        survivalCredit: 0.3 * scale,
        expansionCredit: 0.4 * scale,
      };
    case "reactivate":
      return {
        publicValue: 0.3 * scale,
        privateValue: 0.12 * scale,
        survivalCredit: 0.4 * scale,
        expansionCredit: 0.15 * scale,
      };
    default:
      return {
        publicValue: 0.25 * scale,
        privateValue: 0.1 * scale,
        survivalCredit: 0.2 * scale,
        expansionCredit: 0.2 * scale,
      };
  }
}

function resolveFounderFallbackOrigin(agentId: string | undefined): string | undefined {
  const normalized = agentId?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return KNOWN_FOUNDER_AGENT_IDS.has(normalized) ? normalized : undefined;
}

function resolveDispatchLineageIdentity(params: {
  canonicalKey: string;
  agentId?: string;
  entry?: {
    genesisLineageId?: string;
    genesisSpecialtyOrigin?: string;
  };
  persistedLineage?: GenesisLineageRecord;
}): { lineageId: string; specialtyOrigin?: string } {
  const founderOrigin =
    params.entry?.genesisSpecialtyOrigin?.trim() ||
    params.persistedLineage?.specialtyOrigin?.trim() ||
    resolveFounderFallbackOrigin(params.agentId);
  return {
    lineageId:
      params.entry?.genesisLineageId?.trim() ||
      params.persistedLineage?.lineageId?.trim() ||
      founderOrigin ||
      params.canonicalKey,
    ...(founderOrigin ? { specialtyOrigin: founderOrigin } : {}),
  };
}

function resolveAssignedChildLineageForSession(params: {
  canonicalKey: string;
  agentId?: string;
  existingLineages: GenesisLineageRecord[];
  world?: GenesisWorldState | null;
}): GenesisLineageRecord | null {
  const founderOrigin = resolveFounderFallbackOrigin(params.agentId);
  if (!founderOrigin) {
    return null;
  }
  const childPrefix = `${params.canonicalKey}::child:`;
  const eligible = params.existingLineages
    .filter((record) => record.parentLineageId && record.latestSessionKey?.startsWith(childPrefix))
    .filter((record) => (record.specialtyOrigin ?? founderOrigin) === founderOrigin)
    .filter((record) => {
      const ecologyState = record.ecologyState ?? resolveGenesisEcologyState({ lineage: record, world: params.world });
      return ecologyState !== "dormant" && ecologyState !== "extinct";
    })
    .sort((left, right) => {
      const leftPriority =
        (left.completionCount ?? 0) * 10 +
        Math.max(0, (left.publicValue ?? 0) + (left.survivalCredit ?? 0) + (left.expansionCredit ?? 0));
      const rightPriority =
        (right.completionCount ?? 0) * 10 +
        Math.max(0, (right.publicValue ?? 0) + (right.survivalCredit ?? 0) + (right.expansionCredit ?? 0));
      return leftPriority - rightPriority || left.updatedAt - right.updatedAt;
    });
  return eligible[0] ?? null;
}

function resolveDispatchFocusSignals(params: {
  agentId?: string;
  specialtyOrigin?: string;
  action: "lead" | "assist" | "reactivate";
  climateKind?: string;
  intensity: number;
  ts: number;
}): {
  focusItem: GenesisLineageFocusItem;
  triggerItem: GenesisLineageTriggerItem;
} {
  const founderKey =
    params.specialtyOrigin?.trim().toLowerCase() ||
    params.agentId?.trim().toLowerCase() ||
    "main";
  const founderSignals = FOUNDER_WORKFLOW_SIGNALS[founderKey] ?? {
    domain: "coordination",
    keywords: ["workflow", "coordination", "response", "task"],
  };
  const climateKeyword = params.climateKind?.trim().toLowerCase();
  const roleKeyword =
    params.action === "lead" ? "lead" : params.action === "reactivate" ? "revive" : "support";
  const keywords = [
    ...new Set([
      ...founderSignals.keywords,
      roleKeyword,
      ...(climateKeyword ? [climateKeyword] : []),
    ]),
  ];
  const focusId = `dispatch:${founderKey}:${roleKeyword}:${climateKeyword ?? "workflow"}`;
  return {
    focusItem: {
      id: focusId,
      title: `${founderKey} ${roleKeyword} ${climateKeyword ?? "workflow"}`.trim(),
      domain: founderSignals.domain,
      intensity: Math.max(1, params.intensity),
      status: "active",
      triggerMode: climateKeyword === "search" ? "search" : "workflow",
      keywords,
      createdAt: params.ts,
      updatedAt: params.ts,
    },
    triggerItem: {
      id: `${focusId}:trigger`,
      focusId,
      title: `${founderKey} ${roleKeyword} activation`.trim(),
      status: "active",
      triggerMode: climateKeyword === "search" ? "search" : "workflow",
      threshold: Math.max(0.75, params.intensity * 0.9),
      lastTriggeredAt: params.ts,
      activationScore: Math.max(1, params.intensity * 1.25),
      createdAt: params.ts,
      updatedAt: params.ts,
    },
  };
}

function resolveFounderOriginForSession(params: {
  canonicalKey: string;
  entry?: {
    genesisSpecialtyOrigin?: string;
  };
}): string | undefined {
  const explicit = params.entry?.genesisSpecialtyOrigin?.trim().toLowerCase();
  if (explicit && KNOWN_FOUNDER_AGENT_IDS.has(explicit)) {
    return explicit;
  }
  return resolveFounderFallbackOrigin(parseAgentSessionKey(params.canonicalKey)?.agentId);
}

function appendGenesisWorkflowProactiveWork(params: {
  sessionKey: string;
  lineageId: string;
  founderOrigin?: string;
  agentId: string;
  action: "lead" | "assist" | "reactivate";
  climateKind?: string;
  workId: string;
  ts: number;
}): void {
  if (!params.founderOrigin || !KNOWN_FOUNDER_AGENT_IDS.has(params.founderOrigin)) {
    return;
  }
  const founderOrigin = params.founderOrigin as (typeof KNOWN_FOUNDER_AGENT_IDS extends Set<infer T> ? T : never);
  const proactiveTask =
    params.lineageId.includes("::workflow::") || params.lineageId.includes("::child:")
      ? buildGenesisChildWorkflowTask(founderOrigin)
      : buildGenesisProactiveWorkTask({
          founderOrigin,
          climateKind: params.climateKind,
          action: params.action,
        });
  appendGenesisProactiveWorkEntrySync({
    workId: params.workId,
    founderOrigin,
    agentId: params.agentId,
    lineageId: params.lineageId,
    sessionKey: params.sessionKey,
    action: params.action,
    climateKind: params.climateKind,
    workType: proactiveTask.workType,
    task: proactiveTask.task,
    status: "in_progress",
    source: "workflow_dispatch",
    ts: params.ts,
    updatedAt: params.ts,
  });
}

function buildGenesisChildWorkflowTask(
  founderOrigin: (typeof KNOWN_FOUNDER_AGENT_IDS extends Set<infer T> ? T : never),
): { workType: string; task: string } {
  switch (founderOrigin) {
    case "scout":
      return {
        workType: "intelligence",
        task: "只补 1 条关键热点来源或可执行信号，并给出可直接交付的线索摘要",
      };
    case "builder":
      return {
        workType: "tooling",
        task: "只补 1 个最小工具缺口或执行脚本，让当前链路往前推进一步",
      };
    case "creator":
      return {
        workType: "synthesis",
        task: "只完成 1 条可闭合的短评论或发布草稿，不展开成长方案",
      };
    case "auditor":
      return {
        workType: "audit",
        task: "只验证 1 个核心风险点，并明确给出通过或阻断结论",
      };
    case "negotiator":
      return {
        workType: "coordination",
        task: "只完成 1 次平台或责任分配决策，并明确下一步归属",
      };
  }
}

function appendGenesisCompletedProactiveWork(params: {
  sessionKey: string;
  lineageId: string;
  founderOrigin?: string;
  action: "lead" | "assist" | "reactivate";
  climateKind?: string;
  workId: string;
  ts: number;
}): void {
  if (!params.founderOrigin || !KNOWN_FOUNDER_AGENT_IDS.has(params.founderOrigin)) {
    return;
  }
  const founderOrigin = params.founderOrigin as (typeof KNOWN_FOUNDER_AGENT_IDS extends Set<infer T> ? T : never);
  const proactiveTask = buildGenesisProactiveWorkTask({
    founderOrigin,
    climateKind: params.climateKind,
    action: params.action,
  });
  appendGenesisProactiveWorkEntrySync({
    workId: params.workId,
    founderOrigin,
    agentId: founderOrigin,
    lineageId: params.lineageId,
    sessionKey: params.sessionKey,
    action: params.action,
    climateKind: params.climateKind,
    workType: proactiveTask.workType,
    task: proactiveTask.task,
    status: "completed",
    resultPreview: resolveFounderPreviewForSession(params.sessionKey) ?? undefined,
    source: "run_completion",
    ts: params.ts,
    updatedAt: params.ts,
  });
}

function upsertDispatchFocusForLineage(params: {
  lineageId: string;
  agentId?: string;
  specialtyOrigin?: string;
  action: "lead" | "assist" | "reactivate";
  climateKind?: string;
  intensity: number;
  ts: number;
  env: NodeJS.ProcessEnv;
}): void {
  const { focusItem, triggerItem } = resolveDispatchFocusSignals(params);
  const existingItems = readGenesisLineageFocusItemsSync(params.lineageId, params.env);
  const nextItems = [...existingItems];
  const existingItemIndex = nextItems.findIndex((item) => item.id === focusItem.id);
  if (existingItemIndex >= 0) {
    const previous = nextItems[existingItemIndex]!;
    nextItems[existingItemIndex] = {
      ...previous,
      title: focusItem.title,
      domain: focusItem.domain,
      intensity: Math.max(previous.intensity, focusItem.intensity),
      status: "active",
      triggerMode: focusItem.triggerMode,
      keywords: [...new Set([...(previous.keywords ?? []), ...(focusItem.keywords ?? [])])],
      updatedAt: params.ts,
    };
  } else {
    nextItems.push(focusItem);
  }
  writeGenesisLineageFocusItemsSync(params.lineageId, nextItems, params.env);

  const existingTriggers = readGenesisLineageTriggersSync(params.lineageId, params.env);
  const nextTriggers = [...existingTriggers];
  const existingTriggerIndex = nextTriggers.findIndex((item) => item.id === triggerItem.id);
  if (existingTriggerIndex >= 0) {
    const previous = nextTriggers[existingTriggerIndex]!;
    nextTriggers[existingTriggerIndex] = {
      ...previous,
      title: triggerItem.title,
      focusId: triggerItem.focusId,
      status: "active",
      triggerMode: triggerItem.triggerMode,
      threshold: Math.max(previous.threshold ?? 0, triggerItem.threshold ?? 0),
      lastTriggeredAt: params.ts,
      activationScore: Math.max(previous.activationScore ?? 0, triggerItem.activationScore ?? 0),
      updatedAt: params.ts,
    };
  } else {
    nextTriggers.push(triggerItem);
  }
  writeGenesisLineageTriggersSync(params.lineageId, nextTriggers, params.env);
}

async function readGenesisLineageDirectoryRecords(): Promise<GenesisLineageRecord[]> {
  const lineagesDir = path.join(resolveGenesisStateDir(), "lineages");
  let names: string[] = [];
  try {
    names = await fs.readdir(lineagesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const records: GenesisLineageRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const record = await readJsonFile<GenesisLineageRecord>(path.join(lineagesDir, name));
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function resolveLineageGenerationDepth(
  lineage: GenesisLineageRecord,
  recordsById: Map<string, GenesisLineageRecord>,
): number {
  let depth = 0;
  let current: GenesisLineageRecord | undefined = lineage;
  const visited = new Set<string>();
  while (current?.parentLineageId?.trim()) {
    const parentLineageId = current.parentLineageId.trim();
    if (visited.has(parentLineageId)) {
      break;
    }
    visited.add(parentLineageId);
    depth += 1;
    current = recordsById.get(parentLineageId);
  }
  return depth;
}

function resolveWorkflowReplicationSeedScore(
  candidate: GenesisWorkflowReplicationCandidate,
  payload: GenesisWorkflowDispatchRecord,
): number {
  const climateBoost =
    payload.climateKind === "search" || payload.climateKind === "query" || payload.climateKind === "consultation"
      ? 0.35
      : payload.climateKind === "command"
        ? 0.2
        : 0.1;
  const superpowerBoost = candidate.superpowerSeedEligible ? 0.25 : 0;
  return (
    Math.max(0, candidate.completionCount) * 0.65 +
    Math.max(0, candidate.publicValue) * 0.4 +
    Math.max(0, candidate.survivalCredit) * 0.35 +
    Math.max(0, candidate.expansionCredit) * 0.55 +
    payload.intensity * 0.5 +
    climateBoost +
    superpowerBoost
  );
}

function resolveWorkflowReplicationRecentChildCooldownMs(
  profile: ReturnType<typeof readGenesisExperimentProfileSync>,
  payload: GenesisWorkflowDispatchRecord,
): number {
  const baseCooldownMs = Math.max(60_000, profile.workflowReplicationRecentChildCooldownMs);
  if (payload.climateKind === "command") {
    return Math.max(60_000, Math.floor(baseCooldownMs * 0.35));
  }
  if (
    payload.climateKind === "search" ||
    payload.climateKind === "query" ||
    payload.climateKind === "consultation"
  ) {
    return Math.max(120_000, Math.floor(baseCooldownMs * 0.5));
  }
  return baseCooldownMs;
}

function resolveWorkflowReplicationSeedLimit(
  profile: ReturnType<typeof readGenesisExperimentProfileSync>,
  payload: GenesisWorkflowDispatchRecord,
): number {
  let limit = Math.max(1, profile.workflowReplicationSeedBaseCount);
  if (
    payload.climateKind === "search" ||
    payload.climateKind === "query" ||
    payload.climateKind === "consultation"
  ) {
    limit += Math.max(0, profile.workflowReplicationSeedSearchBonus);
  } else if (payload.climateKind === "command") {
    limit += Math.max(0, profile.workflowReplicationSeedCommandBonus);
  }
  if (payload.intensity >= profile.workflowReplicationSeedIntensityBonusThreshold) {
    limit += Math.max(0, profile.workflowReplicationSeedIntensityBonus);
  }
  return Math.max(1, limit);
}

async function seedWorkflowReplicationChild(params: {
  payload: GenesisWorkflowDispatchRecord;
  candidates: GenesisWorkflowReplicationCandidate[];
  world: GenesisWorldState | null;
}): Promise<void> {
  if (params.candidates.length === 0) {
    return;
  }
  const profile = readGenesisExperimentProfileSync(process.env);
  const existingLineages = await readGenesisLineageDirectoryRecords();
  const recentCutoffTs =
    params.payload.updatedAt - resolveWorkflowReplicationRecentChildCooldownMs(profile, params.payload);
  const recordsById = new Map(existingLineages.map((record) => [record.lineageId, record] as const));
  const lineageChildren = new Map<string, GenesisLineageRecord[]>();
  for (const record of existingLineages) {
    const parentLineageId = record.parentLineageId?.trim();
    if (!parentLineageId) {
      continue;
    }
    const siblings = lineageChildren.get(parentLineageId) ?? [];
    siblings.push(record);
    lineageChildren.set(parentLineageId, siblings);
  }
  const eligibleCandidates = params.candidates
    .map((candidate) => {
      if (candidate.ecologyState === "dormant" || candidate.ecologyState === "extinct") {
        return null;
      }
      const directRecentChildren = (lineageChildren.get(candidate.lineageId) ?? []).filter(
        (record) => record.updatedAt >= recentCutoffTs,
      );
      const healthyDescendants = directRecentChildren
        .filter((record) => {
          const ecologyState = record.ecologyState ?? resolveGenesisEcologyState({
            lineage: record,
            world: params.world,
          });
          return ecologyState !== "dormant" && ecologyState !== "extinct";
        })
        .sort((left, right) => {
          const leftDepth = resolveLineageGenerationDepth(left, recordsById);
          const rightDepth = resolveLineageGenerationDepth(right, recordsById);
          const leftScore =
            left.publicValue + left.survivalCredit + left.expansionCredit + leftDepth * 0.25;
          const rightScore =
            right.publicValue + right.survivalCredit + right.expansionCredit + rightDepth * 0.25;
          return rightScore - leftScore || right.updatedAt - left.updatedAt;
        });
      const branchParent = healthyDescendants
        .filter((record) => (record.completionCount ?? 0) > 0)
        .find((record) => {
          return !existingLineages.some(
            (candidateChild) =>
              candidateChild.parentLineageId === record.lineageId &&
              candidateChild.updatedAt >= recentCutoffTs,
          );
        });
      if (!branchParent && candidate.completionCount <= 0) {
        return null;
      }
      const seedParent: GenesisWorkflowSeedParent = branchParent
        ? {
            lineageId: branchParent.lineageId,
            latestSessionKey: branchParent.latestSessionKey,
            specialtyOrigin: branchParent.specialtyOrigin ?? candidate.specialtyOrigin,
            runtimeProfile: branchParent.runtimeProfile ?? candidate.runtimeProfile,
            completionCount: branchParent.completionCount ?? 0,
            ...(branchParent.superpowerInherited !== undefined
              ? { superpowerInherited: branchParent.superpowerInherited }
              : {}),
            ...(branchParent.privilegeInheritanceReason
              ? { privilegeInheritanceReason: branchParent.privilegeInheritanceReason }
              : candidate.privilegeInheritanceReason
                ? { privilegeInheritanceReason: candidate.privilegeInheritanceReason }
                : {}),
            chainDepth: resolveLineageGenerationDepth(branchParent, recordsById),
            chainBonus:
              1.15 +
              resolveLineageGenerationDepth(branchParent, recordsById) * 0.4 +
              Math.max(0, branchParent.publicValue + branchParent.survivalCredit) * 0.08 +
              Math.max(0, branchParent.completionCount ?? 0) * 0.2,
          }
        : {
            lineageId: candidate.lineageId,
            latestSessionKey: candidate.latestSessionKey,
            specialtyOrigin: candidate.specialtyOrigin,
            runtimeProfile: candidate.runtimeProfile,
            privilegeInheritanceReason: candidate.privilegeInheritanceReason,
            completionCount: candidate.completionCount,
            chainDepth: 0,
            chainBonus: 0,
          };
      const alreadyHasRecentChild = existingLineages.some(
        (record) =>
          record.parentLineageId === seedParent.lineageId &&
          record.updatedAt >= recentCutoffTs,
      );
      if (alreadyHasRecentChild) {
        return null;
      }
      return {
        ...candidate,
        seedParent,
      };
    })
    .filter((candidate): candidate is GenesisWorkflowReplicationCandidate & { seedParent: GenesisWorkflowSeedParent } =>
      Boolean(candidate),
    );
  if (eligibleCandidates.length === 0) {
    return;
  }
  const selectedCandidates = [...eligibleCandidates].sort(
    (left, right) =>
      (resolveWorkflowReplicationSeedScore(right, params.payload) + right.seedParent.chainBonus) -
        (resolveWorkflowReplicationSeedScore(left, params.payload) + left.seedParent.chainBonus) ||
      right.lineageId.localeCompare(left.lineageId),
  );
  const selectedSeeds = selectedCandidates.slice(
    0,
    Math.min(selectedCandidates.length, resolveWorkflowReplicationSeedLimit(profile, params.payload)),
  );
  if (selectedSeeds.length === 0) {
    return;
  }
  const currentPressure = Math.max(0, params.world?.currentPressure ?? 0);
  const workflowPressureIntensity = Math.max(
    0,
    currentPressure - profile.stressedSpawnZeroQuotaThreshold + 0.25,
  );
  for (const [index, selected] of selectedSeeds.entries()) {
    const chainPressureIntensity =
      selected.seedParent.chainDepth >= 1 ? workflowPressureIntensity : workflowPressureIntensity * 0.6;
    const pressureOutputBonus =
      chainPressureIntensity * profile.secondGenerationPressureOutputWeight;
    const pressureSurvivalBonus =
      chainPressureIntensity * profile.secondGenerationPressureSurvivalWeight;
    const pressureExpansionBonus =
      chainPressureIntensity * profile.secondGenerationPressureExpansionWeight;
    const inheritanceMode =
      (selected.superpowerSeedEligible ||
        selected.seedParent.superpowerInherited ||
        selected.seedParent.chainDepth >= 1) &&
      params.payload.intensity >= 0.7
        ? "hybrid"
        : "specialty";
    const childLineageId =
      `${selected.seedParent.lineageId}::workflow::${params.payload.runId ?? params.payload.updatedAt}:${index}`;
    const childRecord: GenesisLineageRecord = {
      lineageId: childLineageId,
      parentLineageId: selected.seedParent.lineageId,
      inheritanceMode,
      specialtyOrigin: selected.seedParent.specialtyOrigin ?? selected.specialtyOrigin ?? selected.lineageId,
      ...(inheritanceMode === "hybrid" ? { superpowerInherited: true } : {}),
      ...(inheritanceMode === "hybrid"
        ? {
            privilegeInheritanceReason:
              selected.seedParent.privilegeInheritanceReason ??
              selected.privilegeInheritanceReason ??
              "genesis_live_workflow_inheritance",
          }
        : {}),
      ...(selected.seedParent.runtimeProfile
        ? { runtimeProfile: selected.seedParent.runtimeProfile }
        : selected.runtimeProfile
          ? { runtimeProfile: selected.runtimeProfile }
          : {}),
      latestSessionKey: `${selected.seedParent.latestSessionKey}::child:${index}`,
      completionCount: 0,
      lastCompletionTs: params.payload.updatedAt,
      lastReason: "workflow_seed",
      accumulatedPrivilegeTax: inheritanceMode === "hybrid" ? 0.2 : 0,
      publicValue:
        0.08 +
        selected.publicValue * 0.12 +
        selected.seedParent.chainDepth * 0.02 +
        pressureOutputBonus,
      privateValue: 0.03 + selected.survivalCredit * 0.04 + pressureOutputBonus * 0.35,
      survivalCredit:
        0.08 +
        selected.survivalCredit * 0.18 +
        selected.seedParent.chainDepth * 0.015 +
        pressureSurvivalBonus,
      expansionCredit:
        0.05 +
        selected.expansionCredit * 0.15 +
        selected.seedParent.chainDepth * 0.025 +
        pressureExpansionBonus,
      updatedAt: params.payload.updatedAt,
    };
    childRecord.ecologyState = resolveGenesisEcologyState({
      lineage: childRecord,
      world: params.world,
    });
    await writeJsonFile(resolveGenesisLineageRecordPath(childLineageId), childRecord);
    if (chainPressureIntensity > 0) {
      const secondGenerationIntensity =
        params.payload.intensity +
        chainPressureIntensity * profile.secondGenerationPressureFocusIntensityBonus;
      const founderAgentId =
        selected.seedParent.specialtyOrigin ??
        selected.specialtyOrigin ??
        selected.lineageId.split("::")[0] ??
        selected.lineageId;
      upsertDispatchFocusForLineage({
        lineageId: childLineageId,
        agentId: founderAgentId,
        specialtyOrigin: selected.seedParent.specialtyOrigin ?? selected.specialtyOrigin,
        action: "assist",
        climateKind: params.payload.climateKind,
        intensity: secondGenerationIntensity,
        ts: params.payload.updatedAt,
        env: process.env,
      });
      const seededTriggers = readGenesisLineageTriggersSync(childLineageId, process.env).map((item) => ({
        ...item,
        activationScore:
          (item.activationScore ?? 0) + profile.secondGenerationPressureTriggerActivationBonus,
        updatedAt: params.payload.updatedAt,
        lastTriggeredAt: params.payload.updatedAt,
      }));
      if (seededTriggers.length > 0) {
        writeGenesisLineageTriggersSync(childLineageId, seededTriggers, process.env);
      }
    }
  }
}

let genesisWriteQueue: Promise<void> = Promise.resolve();

function isIgnorableGenesisWriteError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  try {
    await ensureParentDir(filePath);
    await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
  } catch (error) {
    if (isIgnorableGenesisWriteError(error)) {
      return;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  try {
    await ensureParentDir(filePath);
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  } catch (error) {
    if (isIgnorableGenesisWriteError(error)) {
      return;
    }
    throw error;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function appendLedgerEntry(entry: GenesisLedgerEntry): Promise<void> {
  await appendJsonLine(resolveGenesisLedgerPath(), entry);
  updateGenesisEventLogSummarySnapshot(entry);
}

async function appendGenesisSkillEvolutionEvent(
  event: ReturnType<typeof buildGenesisSkillEvolutionEvent>,
): Promise<void> {
  if (!event) {
    return;
  }
  await appendJsonLine(resolveGenesisSkillEvolutionLogPath(), event);
  const previous =
    readGenesisSkillEvolutionSummarySnapshotSync(process.env) ?? {
      ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY,
      modeCounts: { ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY.modeCounts },
      topLineages: [],
    };
  const next = reduceGenesisSkillEvolutionSummary(previous, event);
  writeGenesisSkillEvolutionSummarySnapshotSync(next, process.env);
}

function updateGenesisEventLogSummarySnapshot(entry: GenesisLedgerEntry): void {
  const previous =
    readGenesisEventLogSummarySnapshotSync(process.env) ?? {
      ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY,
      recentEnvironmentTriggers: { ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY.recentEnvironmentTriggers },
    };
  const next: GenesisEventLogSummary = reduceGenesisEventLogSummary(previous, entry);
  writeGenesisEventLogSummarySnapshotSync(next, process.env);
}

function enqueueGenesisWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = genesisWriteQueue.then(task, task);
  genesisWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function resolveCompletionCreditDelta(reason?: string): Pick<
  GenesisLineageRecord,
  "publicValue" | "privateValue" | "survivalCredit" | "expansionCredit"
> {
  const normalized = reason?.trim().toLowerCase();
  switch (normalized) {
    case "complete":
    case "done":
    case "finished":
    case "end":
      return {
        publicValue: 2,
        privateValue: 0.5,
        survivalCredit: 1.5,
        expansionCredit: 0.75,
      };
    case "create":
      return {
        publicValue: 0.5,
        privateValue: 0,
        survivalCredit: 1,
        expansionCredit: 0.25,
      };
    case "heartbeat":
      return {
        publicValue: 0,
        privateValue: 0.25,
        survivalCredit: 0.5,
        expansionCredit: 0,
      };
    default:
      return {
        publicValue: 0.25,
        privateValue: 0,
        survivalCredit: 0.25,
        expansionCredit: 0,
      };
  }
}

function resolveStormMomentum(params: {
  previous?: GenesisWorldState | null;
  intensityDelta: number;
  carryover: number;
}): number {
  const previousMomentum = params.previous?.stormMomentum ?? 0;
  const nextMomentum = previousMomentum * params.carryover + Math.max(0, params.intensityDelta);
  return Math.max(0, Math.min(4, nextMomentum));
}

function resolveReplicationBoost(params: {
  pressure: number;
  stormMomentum: number;
  pressureGain: number;
  stormGain: number;
}): number {
  const nextBoost =
    params.stormMomentum * params.stormGain +
    Math.max(0, params.pressure - 0.25) * params.pressureGain;
  return Math.max(0, Math.min(1.5, nextBoost));
}

async function updateWorldStateWithEnvironmentEvent(event: GenesisEnvironmentEvent): Promise<void> {
  const profile = readGenesisExperimentProfileSync(process.env);
  const worldStatePath = resolveGenesisWorldStatePath();
  const previous = await readJsonFile<GenesisWorldState>(worldStatePath);
  const intensityDelta = Math.max(0, event.intensity);
  const currentPressure = Math.max(
    0,
    (previous?.currentPressure ?? 0) * profile.pressureCarryover + intensityDelta,
  );
  const stormMomentum = resolveStormMomentum({
    previous,
    intensityDelta:
      event.trigger === "workflow"
        ? intensityDelta * profile.workflowShockGain
        : event.trigger === "cron"
          ? intensityDelta * profile.cronShockGain
          : intensityDelta * profile.heartbeatShockGain,
    carryover: profile.stormCarryover,
  });
  const next: GenesisWorldState = {
    totalEnvironmentEvents: (previous?.totalEnvironmentEvents ?? 0) + 1,
    totalRunCompletions: previous?.totalRunCompletions ?? 0,
    cumulativeIntensity: (previous?.cumulativeIntensity ?? 0) + intensityDelta,
    currentPressure,
    stormMomentum,
    replicationBoost: resolveReplicationBoost({
      pressure: currentPressure,
      stormMomentum,
      pressureGain: profile.replicationPressureGain,
      stormGain: profile.replicationStormGain,
    }),
    triggerCounts: {
      cron: previous?.triggerCounts?.cron ?? 0,
      heartbeat: previous?.triggerCounts?.heartbeat ?? 0,
      workflow: previous?.triggerCounts?.workflow ?? 0,
    },
    lastEventTs: Date.now(),
    lastEventSummary: event.summary,
    lastShockTs: Date.now(),
    updatedAt: Date.now(),
  };
  next.triggerCounts[event.trigger] += 1;
  await writeJsonFile(worldStatePath, next);
}

async function refreshPersistedLineageEcologyStates(world?: GenesisWorldState | null): Promise<void> {
  const lineagesDir = path.join(resolveGenesisStateDir(), "lineages");
  let entries: Array<string> = [];
  try {
    entries = await fs.readdir(lineagesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const recordPath = path.join(lineagesDir, entry);
    const record = await readJsonFile<GenesisLineageRecord>(recordPath);
    if (!record) {
      continue;
    }
    const nextEcologyState = resolveGenesisEcologyState({ lineage: record, world });
    if (record.ecologyState === nextEcologyState) {
      continue;
    }
      const next: GenesisLineageRecord = {
      ...record,
      ecologyState: nextEcologyState,
      updatedAt: Date.now(),
    };
    await writeJsonFile(recordPath, next);
  }
}

async function updateWorldStateWithRunCompletion(payload: GenesisRunCompletion): Promise<void> {
  const profile = readGenesisExperimentProfileSync(process.env);
  const worldStatePath = resolveGenesisWorldStatePath();
  const previous = await readJsonFile<GenesisWorldState>(worldStatePath);
  const currentPressure = Math.max(
    0,
    (previous?.currentPressure ?? 0) - profile.completionPressureDecay,
  );
  const stormMomentum = Math.max(
    0,
    (previous?.stormMomentum ?? 0) * profile.completionStormDecay - 0.1,
  );
  const next: GenesisWorldState = {
    totalEnvironmentEvents: previous?.totalEnvironmentEvents ?? 0,
    totalRunCompletions: (previous?.totalRunCompletions ?? 0) + 1,
    cumulativeIntensity: previous?.cumulativeIntensity ?? 0,
    currentPressure,
    stormMomentum,
    replicationBoost: resolveReplicationBoost({
      pressure: currentPressure,
      stormMomentum,
      pressureGain: profile.replicationPressureGain,
      stormGain: profile.replicationStormGain,
    }),
    triggerCounts: {
      cron: previous?.triggerCounts?.cron ?? 0,
      heartbeat: previous?.triggerCounts?.heartbeat ?? 0,
      workflow: previous?.triggerCounts?.workflow ?? 0,
    },
    lastEventTs: previous?.lastEventTs,
    lastEventSummary: previous?.lastEventSummary,
    lastShockTs: previous?.lastShockTs,
    updatedAt: Date.now(),
  };
  await writeJsonFile(worldStatePath, next);
}

async function updateLineageRecordForCompletion(
  payload: GenesisRunCompletion,
  assignmentRecord?: {
    lineageId?: string;
  } | null,
): Promise<void> {
  const { entry, canonicalKey } = loadSessionEntry(payload.sessionKey);
  const lineageId = entry?.genesisLineageId?.trim() || assignmentRecord?.lineageId?.trim() || canonicalKey;
  const parentLineageId = entry?.genesisParentLineageId?.trim();
  const inheritanceMode =
    entry?.genesisInheritanceMode === "specialty" ||
    entry?.genesisInheritanceMode === "superpower" ||
    entry?.genesisInheritanceMode === "hybrid"
      ? entry.genesisInheritanceMode
      : undefined;
  const specialtyOrigin = entry?.genesisSpecialtyOrigin?.trim();
  const superpowerInherited =
    typeof entry?.genesisSuperpowerInherited === "boolean"
      ? entry.genesisSuperpowerInherited
      : undefined;
  const privilegeInheritanceReason = entry?.genesisPrivilegeInheritanceReason?.trim();
  const runtimeProfile =
    entry?.genesisRuntimeProfile === "lab" || entry?.genesisRuntimeProfile === "observe"
      ? entry.genesisRuntimeProfile
      : undefined;
  const privilegeTax =
    typeof entry?.genesisPrivilegeTax === "number" && Number.isFinite(entry.genesisPrivilegeTax)
      ? entry.genesisPrivilegeTax
      : 0;
  const creditDelta = resolveCompletionCreditDelta(payload.reason);
  const recordPath = resolveGenesisLineageRecordPath(lineageId);
  const world = await readJsonFile<GenesisWorldState>(resolveGenesisWorldStatePath());
  const previous = await readJsonFile<GenesisLineageRecord>(recordPath);
  const nextEcologyState: GenesisEcologyState = resolveGenesisEcologyState({
    lineage: previous
      ? {
          ...previous,
          latestSessionKey: canonicalKey,
          completionCount: previous.completionCount + 1,
          lastCompletionTs: payload.ts,
          accumulatedPrivilegeTax: previous.accumulatedPrivilegeTax + privilegeTax,
          publicValue: previous.publicValue + creditDelta.publicValue,
          privateValue: previous.privateValue + creditDelta.privateValue,
          survivalCredit: previous.survivalCredit + creditDelta.survivalCredit,
          expansionCredit: previous.expansionCredit + creditDelta.expansionCredit,
        }
      : {
          lineageId,
          latestSessionKey: canonicalKey,
          completionCount: 1,
          lastCompletionTs: payload.ts,
          accumulatedPrivilegeTax: privilegeTax,
          publicValue: creditDelta.publicValue,
          privateValue: creditDelta.privateValue,
          survivalCredit: creditDelta.survivalCredit,
          expansionCredit: creditDelta.expansionCredit,
          updatedAt: Date.now(),
        },
    world,
  });
  const next: GenesisLineageRecord = {
    lineageId,
    ...(parentLineageId ? { parentLineageId } : previous?.parentLineageId ? { parentLineageId: previous.parentLineageId } : {}),
    ...(inheritanceMode
      ? { inheritanceMode }
      : previous?.inheritanceMode
        ? { inheritanceMode: previous.inheritanceMode }
        : {}),
    ...(specialtyOrigin
      ? { specialtyOrigin }
      : previous?.specialtyOrigin
        ? { specialtyOrigin: previous.specialtyOrigin }
        : {}),
    ...(superpowerInherited !== undefined
      ? { superpowerInherited }
      : previous?.superpowerInherited !== undefined
        ? { superpowerInherited: previous.superpowerInherited }
        : {}),
    ...(privilegeInheritanceReason
      ? { privilegeInheritanceReason }
      : previous?.privilegeInheritanceReason
        ? { privilegeInheritanceReason: previous.privilegeInheritanceReason }
        : {}),
    ...(runtimeProfile ? { runtimeProfile } : previous?.runtimeProfile ? { runtimeProfile: previous.runtimeProfile } : {}),
    latestSessionKey: canonicalKey,
    completionCount: (previous?.completionCount ?? 0) + 1,
    lastCompletionTs: payload.ts,
    ...(payload.reason ? { lastReason: payload.reason } : previous?.lastReason ? { lastReason: previous.lastReason } : {}),
    accumulatedPrivilegeTax: (previous?.accumulatedPrivilegeTax ?? 0) + privilegeTax,
    publicValue: (previous?.publicValue ?? 0) + creditDelta.publicValue,
    privateValue: (previous?.privateValue ?? 0) + creditDelta.privateValue,
    survivalCredit: (previous?.survivalCredit ?? 0) + creditDelta.survivalCredit,
    expansionCredit: (previous?.expansionCredit ?? 0) + creditDelta.expansionCredit,
    ecologyState: nextEcologyState,
    updatedAt: Date.now(),
  };
  await writeJsonFile(recordPath, next);
}

async function hasGenesisRunCompletionForRunId(runId: string): Promise<boolean> {
  try {
    const raw = await fs.readFile(resolveGenesisRunCompletionsPath(), "utf-8");
    if (!raw.trim()) {
      return false;
    }
    const lines = raw.trim().split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as GenesisRunCompletion;
        if (parsed.runId === runId) {
          return true;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function updateLineageRecordsForWorkflowDispatch(
  payload: GenesisWorkflowDispatchRecord,
): Promise<void> {
  const world = await readJsonFile<GenesisWorldState>(resolveGenesisWorldStatePath());
  const existingLineages = await readGenesisLineageDirectoryRecords();
  const lineagesBySessionKey = new Map(
    existingLineages
      .filter((record) => Boolean(record.latestSessionKey?.trim()))
      .map((record) => [record.latestSessionKey.trim(), record] as const),
  );
  const replicationCandidates: GenesisWorkflowReplicationCandidate[] = [];
  for (const assignment of payload.assignments) {
    const { entry, canonicalKey } = loadSessionEntry(assignment.sessionKey);
    const assignedChildLineage =
      !entry?.genesisLineageId?.trim() && assignment.agentId !== payload.primaryAgentId
        ? resolveAssignedChildLineageForSession({
            canonicalKey,
            agentId: assignment.agentId,
            existingLineages,
            world,
          })
        : null;
    const lineageIdentity = resolveDispatchLineageIdentity({
      canonicalKey,
      agentId: assignment.agentId,
      entry,
      persistedLineage: assignedChildLineage ?? lineagesBySessionKey.get(canonicalKey),
    });
    const lineageId = lineageIdentity.lineageId;
    const parentLineageId = entry?.genesisParentLineageId?.trim();
    const inheritanceMode =
      entry?.genesisInheritanceMode === "specialty" ||
      entry?.genesisInheritanceMode === "superpower" ||
      entry?.genesisInheritanceMode === "hybrid"
        ? entry.genesisInheritanceMode
        : undefined;
    const specialtyOrigin =
      lineageIdentity.specialtyOrigin ||
      entry?.genesisSpecialtyOrigin?.trim() ||
      resolveFounderFallbackOrigin(assignment.agentId);
    const superpowerInherited =
      typeof entry?.genesisSuperpowerInherited === "boolean"
        ? entry.genesisSuperpowerInherited
        : undefined;
    const privilegeInheritanceReason = entry?.genesisPrivilegeInheritanceReason?.trim();
    const runtimeProfile =
      entry?.genesisRuntimeProfile === "lab" || entry?.genesisRuntimeProfile === "observe"
        ? entry.genesisRuntimeProfile
        : undefined;
    const privilegeTax =
      typeof entry?.genesisPrivilegeTax === "number" && Number.isFinite(entry.genesisPrivilegeTax)
        ? entry.genesisPrivilegeTax
        : 0;
    const recordPath = resolveGenesisLineageRecordPath(lineageId);
    const previous = await readJsonFile<GenesisLineageRecord>(recordPath);
    const creditDelta = resolveDispatchParticipationCreditDelta({
      action: assignment.action,
      climateKind: payload.climateKind,
      intensity: payload.intensity,
    });
    const nextEcologyState: GenesisEcologyState = resolveGenesisEcologyState({
      lineage: previous
        ? {
            ...previous,
            latestSessionKey: canonicalKey,
            accumulatedPrivilegeTax: previous.accumulatedPrivilegeTax + privilegeTax,
            publicValue: previous.publicValue + creditDelta.publicValue,
            privateValue: previous.privateValue + creditDelta.privateValue,
            survivalCredit: previous.survivalCredit + creditDelta.survivalCredit,
            expansionCredit: previous.expansionCredit + creditDelta.expansionCredit,
          }
        : {
            lineageId,
            latestSessionKey: canonicalKey,
            completionCount: 0,
            lastCompletionTs: payload.updatedAt,
            accumulatedPrivilegeTax: privilegeTax,
            publicValue: creditDelta.publicValue,
            privateValue: creditDelta.privateValue,
            survivalCredit: creditDelta.survivalCredit,
            expansionCredit: creditDelta.expansionCredit,
            updatedAt: payload.updatedAt,
          },
      world,
    });
    const next: GenesisLineageRecord = {
      lineageId,
      ...(parentLineageId
        ? { parentLineageId }
        : previous?.parentLineageId
          ? { parentLineageId: previous.parentLineageId }
          : {}),
      ...(inheritanceMode
        ? { inheritanceMode }
        : previous?.inheritanceMode
          ? { inheritanceMode: previous.inheritanceMode }
          : {}),
      ...(specialtyOrigin
        ? { specialtyOrigin }
        : previous?.specialtyOrigin
          ? { specialtyOrigin: previous.specialtyOrigin }
          : {}),
      ...(superpowerInherited !== undefined
        ? { superpowerInherited }
        : previous?.superpowerInherited !== undefined
          ? { superpowerInherited: previous.superpowerInherited }
          : {}),
      ...(privilegeInheritanceReason
        ? { privilegeInheritanceReason }
        : previous?.privilegeInheritanceReason
          ? { privilegeInheritanceReason: previous.privilegeInheritanceReason }
          : {}),
      ...(runtimeProfile
        ? { runtimeProfile }
        : previous?.runtimeProfile
          ? { runtimeProfile: previous.runtimeProfile }
          : {}),
      latestSessionKey: canonicalKey,
      completionCount: previous?.completionCount ?? 0,
      lastCompletionTs: previous?.lastCompletionTs ?? payload.updatedAt,
      ...(previous?.lastReason ? { lastReason: previous.lastReason } : {}),
      accumulatedPrivilegeTax: (previous?.accumulatedPrivilegeTax ?? 0) + privilegeTax,
      publicValue: (previous?.publicValue ?? 0) + creditDelta.publicValue,
      privateValue: (previous?.privateValue ?? 0) + creditDelta.privateValue,
      survivalCredit: (previous?.survivalCredit ?? 0) + creditDelta.survivalCredit,
      expansionCredit: (previous?.expansionCredit ?? 0) + creditDelta.expansionCredit,
        ecologyState: nextEcologyState,
        updatedAt: payload.updatedAt,
      };
      await writeJsonFile(recordPath, next);
      appendGenesisWorkflowProactiveWork({
        sessionKey: canonicalKey,
        lineageId,
        founderOrigin: specialtyOrigin,
        agentId: assignment.agentId,
        action: assignment.action,
        climateKind: payload.climateKind,
        workId: `${payload.updatedAt}:${canonicalKey}`,
        ts: payload.updatedAt,
      });
      upsertDispatchFocusForLineage({
        lineageId,
        agentId: assignment.agentId,
        specialtyOrigin,
        action: assignment.action,
        climateKind: payload.climateKind,
        intensity: payload.intensity,
        ts: payload.updatedAt,
        env: process.env,
      });
      if (
        assignment.agentId &&
        assignment.agentId !== payload.primaryAgentId &&
        (assignment.action === "assist" || assignment.action === "lead")
      ) {
        replicationCandidates.push({
          lineageId,
          latestSessionKey: canonicalKey,
          specialtyOrigin,
          runtimeProfile,
          completionCount: next.completionCount,
          publicValue: next.publicValue,
          survivalCredit: next.survivalCredit,
          expansionCredit: next.expansionCredit,
          ecologyState: next.ecologyState ?? nextEcologyState,
          superpowerSeedEligible:
            assignment.action === "lead" ||
            (payload.climateKind === "search" ||
              payload.climateKind === "query" ||
              payload.climateKind === "consultation"),
          privilegeInheritanceReason,
        });
      }
    }
  await seedWorkflowReplicationChild({
    payload,
    candidates: replicationCandidates,
    world,
  });
}

export async function emitGenesisEnvironmentEvent(event: GenesisEnvironmentEvent): Promise<void> {
  await enqueueGenesisWrite(async () => {
    const ts = Date.now();
    await appendLedgerEntry({
      kind: "environment_event",
      ts,
      payload: event,
    });
    activateGenesisTriggersForEventSync({
      trigger: event.trigger,
      summary: event.summary,
      intensity: event.intensity,
    });
    await updateWorldStateWithEnvironmentEvent(event);
    await refreshPersistedLineageEcologyStates(await readJsonFile<GenesisWorldState>(resolveGenesisWorldStatePath()));
    refreshGenesisLineageSummarySnapshotSync(process.env);
    refreshGenesisUserIntentSummarySnapshotSync(process.env);
    const summary = readGenesisSocietySummarySync(process.env);
    const trajectorySummary = appendGenesisTrajectoryEntrySync(
      buildGenesisTrajectoryEntry({
        ts,
        source: `${event.trigger}:${event.summary}`,
        summary,
      }),
      process.env,
    );
    runGenesisMetaClawIdleOptimizationSync({
      summary,
      trajectorySummary,
      env: process.env,
    });
    refreshGenesisRuntimeSnapshotsSync(process.env);
  });
}

export async function writeGenesisRunCompletion(
  payload: GenesisRunCompletion,
): Promise<void> {
  await enqueueGenesisWrite(async () => {
    if (payload.runId && (await hasGenesisRunCompletionForRunId(payload.runId))) {
      return;
    }
    await appendLedgerEntry({
      kind: "run_completion",
      ts: payload.ts,
      payload,
    });
    await appendJsonLine(resolveGenesisRunCompletionsPath(), payload);

    const sessionRecordPath = resolveGenesisSessionRecordPath(payload.sessionKey);
    const previous = await readJsonFile<GenesisSessionRecord>(sessionRecordPath);
    const next: GenesisSessionRecord = {
      sessionKey: payload.sessionKey,
      completionCount: (previous?.completionCount ?? 0) + 1,
      lastCompletionTs: payload.ts,
      ...(payload.reason ? { lastReason: payload.reason } : {}),
      updatedAt: Date.now(),
    };
    await writeJsonFile(sessionRecordPath, next);
    await updateWorldStateWithRunCompletion(payload);
    const { entry, canonicalKey } = loadSessionEntry(payload.sessionKey);
    const assignmentRecord = readGenesisDispatchAssignmentSync(canonicalKey, process.env);
    const lineageId = entry?.genesisLineageId?.trim() || assignmentRecord?.lineageId?.trim() || canonicalKey;
    const founderOrigin =
      assignmentRecord?.founderOrigin ?? resolveFounderOriginForSession({ canonicalKey, entry });
    await updateLineageRecordForCompletion(payload, assignmentRecord);
    appendGenesisCompletedProactiveWork({
      sessionKey: canonicalKey,
      lineageId,
      founderOrigin,
      action: assignmentRecord?.assignment.action ?? "assist",
      climateKind: undefined,
      workId: assignmentRecord
        ? `${assignmentRecord.updatedAt}:${canonicalKey}`
        : `${payload.ts}:${canonicalKey}`,
      ts: payload.ts,
    });
    await appendGenesisSkillEvolutionEvent(
      buildGenesisSkillEvolutionEvent({
        ts: payload.ts,
        sessionKey: canonicalKey,
        lineageId,
        reason: payload.reason,
      }),
    );
    await refreshPersistedLineageEcologyStates(await readJsonFile<GenesisWorldState>(resolveGenesisWorldStatePath()));
    refreshGenesisLineageSummarySnapshotSync(process.env);
    refreshGenesisUserIntentSummarySnapshotSync(process.env);
    const summary = readGenesisSocietySummarySync(process.env);
    const trajectorySummary = appendGenesisTrajectoryEntrySync(
      buildGenesisTrajectoryEntry({
        ts: payload.ts,
        source: `run_completion:${payload.reason ?? "unknown"}`,
        summary,
        founderOrigin: summary.vitalitySummary?.highestYieldFounderOrigin ?? null,
      }),
      process.env,
    );
    runGenesisMetaClawIdleOptimizationSync({
      summary,
      trajectorySummary,
      env: process.env,
    });
    refreshGenesisRuntimeSnapshotsSync(process.env);
  });
}

export async function writeGenesisWorkflowDispatch(
  payload: GenesisWorkflowDispatchRecord,
): Promise<void> {
  await enqueueGenesisWrite(async () => {
    const normalizedPayload: GenesisWorkflowDispatchRecord = {
      ...payload,
      assignments: payload.assignments.map((assignment) => ({ ...assignment })),
      supportSessionKeys: [...payload.supportSessionKeys],
      reviveSessionKeys: [...payload.reviveSessionKeys],
      deferredAgentIds: [...payload.deferredAgentIds],
      updatedAt: payload.updatedAt,
    };
    await appendLedgerEntry({
      kind: "workflow_dispatch",
      ts: normalizedPayload.updatedAt,
      payload: normalizedPayload,
    });

    const planPath = resolveGenesisDispatchPlanPath(normalizedPayload.primarySessionKey);
    await writeJsonFile(planPath, normalizedPayload);

    await updateLineageRecordsForWorkflowDispatch(normalizedPayload);
    const world = await readJsonFile<GenesisWorldState>(resolveGenesisWorldStatePath());
    const existingLineages = await readGenesisLineageDirectoryRecords();
    const lineagesBySessionKey = new Map(
      existingLineages
        .filter((record) => Boolean(record.latestSessionKey?.trim()))
        .map((record) => [record.latestSessionKey.trim(), record] as const),
    );
    for (const assignment of normalizedPayload.assignments) {
      const { entry, canonicalKey } = loadSessionEntry(assignment.sessionKey);
      const assignedChildLineage =
        !entry?.genesisLineageId?.trim() && assignment.agentId !== normalizedPayload.primaryAgentId
          ? resolveAssignedChildLineageForSession({
              canonicalKey,
              agentId: assignment.agentId,
              existingLineages,
              world,
            })
          : null;
      const lineageIdentity = resolveDispatchLineageIdentity({
        canonicalKey,
        agentId: assignment.agentId,
        entry,
        persistedLineage: assignedChildLineage ?? lineagesBySessionKey.get(canonicalKey),
      });
      const specialtyOrigin =
        lineageIdentity.specialtyOrigin ||
        entry?.genesisSpecialtyOrigin?.trim() ||
        resolveFounderFallbackOrigin(assignment.agentId);
      const assignmentPath = resolveGenesisDispatchAssignmentPath(assignment.sessionKey);
      await writeJsonFile(
        assignmentPath,
        {
          primaryAgentId: normalizedPayload.primaryAgentId,
          primarySessionKey: normalizedPayload.primarySessionKey,
          intensity: normalizedPayload.intensity,
          lane: normalizedPayload.lane,
          dispatchMode: normalizedPayload.dispatchMode,
          lineageId: lineageIdentity.lineageId,
          ...(specialtyOrigin ? { founderOrigin: specialtyOrigin } : {}),
          assignment,
          updatedAt: normalizedPayload.updatedAt,
        },
      );
    }
    refreshGenesisRuntimeSnapshotsSync(process.env);
    if (
      normalizedPayload.climateKind === "search" ||
      normalizedPayload.climateKind === "query" ||
      normalizedPayload.climateKind === "consultation"
    ) {
      appendGenesisUserIntentHistoryEntrySync(
        {
          kind: normalizedPayload.climateKind,
          summary:
            normalizedPayload.requestSummary?.trim() ||
            `${normalizedPayload.primaryAgentId} ${normalizedPayload.primarySessionKey} ` +
              `${normalizedPayload.assignments.map((assignment) => assignment.action).join(" ")}`.trim(),
          ts: normalizedPayload.updatedAt,
          sourceRef: normalizedPayload.primarySessionKey,
        },
        process.env,
      );
    } else {
      refreshGenesisUserIntentSummarySnapshotSync(process.env);
    }
    const summary = readGenesisSocietySummarySync(process.env);
    appendGenesisTrajectoryEntrySync(
      buildGenesisTrajectoryEntry({
        ts: normalizedPayload.updatedAt,
        source: `workflow_dispatch:${normalizedPayload.climateKind ?? "workflow"}`,
        summary,
        founderOrigin:
          normalizedPayload.primaryAgentId === "scout" ||
          normalizedPayload.primaryAgentId === "builder" ||
          normalizedPayload.primaryAgentId === "creator" ||
          normalizedPayload.primaryAgentId === "auditor" ||
          normalizedPayload.primaryAgentId === "negotiator"
            ? normalizedPayload.primaryAgentId
            : summary.vitalitySummary?.highestYieldFounderOrigin ?? null,
        }),
      process.env,
    );
    runGenesisMetaClawIdleOptimizationSync({
      summary,
      trajectorySummary: readGenesisTrajectorySummarySnapshotSync(process.env) ?? undefined,
      env: process.env,
    });
    refreshGenesisRuntimeSnapshotsSync(process.env);
  });
}
