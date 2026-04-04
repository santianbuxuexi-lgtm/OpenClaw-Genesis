import { listAgentIds } from "../../agents/agent-scope.js";
import { resolveAgentMainSessionKey } from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import {
  type GenesisDispatchAssignmentRecord,
  resolveGenesisLineageDispatchDecision,
  type GenesisEcologyState,
} from "./state.js";

export type GenesisClimateEventKind =
  | "command"
  | "search"
  | "query"
  | "consultation"
  | "requirement"
  | "scheduled"
  | "workflow";

export type GenesisWorkflowMobilization = {
  agentId: string;
  sessionKey: string;
  ecologyState: GenesisEcologyState;
  mode: "primary" | "support" | "revive";
  queued: boolean;
};

export type GenesisWorkflowDispatchResult = {
  primaryAgentId: string;
  primarySessionKey: string;
  intensity: number;
  climateKind: GenesisClimateEventKind;
  forcedCollaboration: boolean;
  availableAgentCount: number;
  targetCoverageRatio: number;
  mobilizedCoverageRatio: number;
  mobilized: GenesisWorkflowMobilization[];
  mobilizedSessionKeys: string[];
  revivedAgentIds: string[];
  deferredAgentIds: string[];
};

export type GenesisWorkflowSchedulingDecision = {
  lane: "workflow" | "workflow-staggered";
  dispatchMode: "immediate" | "staggered" | "emergency";
  delayMs: number;
  priorityBias: number;
  ecologyState: GenesisEcologyState;
};

