import {
  primeGenesisWorkflowDispatch,
  resolveGenesisClimateEventKind,
  resolveGenesisSocietyDispatchPlan,
  resolveGenesisWorkflowScheduling,
  type GenesisClimateEventKind,
} from "./workflow.js";
import { emitGenesisEnvironmentEvent, writeGenesisWorkflowDispatch } from "./gateway-bridge.js";
import { readGenesisSocietySummarySync, type GenesisFounderOrigin } from "./society-query.js";
import type { GenesisSocietySummary } from "./state.js";

type GenesisOperatorChannelCfg = Parameters<typeof primeGenesisWorkflowDispatch>[0]["cfg"];

export type GenesisOperatorChannelInput = {
  cfg: GenesisOperatorChannelCfg;
  primarySessionKey: string;
  primaryAgentId?: string;
  channel: string;
  senderLabel?: string;
  accountId?: string;
  threadLabel?: string;
  body: string;
  requestId?: string;
  imageCount?: number;
  internalEventCount?: number;
  candidateAgentIds?: string[];
  climateKind?: GenesisClimateEventKind;
  timestamp?: number;
};

export type GenesisOperatorChannelReport = {
  title: string;
  lines: string[];
};

export type GenesisOperatorChannelResult = {
  climateKind: GenesisClimateEventKind;
  intensity: number;
  dispatch: NonNullable<ReturnType<typeof primeGenesisWorkflowDispatch>>;
  report: GenesisOperatorChannelReport;
  summary: GenesisSocietySummary;
};

function compactFounder(founderOrigin: GenesisFounderOrigin | null | undefined): string {
  return founderOrigin?.trim() || "none";
}

function buildOperatorSummaryLine(summary: GenesisSocietySummary): string {
  const phaseState = summary.experimentSignals?.phaseState ?? "unknown";
  const collaborativePlans = summary.collaborationSummary?.collaborativePlanCount ?? 0;
  const mobilized = summary.collaborationSummary?.mobilizedAgentCount ?? 0;
  return `phase=${phaseState} collaborativePlans=${collaborativePlans} mobilized=${mobilized}`;
}

export function formatGenesisOperatorChannelReport(
  result: GenesisOperatorChannelResult,
): GenesisOperatorChannelReport {
  const summary = result.summary;
  const dispatch = result.dispatch;
  const supportAgents = dispatch.mobilized
    .filter((entry) => entry.mode === "support")
    .map((entry) => entry.agentId);
  const reviveAgents = dispatch.mobilized
    .filter((entry) => entry.mode === "revive")
    .map((entry) => entry.agentId);
  const leaders = [
    `replication=${compactFounder(summary.learningSummary?.highestReplicationQualificationFounderOrigin)}`,
    `recovery=${compactFounder(summary.learningSummary?.highestRecoveryQualificationFounderOrigin)}`,
    `niche=${compactFounder(summary.learningSummary?.highestNicheBalanceFounderOrigin)}`,
  ].join(" ");

  return {
    title: "Genesis coordination report",
    lines: [
      `channel=${result.report.title}`,
      `climate=${result.climateKind} intensity=${result.intensity.toFixed(2)} coverage=${dispatch.mobilizedCoverageRatio.toFixed(2)}/${dispatch.targetCoverageRatio.toFixed(2)}`,
      `lead=${dispatch.primaryAgentId} support=${supportAgents.join(",") || "none"} revive=${reviveAgents.join(",") || "none"}`,
      buildOperatorSummaryLine(summary),
      leaders,
      `intentCluster=${summary.userIntentSummary?.strongestTopicCluster ?? "none"} momentum=${compactFounder(summary.learningSummary?.highestLearningVelocityFounderOrigin)}`,
    ],
  };
}

function buildEventSummary(input: GenesisOperatorChannelInput, climateKind: GenesisClimateEventKind): string {
  const sender = input.senderLabel?.trim() || input.accountId?.trim() || "operator";
  const body = input.body.trim().replace(/\s+/g, " ").slice(0, 180);
  return `[${input.channel}] ${sender} ${climateKind}: ${body}`;
}

export async function runGenesisOperatorChannelTurn(
  input: GenesisOperatorChannelInput,
): Promise<GenesisOperatorChannelResult | null> {
  const message = input.body.trim();
  if (!message) {
    return null;
  }

  const climateKind = resolveGenesisClimateEventKind({
    message,
    climateKind: input.climateKind,
  });
  const dispatch = primeGenesisWorkflowDispatch({
    cfg: input.cfg,
    primarySessionKey: input.primarySessionKey,
    primaryAgentId: input.primaryAgentId,
    climateKind,
    candidateAgentIds: input.candidateAgentIds,
    message,
    imageCount: input.imageCount,
    internalEventCount: input.internalEventCount,
    requestId: input.requestId,
  });
  if (!dispatch) {
    return null;
  }

  const scheduling = resolveGenesisWorkflowScheduling({
    primaryAgentId: dispatch.primaryAgentId,
    dispatch,
  });
  const plan = resolveGenesisSocietyDispatchPlan({
    dispatch,
    scheduling,
  });
  const updatedAt = input.timestamp ?? Date.now();

  await emitGenesisEnvironmentEvent({
    trigger: "workflow",
    summary: buildEventSummary(input, climateKind),
    intensity: dispatch.intensity,
    sourceRef: input.threadLabel?.trim() || input.primarySessionKey,
  });
  await writeGenesisWorkflowDispatch({
    ...plan,
    runId: input.requestId,
    requestSummary: message,
    updatedAt,
  });

  const summary = readGenesisSocietySummarySync(process.env);
  const provisional: GenesisOperatorChannelResult = {
    climateKind,
    intensity: dispatch.intensity,
    dispatch,
    summary,
    report: {
      title: `${input.channel}:${input.senderLabel?.trim() || input.accountId?.trim() || "operator"}`,
      lines: [],
    },
  };
  return {
    ...provisional,
    report: formatGenesisOperatorChannelReport(provisional),
  };
}
