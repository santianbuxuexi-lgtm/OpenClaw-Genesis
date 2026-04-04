import type {
  GenesisSocietyDispatchAssignment,
  GenesisSocietyDispatchPlan,
} from "./workflow.js";

export type GenesisWorkflowPayload = {
  intensity: number;
  climateKind: string;
  forcedCollaboration: boolean;
  availableAgentCount: number;
  targetCoverageRatio: number;
  mobilizedCoverageRatio: number;
  mobilizedSessionKeys: string[];
  revivedAgentIds: string[];
  deferredAgentIds: string[];
};

export type GenesisSchedulingPayload = {
  lane: string;
  dispatchMode: "immediate" | "staggered" | "emergency";
  delayMs: number;
  priorityBias: number;
  ecologyState: "active" | "stressed" | "dormant" | "extinct";
};

export type GenesisContextPayload = {
  genesisWorkflow?: GenesisWorkflowPayload;
  genesisScheduling?: GenesisSchedulingPayload;
  genesisSocietyAssignment?: GenesisSocietyDispatchAssignment;
  genesisSociety?: GenesisSocietyDispatchPlan;
};

export function cloneGenesisWorkflowPayload(
  summary: GenesisWorkflowPayload | null | undefined,
): GenesisWorkflowPayload | undefined {
  if (!summary) {
    return undefined;
  }
  return {
    intensity: summary.intensity,
    climateKind: summary.climateKind,
    forcedCollaboration: summary.forcedCollaboration,
    availableAgentCount: summary.availableAgentCount,
    targetCoverageRatio: summary.targetCoverageRatio,
    mobilizedCoverageRatio: summary.mobilizedCoverageRatio,
    mobilizedSessionKeys: [...summary.mobilizedSessionKeys],
    revivedAgentIds: [...summary.revivedAgentIds],
    deferredAgentIds: [...summary.deferredAgentIds],
  };
}

export function cloneGenesisSchedulingPayload(
  summary: GenesisSchedulingPayload | null | undefined,
): GenesisSchedulingPayload | undefined {
  if (!summary) {
    return undefined;
  }
  return {
    lane: summary.lane,
    dispatchMode: summary.dispatchMode,
    delayMs: summary.delayMs,
    priorityBias: summary.priorityBias,
    ecologyState: summary.ecologyState,
  };
}

export function cloneGenesisSocietyAssignmentPayload(
  summary: GenesisSocietyDispatchAssignment | null | undefined,
): GenesisSocietyDispatchAssignment | undefined {
  if (!summary) {
    return undefined;
  }
  return {
    agentId: summary.agentId,
    sessionKey: summary.sessionKey,
    mode: summary.mode,
    action: summary.action,
    ecologyState: summary.ecologyState,
    queued: summary.queued,
    lane: summary.lane,
    dispatchMode: summary.dispatchMode,
    delayMs: summary.delayMs,
    priorityBias: summary.priorityBias,
  };
}

export function cloneGenesisSocietyPayload(
  summary: GenesisSocietyDispatchPlan | null | undefined,
): GenesisSocietyDispatchPlan | undefined {
  if (!summary) {
    return undefined;
  }
  return {
    primaryAgentId: summary.primaryAgentId,
    primarySessionKey: summary.primarySessionKey,
    intensity: summary.intensity,
    climateKind: summary.climateKind,
    forcedCollaboration: summary.forcedCollaboration,
    availableAgentCount: summary.availableAgentCount,
    targetCoverageRatio: summary.targetCoverageRatio,
    mobilizedCoverageRatio: summary.mobilizedCoverageRatio,
    lane: summary.lane,
    dispatchMode: summary.dispatchMode,
    assignments: summary.assignments.map((assignment) =>
      cloneGenesisSocietyAssignmentPayload(assignment),
    ) as GenesisSocietyDispatchAssignment[],
    supportSessionKeys: [...summary.supportSessionKeys],
    reviveSessionKeys: [...summary.reviveSessionKeys],
    deferredAgentIds: [...summary.deferredAgentIds],
  };
}