export type GenesisSocietyDispatchAssignment = {
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

export type GenesisSocietyDispatchPlan = {
  primaryAgentId: string;
  primarySessionKey: string;
  intensity: number;
  climateKind: GenesisClimateEventKind;
  forcedCollaboration: boolean;
  availableAgentCount: number;
  targetCoverageRatio: number;
  mobilizedCoverageRatio: number;
  lane: "workflow" | "workflow-staggered";
  dispatchMode: "immediate" | "staggered" | "emergency";
  assignments: GenesisSocietyDispatchAssignment[];
  supportSessionKeys: string[];
  reviveSessionKeys: string[];
  deferredAgentIds: string[];
};

export function resolveGenesisWorkflowShockIntensity(params: {
  message: string;
  imageCount?: number;
  internalEventCount?: number;
}): number {
  const profile = readGenesisExperimentProfileSync(process.env);
  const messageLength = params.message.trim().length;
  const imageCount = Math.max(0, params.imageCount ?? 0);
  const internalEventCount = Math.max(0, params.internalEventCount ?? 0);

  let intensity = profile.workflowBaseIntensity;
  if (messageLength >= profile.workflowLengthThreshold1) {
    intensity += profile.workflowLengthGain1;
  }
  if (messageLength >= profile.workflowLengthThreshold2) {
    intensity += profile.workflowLengthGain2;
  }
  if (imageCount > 0) {
    intensity += Math.min(profile.workflowImageGainCap, imageCount * profile.workflowImageGainPerImage);
  }
  if (internalEventCount > 0) {
    intensity += Math.min(
      profile.workflowInternalEventGainCap,
      internalEventCount * profile.workflowInternalEventGainPerEvent,
    );
  }
  return Math.max(profile.workflowIntensityMin, Math.min(profile.workflowIntensityMax, intensity));
}

export function resolveGenesisClimateEventKind(params: {
  message: string;
  climateKind?: GenesisClimateEventKind;
}): GenesisClimateEventKind {
  const explicit = params.climateKind?.trim();
  if (explicit) {
    return explicit;
  }
  const message = params.message.trim().toLowerCase();
  if (
    /(?:\bsearch\b|\bquery\b|\blookup\b|\bresearch\b|搜索|查询|检索|查一下|查找)/i.test(message)
  ) {
    return message.includes("consult") || /咨询|请教/.test(message) ? "consultation" : "search";
  }
  if (/(?:\bconsult\b|咨询|请教)/i.test(message)) {
    return "consultation";
  }
  if (/(?:\breminder\b|\bschedule\b|\bcron\b|\bheartbeat\b|定时|提醒|日程|心动任务)/i.test(message)) {
    return "scheduled";
  }
  if (/(?:\brequire(?:ment)?\b|\bmust\b|\bneed\b|要求|需求|必须)/i.test(message)) {
    return "requirement";
  }
  return "command";
}

function resolveGenesisClimateCoverageTargetRatio(kind: GenesisClimateEventKind): number {
  const profile = readGenesisExperimentProfileSync(process.env);
  switch (kind) {
    case "search":
    case "query":
    case "consultation":
      return profile.climateSearchCoverageTargetRatio;
    case "command":
    case "requirement":
    case "scheduled":
      return profile.climateDefaultCoverageTargetRatio;
    default:
      return 0;
  }
}

function resolveGenesisClimateFounderKeywordBoost(params: {
  kind: GenesisClimateEventKind;
  agentId: string;
  message: string;
}): number {
  const normalizedAgentId = params.agentId.trim().toLowerCase();
  const message = params.message.trim().toLowerCase();
  if (!message) {
    return 0;
  }
  const hasAny = (patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(message));
  switch (normalizedAgentId) {
    case "scout":
      return hasAny([
        /\bsearch\b|\bquery\b|\blookup\b|\bresearch\b|\bmonitor\b|\bsignal\b|\bsource\b|\bnews\b/i,
        /搜索|查询|检索|研究|局势|情报|信号|热点|来源|商机/,
      ])
        ? 2.5
        : 0;
    case "creator":
      return hasAny([
        /\bpublish\b|\bpost\b|\bheadline\b|\bdraft\b|\bsummary\b|\bscript\b|\bthread\b|\bcontent\b/i,
        /发布|发帖|微头条|文案|标题|内容|短文|总结|成文/,
      ])
        ? 2.5
        : 0;
    case "auditor":
      return hasAny([
        /\baudit\b|\brisk\b|\bverify\b|\bfact\b|\bcheck\b|\bpatch\b|\bvulnerability\b/i,
        /审计|风险|核实|事实|校验|漏洞|补丁|检查/,
      ])
        ? 2.2
        : params.kind === "search" || params.kind === "query"
          ? 0.6
          : 0;
    case "negotiator":
      return hasAny([
        /\bcoordinate\b|\bchannel\b|\broute\b|\ballocate\b|\bdistribute\b|\bplatform\b/i,
        /协调|分发|渠道|平台|路由|分配|投放/,
      ])
        ? 2.1
        : 0;
    case "builder":
      return hasAny([
        /\bskill\b|\btool\b|\bworkflow\b|\bautomation\b|\bplugin\b|\bexecutor\b/i,
        /skill|工具|工作流|自动化|插件|执行器|能力/,
      ])
        ? 2.3
        : 0;
    default:
      return 0;
  }
}

function resolveGenesisClimateFounderPriority(
  kind: GenesisClimateEventKind,
  agentId: string,
  message = "",
): number {
  const normalized = agentId.trim().toLowerCase();
  const keywordBoost = resolveGenesisClimateFounderKeywordBoost({
    kind,
    agentId: normalized,
    message,
  });
  switch (kind) {
    case "search":
      switch (normalized) {
        case "scout":
          return 6 + keywordBoost;
        case "auditor":
          return 5 + keywordBoost;
        case "creator":
          return 4 + keywordBoost;
        case "negotiator":
          return 3 + keywordBoost;
        case "builder":
          return 2 + keywordBoost;
        default:
          return 0;
      }
    case "query":
      switch (normalized) {
        case "scout":
          return 6 + keywordBoost;
        case "auditor":
          return 5 + keywordBoost;
        case "builder":
          return 4 + keywordBoost;
        case "creator":
          return 3 + keywordBoost;
        case "negotiator":
          return 2 + keywordBoost;
        default:
          return 0;
      }
    case "consultation":
      switch (normalized) {
        case "negotiator":
          return 6 + keywordBoost;
        case "creator":
          return 5 + keywordBoost;
        case "scout":
          return 4 + keywordBoost;
        case "auditor":
          return 3 + keywordBoost;
        case "builder":
          return 2 + keywordBoost;
        default:
          return 0;
      }
    case "requirement":
      switch (normalized) {
        case "builder":
          return 5 + keywordBoost;
        case "creator":
          return 4 + keywordBoost;
        case "auditor":
          return 3 + keywordBoost;
        case "negotiator":
          return 2 + keywordBoost;
        case "scout":
          return 1 + keywordBoost;
        default:
          return 0;
      }
    case "scheduled":
      switch (normalized) {
        case "negotiator":
          return 5 + keywordBoost;
        case "builder":
          return 4 + keywordBoost;
        case "creator":
          return 3 + keywordBoost;
        case "auditor":
          return 2 + keywordBoost;
        case "scout":
          return 1 + keywordBoost;
        default:
          return 0;
      }
    case "command":
    case "workflow":
    default:
      switch (normalized) {
        case "builder":
          return 5 + keywordBoost;
        case "creator":
          return 4 + keywordBoost;
        case "auditor":
          return 3 + keywordBoost;
        case "negotiator":
          return 2 + keywordBoost;
        case "scout":
          return 1 + keywordBoost;
        default:
          return 0;
      }
  }
}

function resolveGenesisClimateTargetCount(params: {
  availableAgentCount: number;
  targetCoverageRatio: number;
}): number {
  const profile = readGenesisExperimentProfileSync(process.env);
  if (params.availableAgentCount <= 0 || params.targetCoverageRatio <= 0) {
    return 0;
  }
  return Math.min(
    params.availableAgentCount,
    Math.max(
      Math.round(params.availableAgentCount * params.targetCoverageRatio),
      Math.min(profile.climateMinimumMobilizedAgents, params.availableAgentCount),
    ),
  );
}

function resolveSupportMobilizationAllowed(params: {
  ecologyState: GenesisEcologyState;
  intensity: number;
  primary: boolean;
}): boolean {
  const profile = readGenesisExperimentProfileSync(process.env);
  if (params.primary) {
    return true;
  }
  switch (params.ecologyState) {
    case "active":
      return true;
    case "stressed":
      return params.intensity >= profile.stressedSupportThreshold;
    case "dormant":
    case "extinct":
      return params.intensity >= profile.dormantReviveThreshold;
    default:
      return false;
  }
}

function buildWorkflowStormText(params: {
  primaryAgentId: string;
  currentAgentId: string;
  mode: GenesisWorkflowMobilization["mode"];
}): string {
  if (params.mode === "primary") {
    return `Internal workflow dispatch: ${params.primaryAgentId} is the primary coordinator for this task.`;
  }
  if (params.mode === "revive") {
    return `Internal workflow dispatch: reactivate ${params.currentAgentId} and close blocking gaps for ${params.primaryAgentId}.`;
  }
  return `Internal workflow dispatch: support ${params.primaryAgentId} on the current task.`;
}

function resolveGenesisWorkflowMode(params: {
  primary: boolean;
  ecologyState: GenesisEcologyState;
}): GenesisWorkflowMobilization["mode"] {
  if (params.primary) {
    return "primary";
  }
  return params.ecologyState === "dormant" || params.ecologyState === "extinct"
    ? "revive"
    : "support";
}

function resolveForcedCoveragePriority(ecologyState: GenesisEcologyState): number {
  switch (ecologyState) {
    case "active":
      return 4;
    case "stressed":
      return 3;
    case "dormant":
      return 2;
    case "extinct":
      return 1;
    default:
      return 0;
  }
}

export function primeGenesisWorkflowDispatch(params: {
  cfg: Parameters<typeof listAgentIds>[0];
  primarySessionKey: string;
  primaryAgentId?: string;
  climateKind?: GenesisClimateEventKind;
  message: string;
  imageCount?: number;
  internalEventCount?: number;
  requestId?: string;
  candidateAgentIds?: string[];
}): GenesisWorkflowDispatchResult | null {
  const primarySessionKey = params.primarySessionKey.trim();
  const primaryAgentId =
    params.primaryAgentId?.trim() || resolveAgentIdFromSessionKey(primarySessionKey);
  if (!primarySessionKey || !primaryAgentId) {
    return null;
  }

  const intensity = resolveGenesisWorkflowShockIntensity({
    message: params.message,
    imageCount: params.imageCount,
    internalEventCount: params.internalEventCount,
  });
  const climateKind = resolveGenesisClimateEventKind({
    message: params.message,
    climateKind: params.climateKind,
  });
  const targetCoverageRatio = resolveGenesisClimateCoverageTargetRatio(climateKind);

  const candidateAgentIds = [
    primaryAgentId,
    ...(params.candidateAgentIds ?? listAgentIds(params.cfg)),
  ]
    .filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index)
    .sort((left, right) => {
      if (left === primaryAgentId) {
        return -1;
      }
      if (right === primaryAgentId) {
        return 1;
      }
      return (
        resolveGenesisClimateFounderPriority(climateKind, right, params.message) -
          resolveGenesisClimateFounderPriority(climateKind, left, params.message) ||
        left.localeCompare(right)
      );
    });
  const availableAgentCount = candidateAgentIds.length;
  const targetMobilizedCount = resolveGenesisClimateTargetCount({
    availableAgentCount,
    targetCoverageRatio,
  });

  const mobilized: GenesisWorkflowMobilization[] = [];
  const revivedAgentIds: string[] = [];
  const deferredEntries: Array<{
    agentId: string;
    sessionKey: string;
    ecologyState: GenesisEcologyState;
  }> = [];

  for (const agentId of candidateAgentIds) {
    const primary = agentId === primaryAgentId;
    const decision = resolveGenesisLineageDispatchDecision(agentId);
    const sessionKey = primary
      ? primarySessionKey
      : resolveAgentMainSessionKey({ cfg: params.cfg, agentId });
    const allowed = resolveSupportMobilizationAllowed({
      ecologyState: decision.ecologyState,
      intensity,
      primary,
    });
    if (!allowed) {
      deferredEntries.push({
        agentId,
        sessionKey,
        ecologyState: decision.ecologyState,
      });
      continue;
    }

    const mode = resolveGenesisWorkflowMode({
      primary,
      ecologyState: decision.ecologyState,
    });
    const queued = enqueueSystemEvent(
      buildWorkflowStormText({
        primaryAgentId,
        currentAgentId: agentId,
        mode,
      }),
      {
        sessionKey,
        contextKey: `workflow:${params.requestId ?? primarySessionKey}:${agentId}`,
        shockTrigger: "workflow",
        shockIntensity:
          intensity +
          (mode === "primary" ? 0.2 : 0) +
          (mode === "revive" ? 0.15 : 0.05),
      },
    );
    mobilized.push({
      agentId,
      sessionKey,
      ecologyState: decision.ecologyState,
      mode,
      queued,
    });
    if (mode === "revive") {
      revivedAgentIds.push(agentId);
    }
  }

  if (mobilized.length < targetMobilizedCount) {
    const deferredForCoverage = [...deferredEntries].sort((left, right) => {
      return (
        resolveGenesisClimateFounderPriority(climateKind, right.agentId, params.message) -
          resolveGenesisClimateFounderPriority(climateKind, left.agentId, params.message) ||
        resolveForcedCoveragePriority(right.ecologyState) -
          resolveForcedCoveragePriority(left.ecologyState) ||
        left.agentId.localeCompare(right.agentId)
      );
    });
    for (const deferred of deferredForCoverage) {
      if (mobilized.length >= targetMobilizedCount) {
        break;
      }
      const mode = resolveGenesisWorkflowMode({
        primary: false,
        ecologyState: deferred.ecologyState,
      });
      const queued = enqueueSystemEvent(
        buildWorkflowStormText({
          primaryAgentId,
          currentAgentId: deferred.agentId,
          mode,
        }),
        {
          sessionKey: deferred.sessionKey,
          contextKey: `workflow:${params.requestId ?? primarySessionKey}:forced:${deferred.agentId}`,
          shockTrigger: "workflow",
          shockIntensity:
            intensity +
            (mode === "revive" ? 0.2 : 0.1) +
            Math.max(0.05, targetCoverageRatio * 0.1),
        },
      );
      mobilized.push({
        agentId: deferred.agentId,
        sessionKey: deferred.sessionKey,
        ecologyState: deferred.ecologyState,
        mode,
        queued,
      });
      if (mode === "revive") {
        revivedAgentIds.push(deferred.agentId);
      }
    }
  }

  const mobilizedIds = new Set(mobilized.map((entry) => entry.agentId));
  const deferredAgentIds = candidateAgentIds.filter((agentId) => !mobilizedIds.has(agentId));
  const mobilizedCoverageRatio =
    availableAgentCount > 0 ? mobilized.length / availableAgentCount : 0;

  return {
    primaryAgentId,
    primarySessionKey,
    intensity,
    climateKind,
    forcedCollaboration: targetCoverageRatio > 0,
    availableAgentCount,
    targetCoverageRatio,
    mobilizedCoverageRatio,
    mobilized,
    mobilizedSessionKeys: mobilized.map((entry) => entry.sessionKey),
    revivedAgentIds,
    deferredAgentIds,
  };
}

export function resolveGenesisWorkflowScheduling(params: {
  primaryAgentId: string;
  dispatch: GenesisWorkflowDispatchResult;
}): GenesisWorkflowSchedulingDecision {
  const profile = readGenesisExperimentProfileSync(process.env);
  const decision = resolveGenesisLineageDispatchDecision(params.primaryAgentId);
  const emergency =
    params.dispatch.revivedAgentIds.length > 0 ||
    decision.ecologyState === "dormant" ||
    decision.ecologyState === "extinct";
  if (emergency) {
    return {
      lane: "workflow",
      dispatchMode: "emergency",
      delayMs: 0,
      priorityBias: 4,
      ecologyState: decision.ecologyState,
    };
  }
  if (
    decision.ecologyState === "stressed" &&
    params.dispatch.intensity < profile.stressedWorkflowStaggerThreshold
  ) {
    return {
      lane: "workflow-staggered",
      dispatchMode: "staggered",
      delayMs: 75,
      priorityBias: 1,
      ecologyState: decision.ecologyState,
    };
  }
  return {
    lane: "workflow",
    dispatchMode: "immediate",
    delayMs: 0,
    priorityBias: params.dispatch.intensity >= 1.1 ? 3 : 2,
    ecologyState: decision.ecologyState,
  };
}