export function cloneGenesisContextPayload(
  context: GenesisContextPayload | null | undefined,
): GenesisContextPayload {
  return {
    ...(cloneGenesisWorkflowPayload(context?.genesisWorkflow)
      ? { genesisWorkflow: cloneGenesisWorkflowPayload(context?.genesisWorkflow) }
      : {}),
    ...(cloneGenesisSchedulingPayload(context?.genesisScheduling)
      ? { genesisScheduling: cloneGenesisSchedulingPayload(context?.genesisScheduling) }
      : {}),
    ...(cloneGenesisSocietyAssignmentPayload(context?.genesisSocietyAssignment)
      ? {
          genesisSocietyAssignment: cloneGenesisSocietyAssignmentPayload(
            context?.genesisSocietyAssignment,
          ),
        }
      : {}),
    ...(cloneGenesisSocietyPayload(context?.genesisSociety)
      ? { genesisSociety: cloneGenesisSocietyPayload(context?.genesisSociety) }
      : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? [...value]
    : null;
}

export function readGenesisWorkflowPayload(value: unknown): GenesisWorkflowPayload | undefined {
  const record = asRecord(value);
  const mobilizedSessionKeys = asStringArray(record?.mobilizedSessionKeys);
  const revivedAgentIds = asStringArray(record?.revivedAgentIds);
  const deferredAgentIds = asStringArray(record?.deferredAgentIds);
  if (
    !record ||
    typeof record.intensity !== "number" ||
    typeof record.climateKind !== "string" ||
    typeof record.forcedCollaboration !== "boolean" ||
    typeof record.availableAgentCount !== "number" ||
    typeof record.targetCoverageRatio !== "number" ||
    typeof record.mobilizedCoverageRatio !== "number" ||
    !mobilizedSessionKeys ||
    !revivedAgentIds ||
    !deferredAgentIds
  ) {
    return undefined;
  }
  return {
    intensity: record.intensity,
    climateKind: record.climateKind,
    forcedCollaboration: record.forcedCollaboration,
    availableAgentCount: record.availableAgentCount,
    targetCoverageRatio: record.targetCoverageRatio,
    mobilizedCoverageRatio: record.mobilizedCoverageRatio,
    mobilizedSessionKeys,
    revivedAgentIds,
    deferredAgentIds,
  };
}

export function readGenesisSchedulingPayload(value: unknown): GenesisSchedulingPayload | undefined {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.lane !== "string" ||
    typeof record.dispatchMode !== "string" ||
    typeof record.delayMs !== "number" ||
    typeof record.priorityBias !== "number" ||
    typeof record.ecologyState !== "string"
  ) {
    return undefined;
  }
  return {
    lane: record.lane,
    dispatchMode: record.dispatchMode as GenesisSchedulingPayload["dispatchMode"],
    delayMs: record.delayMs,
    priorityBias: record.priorityBias,
    ecologyState: record.ecologyState as GenesisSchedulingPayload["ecologyState"],
  };
}

export function readGenesisSocietyAssignmentPayload(
  value: unknown,
): GenesisSocietyDispatchAssignment | undefined {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.agentId !== "string" ||
    typeof record.sessionKey !== "string" ||
    typeof record.mode !== "string" ||
    typeof record.action !== "string" ||
    typeof record.ecologyState !== "string" ||
    typeof record.queued !== "boolean" ||
    typeof record.lane !== "string" ||
    typeof record.dispatchMode !== "string" ||
    typeof record.delayMs !== "number" ||
    typeof record.priorityBias !== "number"
  ) {
    return undefined;
  }
  return {
    agentId: record.agentId,
    sessionKey: record.sessionKey,
    mode: record.mode as GenesisSocietyDispatchAssignment["mode"],
    action: record.action as GenesisSocietyDispatchAssignment["action"],
    ecologyState: record.ecologyState as GenesisSocietyDispatchAssignment["ecologyState"],
    queued: record.queued,
    lane: record.lane as GenesisSocietyDispatchAssignment["lane"],
    dispatchMode: record.dispatchMode as GenesisSocietyDispatchAssignment["dispatchMode"],
    delayMs: record.delayMs,
    priorityBias: record.priorityBias,
  };
}

export function readGenesisSocietyPayload(
  value: unknown,
): GenesisSocietyDispatchPlan | undefined {
  const record = asRecord(value);
  const assignmentsRaw = Array.isArray(record?.assignments) ? record.assignments : null;
  const supportSessionKeys = asStringArray(record?.supportSessionKeys);
  const reviveSessionKeys = asStringArray(record?.reviveSessionKeys);
  const deferredAgentIds = asStringArray(record?.deferredAgentIds);
  if (
    !record ||
    typeof record.primaryAgentId !== "string" ||
    typeof record.primarySessionKey !== "string" ||
    typeof record.intensity !== "number" ||
    typeof record.climateKind !== "string" ||
    typeof record.forcedCollaboration !== "boolean" ||
    typeof record.availableAgentCount !== "number" ||
    typeof record.targetCoverageRatio !== "number" ||
    typeof record.mobilizedCoverageRatio !== "number" ||
    typeof record.lane !== "string" ||
    typeof record.dispatchMode !== "string" ||
    !assignmentsRaw ||
    !supportSessionKeys ||
    !reviveSessionKeys ||
    !deferredAgentIds
  ) {
    return undefined;
  }
  const assignments = assignmentsRaw
    .map((assignment) => readGenesisSocietyAssignmentPayload(assignment))
    .filter((assignment): assignment is GenesisSocietyDispatchAssignment => Boolean(assignment));
  if (assignments.length !== assignmentsRaw.length) {
    return undefined;
  }
  return {
    primaryAgentId: record.primaryAgentId,
    primarySessionKey: record.primarySessionKey,
    intensity: record.intensity,
    climateKind: record.climateKind,
    forcedCollaboration: record.forcedCollaboration,
    availableAgentCount: record.availableAgentCount,
    targetCoverageRatio: record.targetCoverageRatio,
    mobilizedCoverageRatio: record.mobilizedCoverageRatio,
    lane: record.lane as GenesisSocietyDispatchPlan["lane"],
    dispatchMode: record.dispatchMode as GenesisSocietyDispatchPlan["dispatchMode"],
    assignments,
    supportSessionKeys,
    reviveSessionKeys,
    deferredAgentIds,
  };
}

export function readGenesisContextPayload(value: unknown): GenesisContextPayload {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  return {
    ...(readGenesisWorkflowPayload(record.genesisWorkflow)
      ? { genesisWorkflow: readGenesisWorkflowPayload(record.genesisWorkflow) }
      : {}),
    ...(readGenesisSchedulingPayload(record.genesisScheduling)
      ? { genesisScheduling: readGenesisSchedulingPayload(record.genesisScheduling) }
      : {}),
    ...(readGenesisSocietyAssignmentPayload(record.genesisSocietyAssignment)
      ? {
          genesisSocietyAssignment: readGenesisSocietyAssignmentPayload(
            record.genesisSocietyAssignment,
          ),
        }
      : {}),
    ...(readGenesisSocietyPayload(record.genesisSociety)
      ? { genesisSociety: readGenesisSocietyPayload(record.genesisSociety) }
      : {}),
  };
}