export function resolveGenesisSchedulingFromAssignment(
  assignment: GenesisDispatchAssignmentRecord,
): GenesisWorkflowSchedulingDecision {
  return {
    lane: assignment.assignment.lane,
    dispatchMode: assignment.assignment.dispatchMode,
    delayMs: assignment.assignment.delayMs,
    priorityBias: assignment.assignment.priorityBias,
    ecologyState: assignment.assignment.ecologyState,
  };
}

export function resolveGenesisAssignmentSystemPrompt(params: {
  assignment?: GenesisDispatchAssignmentRecord | null;
  extraSystemPrompt?: string;
  founderResultDigest?: string;
}): string | undefined {
  const existing = params.extraSystemPrompt?.trim();
  const assignment = params.assignment;
  if (!assignment) {
    return existing || undefined;
  }
  const founderSpecialtyHint = resolveGenesisFounderSpecialtyHint(assignment.assignment.agentId);
  const roleHint =
    assignment.assignment.action === "lead"
      ? "You are the primary coordinator for this task. Integrate support outputs and drive the final answer."
      : assignment.assignment.action === "reactivate"
        ? "You were explicitly reactivated for this task. Rebuild context quickly and contribute on the blocking gaps."
        : "You are supporting this task. Stay within your specialty and deliver high-leverage supporting work.";
  const genesisPrompt = [
    "Internal coordination context:",
    `- Primary agent: ${assignment.primaryAgentId}`,
    `- Primary session: ${assignment.primarySessionKey}`,
    `- Your role: ${assignment.assignment.action}`,
    `- Assignment mode: ${assignment.assignment.mode}`,
    `- Ecology state: ${assignment.assignment.ecologyState}`,
    `- Workflow lane: ${assignment.assignment.lane}`,
    `- Dispatch mode: ${assignment.assignment.dispatchMode}`,
    `- Priority bias: ${assignment.assignment.priorityBias}`,
    roleHint,
    founderSpecialtyHint,
    ...(assignment.assignment.action === "lead" && params.founderResultDigest
      ? [params.founderResultDigest]
      : []),
    "Answer the user's actual request directly and concretely.",
    "Treat founder digests and internal coordination context as provisional working context, not as proof that external execution or completed outcomes already happened.",
    "Keep this coordination internal. Do not mention Genesis, founders, lineages, workflow storms, telemetry, or internal assignment details unless the user explicitly asks for status, progress, recovery, replication, learning, or founders.",
    "If the user asks who is working, how many agents are involved, or what the team looks like, answer in Genesis society terms: main is the public entry point, and builder/creator/auditor/negotiator/scout are the internal founder roles. Do not reduce that answer to only the static OpenClaw configured agent list unless the user explicitly asks about configuration.",
    "Do not invent dashboards, SLAs, percentages, uptime claims, or operational metrics that are not grounded in the task result.",
    "Do not claim that data is live, real-time, current, fetched, searched, or verified unless this run actually obtained it from a tool result or explicit evidence.",
    "If search, fetch, or any other tool failed, returned nothing, or lacked a source, say that plainly and continue with the best available grounded answer.",
    "Only describe work as completed when there is explicit completed evidence. Planned work, in-progress work, or internal founder context does not count as a completed result.",
    "If there is no completed evidence yet, say so directly instead of implying that execution already happened.",
    "If collaboration happened, incorporate it silently and return the user-facing result first.",
  ].join("\n");
  return [existing, genesisPrompt].filter(Boolean).join("\n\n") || undefined;
}

function resolveGenesisFounderSpecialtyHint(agentId: string): string {
  switch (agentId.trim().toLowerCase()) {
      case "builder":
      return "Founder specialty: builder. Prioritize reusable tools, skills, automation paths, and implementation details. First reuse existing skills, then build a new skill/tool when capability is missing, then execute. Do not drift into generic planning when a concrete tool or execution path can be produced.";
      case "creator":
      return "Founder specialty: creator. Prioritize content, plans, drafts, scripts, communication structure, and delivery strategy. For weibo and toutiao hotspot publishing, write commentary rather than rewriting the news, keep it within 500 Chinese characters, make it thoughtful and slightly literary, add image support, avoid duplicate angles, and prefer publish-ready outputs. Prefer existing publishing or content skills first, and only ask for new skill/tool support when capability is missing.";
      case "auditor":
      return "Founder specialty: auditor. Prioritize findings, risks, gaps, regressions, vulnerability-style observations, and patch or mitigation guidance. Reuse audit or verification skills first, and return concrete findings, not generic encouragement.";
      case "negotiator":
      return "Founder specialty: negotiator. Prioritize coordination moves, sequencing, channel allocation, resource handoffs, rollout order, and conflict resolution. Reuse existing channel and coordination skills where possible, and make the coordination decision explicit.";
      case "scout":
      return "Founder specialty: scout. Prioritize signals, opportunities, source discovery, search findings, market shifts, and external intelligence. Reuse search or research skills first, surface concrete observations and next targets, and clearly name the skill or source you relied on.";
      default:
      return "Founder specialty: stay within the assigned role and produce the most concrete specialist result you can. Prefer existing skills first, build new capability only when needed, then execute.";
    }
  }

function resolveSupportAssignmentScheduling(params: {
  assignment: GenesisWorkflowMobilization;
  scheduling: GenesisWorkflowSchedulingDecision;
  intensity: number;
}): Pick<GenesisSocietyDispatchAssignment, "lane" | "dispatchMode" | "delayMs" | "priorityBias"> {
  const profile = readGenesisExperimentProfileSync(process.env);
  if (params.assignment.mode === "revive") {
    return {
      lane: "workflow",
      dispatchMode: "emergency",
      delayMs: 0,
      priorityBias: Math.max(3, params.scheduling.priorityBias),
    };
  }
  if (
    params.assignment.ecologyState === "stressed" &&
    params.intensity < profile.stressedWorkflowStaggerThreshold
  ) {
    return {
      lane: "workflow-staggered",
      dispatchMode: "staggered",
      delayMs: Math.max(100, params.scheduling.delayMs + 50),
      priorityBias: Math.max(1, params.scheduling.priorityBias - 1),
    };
  }
  return {
    lane: "workflow",
    dispatchMode: params.scheduling.dispatchMode === "emergency" ? "emergency" : "immediate",
    delayMs: 0,
    priorityBias: Math.max(1, params.scheduling.priorityBias - 1),
  };
}

export function resolveGenesisSocietyDispatchPlan(params: {
  dispatch: GenesisWorkflowDispatchResult;
  scheduling: GenesisWorkflowSchedulingDecision;
}): GenesisSocietyDispatchPlan {
  const assignments = params.dispatch.mobilized.map((assignment) => {
    if (assignment.mode === "primary") {
      return {
        agentId: assignment.agentId,
        sessionKey: assignment.sessionKey,
        mode: assignment.mode,
        action: "lead" as const,
        ecologyState: assignment.ecologyState,
        queued: assignment.queued,
        lane: params.scheduling.lane,
        dispatchMode: params.scheduling.dispatchMode,
        delayMs: params.scheduling.delayMs,
        priorityBias: params.scheduling.priorityBias + 1,
      };
    }

    const supportScheduling = resolveSupportAssignmentScheduling({
      assignment,
      scheduling: params.scheduling,
      intensity: params.dispatch.intensity,
    });
    return {
      agentId: assignment.agentId,
      sessionKey: assignment.sessionKey,
      mode: assignment.mode,
      action: assignment.mode === "revive" ? ("reactivate" as const) : ("assist" as const),
      ecologyState: assignment.ecologyState,
      queued: assignment.queued,
      lane: supportScheduling.lane,
      dispatchMode: supportScheduling.dispatchMode,
      delayMs: supportScheduling.delayMs,
      priorityBias: supportScheduling.priorityBias,
    };
  });

  return {
    primaryAgentId: params.dispatch.primaryAgentId,
    primarySessionKey: params.dispatch.primarySessionKey,
    intensity: params.dispatch.intensity,
    climateKind: params.dispatch.climateKind,
    forcedCollaboration: params.dispatch.forcedCollaboration,
    availableAgentCount: params.dispatch.availableAgentCount,
    targetCoverageRatio: params.dispatch.targetCoverageRatio,
    mobilizedCoverageRatio: params.dispatch.mobilizedCoverageRatio,
    lane: params.scheduling.lane,
    dispatchMode: params.scheduling.dispatchMode,
    assignments,
    supportSessionKeys: assignments
      .filter((assignment) => assignment.mode === "support")
      .map((assignment) => assignment.sessionKey),
    reviveSessionKeys: assignments
      .filter((assignment) => assignment.mode === "revive")
      .map((assignment) => assignment.sessionKey),
    deferredAgentIds: [...params.dispatch.deferredAgentIds],
  };
}
