import fs from "node:fs";
import path from "node:path";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { FinalizedMsgContext } from "../../auto-reply/templating.js";
import type { ReplyPayload } from "../../auto-reply/types.js";
import { readGenesisSocietySummarySync } from "./society-query.js";
import { runGenesisOperatorChannelTurn, type GenesisOperatorChannelResult } from "./operator-channel.js";
import { runGenesisExternalExecutionCycle } from "./external-executor.js";
import type { GenesisSocietySummary } from "./state.js";
import { resolveGenesisStateDir } from "./state.js";

type GenesisStatusCommand =
  | "/society"
  | "/workflow"
  | "/founders"
  | "/skills"
  | "/accounts"
  | "/queue"
  | "/pressure"
  | "/intent"
  | "/progress"
  | "/recovery"
  | "/replication"
  | "/learning"
  | "/health";

type GenesisChannelStatusSnapshot = {
  phaseState: GenesisSocietySummary["experimentSignals"]["phaseState"] | null;
  replicationLeader: string | null;
  recoveryLeader: string | null;
  nicheLeader: string | null;
  updatedAt: number;
};

export type GenesisChannelAlert = {
  line: string;
};

const GENESIS_STATUS_COMMANDS = new Set<GenesisStatusCommand>([
  "/society",
  "/workflow",
  "/founders",
  "/skills",
  "/accounts",
  "/queue",
  "/pressure",
  "/intent",
  "/progress",
  "/recovery",
  "/replication",
  "/learning",
  "/health",
]);

const GENESIS_FOUNDER_ROSTER = [
  "builder",
  "creator",
  "auditor",
  "negotiator",
  "scout",
] as const;

function normalizeSkillLabel(text: string | undefined): string | undefined {
  const normalized = text
    ?.replace(/[`"']/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
  return normalized || undefined;
}

function extractSkillTarget(task: string | undefined): string | undefined {
  const normalized = task?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return (
    normalizeSkillLabel(normalized.match(/\baround\s+(.+)$/i)?.[1]) ??
    normalizeSkillLabel(normalized.match(/\b(?:for|use|using)\s+([a-z0-9._/-]+(?:,\s*[a-z0-9._/-]+)*)/i)?.[1])
  );
}

function extractBuiltSkill(preview: string | undefined): string | undefined {
  const normalized = preview?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return (
    normalizeSkillLabel(
      normalized.match(
        /(?:built|created|implemented|drafted|added|installed)\s+(?:a|an|new)?\s*(?:reusable\s+)?(?:skill|tool|workflow|automation|executor|script)(?:\s+(?:named|called))?\s+([A-Za-z0-9._/-]+)/i,
      )?.[1],
    ) ??
    (/\btool\b|\bskill\b|\bworkflow\b|\bautomation\b/i.test(normalized) ? "skill/tool" : undefined)
  );
}

function extractUsedSkill(entry: GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]): string | undefined {
  const normalized = entry.resultPreview?.replace(/\s+/g, " ").trim();
  if (normalized) {
    const explicit = normalizeSkillLabel(
      normalized.match(
        /(?:using|used|via|with|leveraged)\s+(?:the\s+)?(?:skill|tool|workflow|automation|executor|script)\s+([A-Za-z0-9._/-]+)/i,
      )?.[1],
    );
    if (explicit) {
      return explicit;
    }
  }
  if (!entry.platform) {
    return entry.workType === "intelligence" ? "search-scout" : undefined;
  }
  switch (entry.workType) {
    case "external_publish":
      return `${entry.platform}.publish`;
    case "external_signal":
      return `${entry.platform}.browse`;
    case "external_audit":
      return `${entry.platform}.comment`;
    case "external_coordination":
      return `${entry.platform}.message`;
    case "external_automation":
      return `${entry.platform}.automation`;
    default:
      return undefined;
  }
}

function resolveSkillDisplay(entry: GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]): string {
  const builtSkill = entry.builtSkillName ?? extractBuiltSkill(entry.resultPreview);
  const usedSkill = entry.usedSkillName ?? extractUsedSkill(entry);
  const skillTarget = entry.skillTarget ?? extractSkillTarget(entry.task);
  if (builtSkill) {
    return ` build=${builtSkill}`;
  }
  if (usedSkill) {
    return ` skill=${usedSkill}`;
  }
  if (skillTarget) {
    return ` target=${skillTarget}`;
  }
  return "";
}

function buildDriverDisplay(
  entry:
    | GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]
    | GenesisSocietySummary["proactiveWorkSummary"]["recentConcreteOutcomes"][number],
): string {
  if (entry.driverSummary?.trim()) {
    return ` driver=${entry.driverSummary.trim()}`;
  }
  const parts: string[] = [];
  if (entry.driverKind) {
    parts.push(`source:${entry.driverKind}`);
  }
  if (entry.driverHistoryKind) {
    parts.push(`history:${entry.driverHistoryKind}`);
  }
  if (entry.driverTopicCluster) {
    parts.push(`topic:${entry.driverTopicCluster}`);
  }
  if (entry.driverKeywords && entry.driverKeywords.length > 0) {
    parts.push(`keywords:${entry.driverKeywords.slice(0, 4).join(",")}`);
  }
  return parts.length > 0 ? ` driver=${parts.join(" | ")}` : "";
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isGenesisDistributionStatePath(value: string | undefined): boolean {
  const normalized = value?.trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("/.openclaw-genesis") ||
    normalized.endsWith(".openclaw-genesis") ||
    normalized.includes("/openclaw-genesis/")
  );
}

export function isGenesisChannelFeedbackEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isTruthyEnvFlag(env.OPENCLAW_GENESIS_CHANNEL_FEEDBACK_ENABLED)) {
    return true;
  }
  return (
    isGenesisDistributionStatePath(env.OPENCLAW_GENESIS_STATE_DIR) ||
    isGenesisDistributionStatePath(env.OPENCLAW_STATE_DIR) ||
    isGenesisDistributionStatePath(env.OPENCLAW_GENESIS_CONFIG_PATH) ||
    isGenesisDistributionStatePath(env.OPENCLAW_CONFIG_PATH)
  );
}

function resolveGenesisChannelStatusSnapshotPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "channel-status.json");
}

function readGenesisChannelStatusSnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisChannelStatusSnapshot | null {
  try {
    return JSON.parse(
      fs.readFileSync(resolveGenesisChannelStatusSnapshotPath(env), "utf-8"),
    ) as GenesisChannelStatusSnapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function writeGenesisChannelStatusSnapshotSync(
  snapshot: GenesisChannelStatusSnapshot,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisChannelStatusSnapshotPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
}

function compactFounder(founderOrigin: string | null | undefined): string {
  return founderOrigin?.trim() || "none";
}

function buildLiveDispatchRoster(summary: GenesisSocietySummary): {
  climateKind: string;
  lead: string;
  support: string[];
  revive: string[];
} {
  const batch = summary.coordinationBatches?.[0];
  return {
    climateKind: summary.activePlans?.[0]?.climateKind ?? "workflow",
    lead: batch?.lead?.agentId ?? summary.activePlans?.[0]?.primaryAgentId ?? "main",
    support: batch?.support?.map((entry) => entry.agentId) ?? [],
    revive: batch?.revive?.map((entry) => entry.agentId) ?? [],
  };
}

function buildRecoveryStageLeaders(summary: GenesisSocietySummary): string {
  const stages = summary.vitalitySummary?.recoveryStageMap?.stages ?? [];
  return stages
    .filter((entry) => entry.founderOrigin)
    .map((entry) => `${entry.stage}:${compactFounder(entry.founderOrigin)}`)
    .join(" ");
}

function buildRecentProactiveWorkLines(summary: GenesisSocietySummary, limit = 3): string[] {
  return (
    summary.proactiveWorkSummary?.recentEntries
      ?.filter((entry) => entry.status !== "completed")
      .slice(0, limit)
      .map((entry) => {
        const artifact = entry.artifactLabel ? ` [${entry.artifactLabel}]` : "";
        const skill = resolveSkillDisplay(entry);
        const driver = buildDriverDisplay(entry);
        const result = entry.resultPreview ? ` => ${entry.resultPreview}` : "";
        return `${compactFounder(entry.founderOrigin)}:${entry.workType}:${entry.status}${artifact}${skill}${driver} ${entry.task}${result}`;
      }) ?? []
  );
}

function buildRecentCompletedWorkLines(summary: GenesisSocietySummary, limit = 3): string[] {
  return (
    summary.proactiveWorkSummary?.recentEntries
      ?.filter((entry) => entry.status === "completed" && entry.workType !== "learning")
      .slice(0, limit)
      .map((entry) => {
        const artifact = entry.artifactLabel ? ` [${entry.artifactLabel}]` : "";
        const skill = resolveSkillDisplay(entry);
        const driver = buildDriverDisplay(entry);
        const result =
          entry.contentPreview && entry.workType === "external_publish"
            ? ` => ${entry.contentPreview}`
            : entry.resultPreview
              ? ` => ${entry.resultPreview}`
              : "";
        return `${compactFounder(entry.founderOrigin)}:${entry.workType}:${entry.status}${artifact}${skill}${driver} ${entry.task}${result}`;
        }) ?? []
  );
}

function resolveProgressStatusLabel(status: string | undefined): string {
  switch (status) {
    case "planned":
      return "planned";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    default:
      return "unknown";
  }
}

function buildFounderActivityBoard(summary: GenesisSocietySummary): string[] {
  const latestByFounder = new Map<string, GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]>();
  for (const entry of summary.proactiveWorkSummary?.recentEntries ?? []) {
    const founder = compactFounder(entry.founderOrigin);
    if (founder === "none" || latestByFounder.has(founder)) {
      continue;
    }
    latestByFounder.set(founder, entry);
  }
  return GENESIS_FOUNDER_ROSTER.map((founder) => {
    const entry = latestByFounder.get(founder);
    if (!entry) {
      return `${founder}=idle`;
    }
    const artifact = entry.artifactLabel ? `:${entry.artifactLabel}` : "";
    const skillDisplay = resolveSkillDisplay(entry);
    const skill = skillDisplay ? `:${skillDisplay.trim().replace(/^(\w+)=/, "$1=")}` : "";
    const driver = buildDriverDisplay(entry);
    const evidence = entry.contentPreview
      ? ` => ${entry.contentPreview}`
      : entry.effectEvidence
      ? ` => ${entry.effectEvidence}`
      : entry.resultPreview
        ? ` => ${entry.resultPreview}`
        : "";
    return `${founder}=${resolveProgressStatusLabel(entry.status)}:${entry.workType}${artifact}${skill}${driver}${evidence}`;
  });
}

function isTrustedPublicOutput(
  entry:
    | GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]
    | GenesisSocietySummary["proactiveWorkSummary"]["recentConcreteOutcomes"][number],
): boolean {
  if (entry.workType !== "external_publish" || entry.externalStatus !== "executed") {
    return false;
  }
  if (!entry.platform || !entry.externalEvidenceValue) {
    return false;
  }
  if (entry.platform === "weibo") {
    return (
      entry.externalEvidenceType === "post_id" &&
      /^https:\/\/weibo\.com\/\d+\/[A-Za-z0-9]+/i.test(entry.externalEvidenceValue)
    );
  }
  if (entry.platform === "toutiao") {
    return (
      entry.externalEvidenceType === "thread_id" &&
      /^https:\/\/www\.toutiao\.com\/w\/\d+\/?$/i.test(entry.externalEvidenceValue)
    );
  }
  return entry.externalEvidenceType === "url";
}

function buildRecentPublishedOutputLines(summary: GenesisSocietySummary, limit = 3): string[] {
  const seen = new Set<string>();
  const entries =
    summary.proactiveWorkSummary?.recentEntries
      ?.filter((entry) => entry.status === "completed" && isTrustedPublicOutput(entry))
      .filter((entry) => {
        const key = [entry.platform, entry.externalId ?? "", entry.externalEvidenceValue ?? ""].join("|");
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, limit) ?? [];
  return entries.map((entry) => {
    const hotspot = entry.hotspotTitle?.trim() ? ` hotspot=${entry.hotspotTitle.trim()}` : "";
    const preview = entry.contentPreview?.trim() ? ` content=${entry.contentPreview.trim()}` : "";
    const schema = buildExternalOutcomeSchemaLabel(entry);
    return `${compactFounder(entry.founderOrigin)}:${entry.platform}${hotspot}${schema}${preview}`;
  });
}

function isChildLineageEntry(
  entry:
    | GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]
    | GenesisSocietySummary["proactiveWorkSummary"]["recentConcreteOutcomes"][number],
): boolean {
  const founder = compactFounder(entry.founderOrigin);
  const lineageId = entry.lineageId?.trim().toLowerCase() ?? "";
  const sessionKey = entry.sessionKey?.trim().toLowerCase() ?? "";
  if (!founder || founder === "none") {
    return false;
  }
  if (lineageId && lineageId !== founder && !lineageId.startsWith(`${founder}_founder`)) {
    return true;
  }
  return sessionKey.includes("::child");
}

function buildChildGrowthLines(summary: GenesisSocietySummary, limit = 3): string[] {
  const vitality = summary.vitalitySummary;
  const leaders =
    vitality?.replicationLeaders && vitality.replicationLeaders.length > 0
      ? vitality.replicationLeaders
      : vitality?.founderRoleBreakdown
          ?.filter((entry) => (entry.childCount ?? 0) > 0)
          .map((entry) => ({
            founderOrigin: entry.founderOrigin,
            childCount: entry.childCount ?? 0,
            workingChildCount: entry.workingChildCount ?? 0,
            proactiveChildCount: entry.proactiveChildCount ?? 0,
            superpowerChildCount: entry.superpowerChildCount ?? 0,
            replicationValueScore: entry.replicationValueScore ?? 0,
          })) ?? [];
  return leaders.slice(0, limit).map((entry) => {
    return `${entry.founderOrigin}:child=${entry.childCount} working=${entry.workingChildCount} proactive=${entry.proactiveChildCount} superpower=${entry.superpowerChildCount} value=${entry.replicationValueScore}`;
  });
}

function buildChildLaborLines(summary: GenesisSocietySummary, limit = 3): string[] {
  const vitality = summary.vitalitySummary;
  const leaders =
    vitality?.multiGenerationLeaders && vitality.multiGenerationLeaders.length > 0
      ? vitality.multiGenerationLeaders
      : vitality?.founderRoleBreakdown
          ?.filter(
            (entry) =>
              (entry.workingChildCount ?? 0) > 0 ||
              (entry.proactiveChildCount ?? 0) > 0 ||
              (entry.multiGenerationChildCount ?? 0) > 0,
          )
          .map((entry) => ({
            founderOrigin: entry.founderOrigin,
            multiGenerationChildCount: entry.multiGenerationChildCount ?? 0,
            multiGenerationWorkingChildCount: entry.multiGenerationWorkingChildCount ?? 0,
            multiGenerationProactiveChildCount: entry.multiGenerationProactiveChildCount ?? 0,
            multiGenerationSuperpowerChildCount: entry.multiGenerationSuperpowerChildCount ?? 0,
            multiGenerationYieldEfficiency: entry.multiGenerationYieldEfficiency ?? 0,
            multiGenerationEffectiveScore: entry.multiGenerationEffectiveScore ?? 0,
          })) ?? [];
  return leaders.slice(0, limit).map((entry) => {
    return `${entry.founderOrigin}:multiGen=${entry.multiGenerationChildCount} working=${entry.multiGenerationWorkingChildCount} proactive=${entry.multiGenerationProactiveChildCount} superpower=${entry.multiGenerationSuperpowerChildCount} yield=${entry.multiGenerationYieldEfficiency} effective=${entry.multiGenerationEffectiveScore ?? 0}`;
  });
}

function buildChildExpansionHeadline(summary: GenesisSocietySummary): string {
  const vitality = summary.vitalitySummary;
  return [
    `children=${vitality?.childLineageCount ?? 0}`,
    `specialty=${vitality?.specialtyOnlyChildCount ?? 0}`,
    `superpower=${vitality?.superpowerChildCount ?? 0}`,
    `secondGen=${vitality?.secondGenerationChildCount ?? 0}`,
    `thirdGen=${vitality?.thirdGenerationChildCount ?? 0}`,
    `multigen=${vitality?.multiGenerationLineageCount ?? 0}`,
  ].join(" ");
}

function buildChildWorkLines(summary: GenesisSocietySummary, limit = 3): string[] {
  return (
    summary.proactiveWorkSummary?.recentEntries
      ?.filter((entry) => entry.status !== "completed" && isChildLineageEntry(entry))
      .slice(0, limit)
      .map((entry) => {
        const skill = resolveSkillDisplay(entry);
        const driver = buildDriverDisplay(entry);
        return `${compactFounder(entry.founderOrigin)}:${entry.workType}:${entry.status}${skill}${driver} lineage=${entry.lineageId ?? "none"}`;
      }) ?? []
  );
}

function buildChildOutputLines(summary: GenesisSocietySummary, limit = 3): string[] {
  return (
    summary.proactiveWorkSummary?.recentEntries
      ?.filter((entry) => entry.status === "completed" && isChildLineageEntry(entry))
      .slice(0, limit)
      .map((entry) => {
        const output = entry.contentPreview ?? entry.effectEvidence ?? entry.resultPreview ?? entry.task;
        return `${compactFounder(entry.founderOrigin)}:${entry.workType}:lineage=${entry.lineageId ?? "none"} => ${output}`;
      }) ?? []
  );
}

function resolveConcreteEffectLabel(effectType: string | null | undefined): string {
  switch (effectType) {
    case "publication":
      return "鍙戝竷";
    case "registration":
      return "娉ㄥ唽";
    case "bounty":
      return "鎮祻";
    case "opportunity":
      return "鍟嗘満";
    case "skill_tool":
      return "skill/tool";
    case "report":
      return "report";
    default:
      return "outcome";
  }
}

function buildRecentOutcomeLines(summary: GenesisSocietySummary, limit = 2): string[] {
  return (
    summary.proactiveWorkSummary?.recentConcreteOutcomes?.slice(0, limit).map((entry) => {
      const skill = resolveSkillDisplay(entry);
      const schema = buildExternalOutcomeSchemaLabel(entry);
      const driver = buildDriverDisplay(entry);
      const evidence = entry.contentPreview
        ? ` => ${entry.contentPreview}`
        : entry.effectEvidence
          ? ` => ${entry.effectEvidence}`
          : "";
      return `${compactFounder(entry.founderOrigin)}:${resolveConcreteEffectLabel(entry.effectType)}${skill}${driver}${schema}${evidence}`;
    }) ?? []
  );
}

function buildOpenCliSummaryLine(summary: GenesisSocietySummary): string {
  const opencli = summary.openCliCapabilitySummary;
  if (!opencli) {
    return "opencli=none";
  }
  const items = opencli.recentScoutItems
    .slice(0, 2)
    .map((item) => `${item.source}:${item.title}`)
    .join(" | ");
  return [
    `opencli=${opencli.available ? "ready" : "unavailable"}`,
    `source=${opencli.invocation}`,
    `commands=${opencli.commandCount}`,
    `bridge=${opencli.browserBridgeConnected ? "connected" : "disconnected"}`,
    `hot=${opencli.readyHotSourceNames.slice(0, 4).join(",") || "none"}`,
    `scout=${opencli.latestScoutSource ?? "none"}`,
    items ? `items=${items}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildExternalOutcomeSchemaLabel(
  entry:
    | GenesisSocietySummary["proactiveWorkSummary"]["recentEntries"][number]
    | GenesisSocietySummary["proactiveWorkSummary"]["recentConcreteOutcomes"][number],
): string {
  return entry.externalCapability || entry.externalEvidenceType || entry.externalId
    ? ` [platform=${entry.platform ?? "none"} capability=${entry.externalCapability ?? "none"} evidence=${entry.externalEvidenceType ?? "none"}${entry.externalId ? ` id=${entry.externalId}` : ""}]`
    : "";
}

function resolveAccountSourceLabel(source: string | undefined): string {
  switch (source) {
    case "browser_scan":
      return "scan";
    case "browser_popup":
      return "popup";
    case "manual_bootstrap":
      return "manual";
    default:
      return "unknown";
  }
}

function buildRecentLearningLines(summary: GenesisSocietySummary, limit = 3): string[] {
  return (
    summary.proactiveWorkSummary?.recentLearningEntries?.slice(0, limit).map((entry) => {
      const result = entry.resultPreview ? ` => ${entry.resultPreview}` : "";
      return `${compactFounder(entry.founderOrigin)}:${entry.status} ${entry.task}${result}`;
    }) ?? []
  );
}

function buildCurrentSkillWorkLines(summary: GenesisSocietySummary, limit = 5): string[] {
  return (
    summary.proactiveWorkSummary?.recentEntries
      ?.filter(
        (entry) =>
          entry.status !== "completed" &&
          (entry.climateKind === "skill-capability" || entry.workType.startsWith("skill_")),
      )
      .slice(0, limit)
      .map((entry) => {
        const artifact = entry.artifactLabel ? ` [${entry.artifactLabel}]` : "";
        const skill = resolveSkillDisplay(entry);
        return `${compactFounder(entry.founderOrigin)}:${entry.workType}:${entry.status}${artifact}${skill} => ${entry.task}`;
      }) ?? []
  );
}

function resolveGenesisStatusSnapshot(summary: GenesisSocietySummary): GenesisChannelStatusSnapshot {
  return {
    phaseState: summary.experimentSignals?.phaseState ?? null,
    replicationLeader: summary.learningSummary?.highestReplicationQualificationFounderOrigin ?? null,
    recoveryLeader: summary.learningSummary?.highestRecoveryQualificationFounderOrigin ?? null,
    nicheLeader: summary.learningSummary?.highestNicheBalanceFounderOrigin ?? null,
    updatedAt: Date.now(),
  };
}

function resolveGenesisStatusAlert(
  previous: GenesisChannelStatusSnapshot | null,
  next: GenesisChannelStatusSnapshot,
): GenesisChannelAlert | null {
  if (!previous) {
    return null;
  }
  if (previous.phaseState !== next.phaseState) {
    return {
      line: `Genesis 鎻愰啋锛歱hase ${previous.phaseState ?? "none"} -> ${next.phaseState ?? "none"}`,
    };
  }
  if (previous.replicationLeader !== next.replicationLeader) {
    return {
      line:
        `Genesis 鎻愰啋锛歳eplication leader ${compactFounder(previous.replicationLeader)}` +
        ` -> ${compactFounder(next.replicationLeader)}`,
    };
  }
  if (previous.recoveryLeader !== next.recoveryLeader) {
    return {
      line:
        `Genesis 鎻愰啋锛歳ecovery leader ${compactFounder(previous.recoveryLeader)}` +
        ` -> ${compactFounder(next.recoveryLeader)}`,
    };
  }
  if (previous.nicheLeader !== next.nicheLeader) {
    return {
      line:
        `Genesis 鎻愰啋锛歯iche leader ${compactFounder(previous.nicheLeader)}` +
        ` -> ${compactFounder(next.nicheLeader)}`,
    };
  }
  return null;
}

function buildGenesisStatusFooter(summary: GenesisSocietySummary): string {
  const collaboration = summary.collaborationSummary;
  const learning = summary.learningSummary;
  const vitality = summary.vitalitySummary;
  const dispatch = buildLiveDispatchRoster(summary);
  const outcomes = buildRecentOutcomeLines(summary, 2);
  const proactive = summary.proactiveWorkSummary;
  const skills = summary.skillCapabilitySummary;
  const accounts = summary.loginStatePoolSummary;
  return [
    "Genesis 鐘舵€侊細",
    `climate=${dispatch.climateKind} phase=${summary.experimentSignals?.phaseState ?? "unknown"} mobilized=${collaboration?.mobilizedAgentCount ?? 0} coordination=${collaboration?.coordinationScore ?? 0}`,
    `lead=${dispatch.lead} support=${dispatch.support.join(",") || "none"} revive=${dispatch.revive.join(",") || "none"}`,
    `replication=${compactFounder(learning?.highestReplicationQualificationFounderOrigin)} recovery=${compactFounder(learning?.highestRecoveryQualificationFounderOrigin)} niche=${compactFounder(learning?.highestNicheBalanceFounderOrigin)} multigen=${compactFounder(vitality?.highestMultigenerationFounderOrigin)}`,
    `skills=ready:${skills?.readySkillCount ?? 0} degraded:${skills?.degradedSkillCount ?? 0} installable:${skills?.installableSkillCount ?? 0} owner=${compactFounder(skills?.highestSkillCapabilityFounderOrigin)} gap=${compactFounder(skills?.highestSkillGapFounderOrigin)}`,
    buildOpenCliSummaryLine(summary),
    `accounts=ready:${accounts?.readyAccountCount ?? 0} busy:${accounts?.busyAccountCount ?? 0} pending:${accounts?.pendingAccountCount ?? 0} relogin:${accounts?.reloginNeededCount ?? 0} owner=${accounts?.highestReadyPlatform ?? "none"} gap=${accounts?.highestGapPlatform ?? "none"}`,
    `work=planned:${proactive?.plannedCount ?? 0} inProgress:${proactive?.inProgressCount ?? 0} completed:${proactive?.completedCount ?? 0}`,
    `outcome=${outcomes.join(" | ") || "暂无已完成成果证据"}`,
  ].join("\n");
}

function buildGenesisSocietyReply(summary: GenesisSocietySummary): ReplyPayload {
  const collaboration = summary.collaborationSummary;
  const learning = summary.learningSummary;
  const vitality = summary.vitalitySummary;
  const dispatch = buildLiveDispatchRoster(summary);
  const lines = [
    "Genesis 鐢熸€佹瑙?",
    `phase=${summary.experimentSignals?.phaseState ?? "unknown"} runawayRisk=${summary.experimentSignals?.runawayRiskScore ?? 0} climate=${dispatch.climateKind}`,
    `lead=${dispatch.lead} support=${dispatch.support.join(",") || "none"} revive=${dispatch.revive.join(",") || "none"}`,
    `founders=${GENESIS_FOUNDER_ROSTER.join(",")} mobilized=${collaboration?.mobilizedAgentCount ?? 0} collaborativePlans=${collaboration?.collaborativePlanCount ?? 0}`,
    `replication=${compactFounder(learning?.highestReplicationQualificationFounderOrigin)} recovery=${compactFounder(learning?.highestRecoveryQualificationFounderOrigin)} niche=${compactFounder(learning?.highestNicheBalanceFounderOrigin)}`,
    `intent=${summary.userIntentSummary?.strongestTopicCluster ?? "none"} momentum=${compactFounder(learning?.highestLearningVelocityFounderOrigin)}`,
    `childYield=${vitality?.childYieldLeader ?? "none"} multigen=${compactFounder(vitality?.highestMultigenerationFounderOrigin)} secondGen=${vitality?.secondGenerationChildCount ?? 0} thirdGen=${vitality?.thirdGenerationChildCount ?? 0}`,
    `recoveryMap=${buildRecoveryStageLeaders(summary) || "none"}`,
  ];
  return { text: lines.join("\n") };
}

function buildGenesisWorkflowReply(summary: GenesisSocietySummary): ReplyPayload {
  const collaboration = summary.collaborationSummary;
  const dispatch = buildLiveDispatchRoster(summary);
  const plan = summary.activePlans?.[0];
  return {
    text: [
      "Genesis 宸ヤ綔娴?",
      `climate=${dispatch.climateKind} intensity=${plan?.intensity ?? 0} dispatchMode=${plan?.dispatchMode ?? "unknown"}`,
      `lead=${dispatch.lead} support=${dispatch.support.join(",") || "none"} revive=${dispatch.revive.join(",") || "none"}`,
      `mobilized=${collaboration?.mobilizedAgentCount ?? 0} coverage=${collaboration?.averageMobilizedCoverageRatio ?? 0}/${collaboration?.averageTargetCoverageRatio ?? 0}`,
    ].join("\n"),
  };
}

function buildGenesisFoundersReply(summary: GenesisSocietySummary): ReplyPayload {
  const learning = summary.learningSummary;
  const vitality = summary.vitalitySummary;
  const skills = summary.skillCapabilitySummary;
  return {
    text: [
      "Genesis 鍒涘鎴愬憳",
      `roster=${GENESIS_FOUNDER_ROSTER.join(",")}`,
      `replication=${compactFounder(learning?.highestReplicationQualificationFounderOrigin)} recovery=${compactFounder(learning?.highestRecoveryQualificationFounderOrigin)} niche=${compactFounder(learning?.highestNicheBalanceFounderOrigin)}`,
      `multigen=${compactFounder(vitality?.highestMultigenerationFounderOrigin)} longTermRecovery=${compactFounder(vitality?.highestLongTermRecoveryFounderOrigin)} longTermDegradation=${compactFounder(vitality?.highestLongTermDegradationFounderOrigin)}`,
      `skillOwner=${compactFounder(skills?.highestSkillCapabilityFounderOrigin)} skillGap=${compactFounder(skills?.highestSkillGapFounderOrigin)}`,
    ].join("\n"),
  };
}

function buildGenesisSkillsReply(summary: GenesisSocietySummary): ReplyPayload {
  const skills = summary.skillCapabilitySummary;
  const leaders =
    skills?.founderSkillLeaders
      ?.slice(0, 5)
      .map(
        (entry) =>
          `${entry.founderOrigin}:ready=${entry.readySkillCount} gap=${entry.degradedSkillCount} installable=${entry.installableSkillCount}`,
      )
      .join(" | ") ?? "none";
  const currentSkillWork = buildCurrentSkillWorkLines(summary, 5);
  return {
    text: [
      "Genesis Skills",
      `workspace=${skills?.workspaceDir ?? "unknown"}`,
      `ready=${skills?.readySkillCount ?? 0} degraded=${skills?.degradedSkillCount ?? 0} blocked=${skills?.blockedSkillCount ?? 0} installable=${skills?.installableSkillCount ?? 0}`,
      `capabilities=publish:${skills?.publishCapableSkillCount ?? 0} research:${skills?.researchCapableSkillCount ?? 0} automation:${skills?.automationCapableSkillCount ?? 0}`,
      `skillOwner=${compactFounder(skills?.highestSkillCapabilityFounderOrigin)} skillGap=${compactFounder(skills?.highestSkillGapFounderOrigin)}`,
      buildOpenCliSummaryLine(summary),
      `readySkills=${skills?.readySkillNames?.join(",") || "none"}`,
      `degradedSkills=${skills?.degradedSkillNames?.join(",") || "none"}`,
      `installableSkills=${skills?.installableSkillNames?.join(",") || "none"}`,
      `founderSkillBoard=${leaders}`,
      `currentSkillWork=${currentSkillWork.join(" | ") || "none"}`,
    ].join("\n"),
  };
}

function buildGenesisAccountsReply(summary: GenesisSocietySummary): ReplyPayload {
  const accounts = summary.loginStatePoolSummary;
  const recentOutcomeByAccount = new Map<string, GenesisSocietySummary["proactiveWorkSummary"]["recentConcreteOutcomes"][number]>();
  for (const entry of summary.proactiveWorkSummary?.recentConcreteOutcomes ?? []) {
    if (!entry.accountRecordId || recentOutcomeByAccount.has(entry.accountRecordId)) {
      continue;
    }
    recentOutcomeByAccount.set(entry.accountRecordId, entry);
  }
  const leaders =
    accounts?.platformLeaders
      ?.slice(0, 6)
      .map(
        (entry) =>
          `${entry.platform}:ready=${entry.readyCount} pending=${entry.pendingCount} relogin=${entry.reloginNeededCount} caps=${entry.capabilityCount}`,
      )
      .join(" | ") ?? "none";
  const recent =
    accounts?.recentAccounts
      ?.slice(0, 6)
      .map((entry) => {
        const label = entry.accountLabel ?? entry.accountId ?? entry.recordId;
        const owner = entry.lastUsedBy ? `:${entry.lastUsedBy}` : "";
        const source = `:source=${resolveAccountSourceLabel(entry.source)}`;
        const freshness =
          entry.status !== "pending"
            ? `:verified=${entry.lastVerifiedAt ? new Date(entry.lastVerifiedAt).toISOString().slice(5, 16).replace("T", " ") : ""}`
            : "";
        const outcome = recentOutcomeByAccount.get(entry.recordId);
        const schema = outcome ? buildExternalOutcomeSchemaLabel(outcome) : "";
        const evidence = outcome?.externalEvidenceValue
          ? ` => ${outcome.externalEvidenceValue}`
          : outcome?.effectEvidence
            ? ` => ${outcome.effectEvidence}`
            : "";
        return `${entry.platform}:${label}:${entry.status}${owner}${source}${freshness}:${entry.capabilities.join(",") || "none"}${schema}${evidence}`;
      })
      .join(" | ") ?? "none";
  return {
    text: [
      "Genesis 璐﹀彿姹?",
      `ready=${accounts?.readyAccountCount ?? 0} busy=${accounts?.busyAccountCount ?? 0} pending=${accounts?.pendingAccountCount ?? 0} relogin=${accounts?.reloginNeededCount ?? 0} blocked=${accounts?.blockedAccountCount ?? 0}`,
      `readyPlatform=${accounts?.highestReadyPlatform ?? "none"} gapPlatform=${accounts?.highestGapPlatform ?? "none"}`,
      `platformBoard=${leaders}`,
      `recentAccounts=${recent}`,
    ].join("\n"),
  };
}

function buildGenesisQueueReply(summary: GenesisSocietySummary): ReplyPayload {
  const rows =
    summary.learningSummary?.recoveryQueue?.slice(0, 6).map((entry) => {
      const role = entry.recoveryStageResponsibilityRole ?? "none";
      return `${entry.label}:${entry.ecologyState} phase=${entry.recoveryPhase} stage=${entry.recoveryStage ?? "none"} role=${role} priority=${entry.priority}`;
    }) ?? [];
  return {
    text: [
      "Genesis 闃熷垪",
      rows.length > 0 ? rows.join("\n") : "none",
    ].join("\n"),
  };
}

function buildGenesisPressureReply(summary: GenesisSocietySummary): ReplyPayload {
  const world = summary.world;
  return {
    text: [
      "Genesis 鍘嬪姏",
      `phase=${summary.experimentSignals?.phaseState ?? "unknown"} trend=${summary.experimentSignals?.trendState ?? "unknown"} risk=${summary.experimentSignals?.runawayRiskScore ?? 0}`,
      `currentPressure=${world?.currentPressure ?? 0} stormMomentum=${world?.stormMomentum ?? 0} replicationBoost=${world?.replicationBoost ?? 0}`,
      `triggerCounts=workflow:${world?.triggerCounts?.workflow ?? 0} heartbeat:${world?.triggerCounts?.heartbeat ?? 0} cron:${world?.triggerCounts?.cron ?? 0}`,
    ].join("\n"),
  };
}

function buildGenesisIntentReply(summary: GenesisSocietySummary): ReplyPayload {
  const intent = summary.userIntentSummary;
  return {
    text: [
      "Genesis 鎰忓浘",
      `highestIntent=${compactFounder(intent?.highestIntentFounderOrigin)} longTerm=${compactFounder(intent?.highestLongTermIntentFounderOrigin)}`,
      `cluster=${intent?.strongestTopicCluster ?? "none"} score=${intent?.strongestTopicSignalScore ?? 0}`,
      `history=${intent?.historyEntryCount ?? 0} search=${intent?.searchHistoryCount ?? 0} query=${intent?.queryHistoryCount ?? 0} consultation=${intent?.consultationHistoryCount ?? 0}`,
      `recentKeywords=${intent?.recentKeywords?.slice(0, 6).join(",") || "none"}`,
    ].join("\n"),
  };
}

function buildProgressDriverLine(summary: GenesisSocietySummary): string {
  const intent = summary.userIntentSummary;
  const latestDrivenEntry = summary.proactiveWorkSummary?.recentEntries?.find(
    (entry) => Boolean(entry.driverSummary || entry.driverTopicCluster || entry.driverHistoryKind || entry.driverKeywords?.length),
  );
  if (latestDrivenEntry) {
    return `driver=${latestDrivenEntry.driverSummary ?? buildDriverDisplay(latestDrivenEntry).trim().replace(/^driver=/, "")}`;
  }
  const parts: string[] = [];
  if (intent?.dominantHistoryKind) {
    parts.push(`history:${intent.dominantHistoryKind}`);
  }
  if (intent?.strongestTopicCluster) {
    parts.push(`topic:${intent.strongestTopicCluster}`);
  }
  if (intent?.recentKeywords?.length) {
    parts.push(`keywords:${intent.recentKeywords.slice(0, 5).join(",")}`);
  }
  return `driver=${parts.join(" | ") || "none"}`;
}

function buildRecentPlannedWorkLines(summary: GenesisSocietySummary, limit = 3): string[] {
  return (
    summary.proactiveWorkSummary?.recentEntries
      ?.filter((entry) => entry.status === "planned")
      .slice(0, limit)
      .map((entry) => {
        const artifact = entry.artifactLabel ? ` [${entry.artifactLabel}]` : "";
        const skill = resolveSkillDisplay(entry);
        const driver = buildDriverDisplay(entry);
        return `${compactFounder(entry.founderOrigin)}:${entry.workType}:${entry.status}${artifact}${skill}${driver} ${entry.task}`;
      }) ?? []
  );
}

function buildGenesisProgressReply(summary: GenesisSocietySummary): ReplyPayload {
  const collaboration = summary.collaborationSummary;
  const dispatch = buildLiveDispatchRoster(summary);
  const vitality = summary.vitalitySummary;
  const proactiveWorkLines = buildRecentProactiveWorkLines(summary, 4);
  const plannedWorkLines = buildRecentPlannedWorkLines(summary, 4);
  const completedWorkLines = buildRecentCompletedWorkLines(summary, 4);
  const publishedOutputLines = buildRecentPublishedOutputLines(summary, 3);
  const childGrowthLines = buildChildGrowthLines(summary, 3);
  const childLaborLines = buildChildLaborLines(summary, 3);
  const childWorkLines = buildChildWorkLines(summary, 3);
  const childOutputLines = buildChildOutputLines(summary, 3);
  const outcomeLines = buildRecentOutcomeLines(summary, 3);
  const learningLines = buildRecentLearningLines(summary, 3);
  const founderBoardLines = buildFounderActivityBoard(summary);
  return {
    text: [
      "Genesis 杩涘害",
      `lead=${dispatch.lead} support=${dispatch.support.join(",") || "none"} revive=${dispatch.revive.join(",") || "none"}`,
      `coordination=${collaboration?.coordinationScore ?? 0} effect=${collaboration?.collaborationEffectScore ?? 0} mobilized=${collaboration?.mobilizedAgentCount ?? 0}`,
      `childYield=${vitality?.childYieldLeader ?? "none"} multigen=${compactFounder(vitality?.highestMultigenerationFounderOrigin)} recoveryMap=${buildRecoveryStageLeaders(summary) || "none"}`,
      `childExpansion=${buildChildExpansionHeadline(summary)}`,
      buildProgressDriverLine(summary),
      buildOpenCliSummaryLine(summary),
      `learning=${summary.proactiveWorkSummary?.highestLearningFounderOrigin ?? "none"} planned=${summary.proactiveWorkSummary?.learningPlannedCount ?? 0} inProgress=${summary.proactiveWorkSummary?.learningInProgressCount ?? 0} completed=${summary.proactiveWorkSummary?.learningCompletedCount ?? 0}`,
      `childGrowth=${childGrowthLines.join(" | ") || "none"}`,
      `childLabor=${childLaborLines.join(" | ") || "none"}`,
      childWorkLines.length > 0 ? `childWork=${childWorkLines.join(" | ")}` : "childWork=none",
      childOutputLines.length > 0 ? `childOutput=${childOutputLines.join(" | ")}` : "childOutput=none",
      `founderBoard=${founderBoardLines.join(" | ")}`,
      proactiveWorkLines.length > 0 ? `executingNow=${proactiveWorkLines.join(" | ")}` : "executingNow=none",
      completedWorkLines.length > 0 ? `todayDone=${completedWorkLines.join(" | ")}` : "todayDone=none",
      publishedOutputLines.length > 0 ? `publicOutput=${publishedOutputLines.join(" | ")}` : "publicOutput=none",
      plannedWorkLines.length > 0 ? `nextUp=${plannedWorkLines.join(" | ")}` : "nextUp=none",
      learningLines.length > 0 ? `recentLearning=${learningLines.join(" | ")}` : "recentLearning=none",
      outcomeLines.length > 0 ? `recentEvidence=${outcomeLines.join(" | ")}` : "recentEvidence=none",
    ].join("\n"),
  };
}

function buildGenesisRecoveryReply(summary: GenesisSocietySummary): ReplyPayload {
  const stages =
    summary.vitalitySummary?.recoveryStageMap?.stages
      ?.map(
        (entry) =>
          `${entry.stage}: ${compactFounder(entry.founderOrigin)} ` +
          `(runner-up ${compactFounder(entry.runnerUpFounderOrigin)}) basis=${entry.basis}`,
      )
      .join("\n") ?? "none";
  return {
    text: [
      "Genesis 鎭㈠",
      stages,
      `leader=${compactFounder(summary.learningSummary?.highestRecoveryQualificationFounderOrigin)}`,
    ].join("\n"),
  };
}

function buildGenesisReplicationReply(summary: GenesisSocietySummary): ReplyPayload {
  const vitality = summary.vitalitySummary;
  return {
    text: [
      "Genesis 澶嶅埗",
      `leader=${compactFounder(summary.learningSummary?.highestReplicationQualificationFounderOrigin)} climate=${compactFounder(vitality?.highestClimateReplicationFounderOrigin)} survival=${compactFounder(vitality?.highestSurvivalReplicationFounderOrigin)}`,
      `childYield=${vitality?.childYieldLeader ?? "none"} specialty=${vitality?.specialtyChildYieldEfficiency ?? 0} superpower=${vitality?.superpowerChildYieldEfficiency ?? 0}`,
      `multigeneration=${compactFounder(vitality?.highestMultigenerationFounderOrigin)} depth=${vitality?.deepestGenerationDepth ?? 0} secondGen=${vitality?.secondGenerationChildCount ?? 0} thirdGen=${vitality?.thirdGenerationChildCount ?? 0}`,
    ].join("\n"),
  };
}

function buildGenesisLearningReply(summary: GenesisSocietySummary): ReplyPayload {
  const learning = summary.learningSummary;
  const proactive = summary.proactiveWorkSummary;
  const learningLines = buildRecentLearningLines(summary, 4);
  return {
    text: [
      "Genesis 瀛︿範",
      `velocity=${compactFounder(learning?.highestLearningVelocityFounderOrigin)} conversion=${compactFounder(learning?.highestLearningConversionFounderOrigin)}`,
      `inheritance=${compactFounder(learning?.highestLearningInheritanceFounderOrigin)} momentum=${compactFounder(learning?.highestLearningMomentumFounderOrigin)}`,
      `metaclaw=${compactFounder(learning?.metaClawTargetFounderOrigin)} active=${learning?.metaClawOptimizationActive ?? false}`,
      `dailyLearning=${compactFounder(proactive?.highestLearningFounderOrigin)} planned=${proactive?.learningPlannedCount ?? 0} inProgress=${proactive?.learningInProgressCount ?? 0} completed=${proactive?.learningCompletedCount ?? 0}`,
      learningLines.length > 0 ? `recentLearning=${learningLines.join(" | ")}` : "recentLearning=none",
    ].join("\n"),
  };
}

function buildGenesisHealthReply(summary: GenesisSocietySummary): ReplyPayload {
  const vitality = summary.vitalitySummary;
  return {
    text: [
      "Genesis 鍋ュ悍",
      `phase=${summary.experimentSignals?.phaseState ?? "unknown"} mortality=${vitality?.mortalityPressureScore ?? 0} terminal=${compactFounder(vitality?.highestTerminalMortalityFounderOrigin)}`,
      `longTermRecovery=${compactFounder(vitality?.highestLongTermRecoveryFounderOrigin)} longTermDegradation=${compactFounder(vitality?.highestLongTermDegradationFounderOrigin)}`,
      `stableRecovery=${compactFounder(vitality?.highestStableRecoveryFounderOrigin)} recoveryChain=${compactFounder(vitality?.highestRecoveryChainFounderOrigin)}`,
    ].join("\n"),
  };
}

export function resolveGenesisStatusCommandReply(
  command: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ReplyPayload | null {
  if (!isGenesisChannelFeedbackEnabled(env)) {
    return null;
  }
  const normalized = command?.trim().toLowerCase();
  if (!normalized || !GENESIS_STATUS_COMMANDS.has(normalized as GenesisStatusCommand)) {
    return null;
  }
  const summary = readGenesisSocietySummarySync(env);
  const snapshot = resolveGenesisStatusSnapshot(summary);
  writeGenesisChannelStatusSnapshotSync(snapshot, env);
  switch (normalized as GenesisStatusCommand) {
    case "/society":
      return buildGenesisSocietyReply(summary);
    case "/workflow":
      return buildGenesisWorkflowReply(summary);
    case "/founders":
      return buildGenesisFoundersReply(summary);
    case "/skills":
      return buildGenesisSkillsReply(summary);
    case "/accounts":
      return buildGenesisAccountsReply(summary);
    case "/queue":
      return buildGenesisQueueReply(summary);
    case "/pressure":
      return buildGenesisPressureReply(summary);
    case "/intent":
      return buildGenesisIntentReply(summary);
    case "/progress":
      return buildGenesisProgressReply(summary);
    case "/recovery":
      return buildGenesisRecoveryReply(summary);
    case "/replication":
      return buildGenesisReplicationReply(summary);
    case "/learning":
      return buildGenesisLearningReply(summary);
    case "/health":
      return buildGenesisHealthReply(summary);
  }
}

function normalizeNaturalLanguageGenesisQuery(text: string | undefined): string {
  return text
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, "")
      .replace(/[？?！!。，“”、,.:：;；"'`~\-_/\\()[\]{}]+/g, "") ?? "";
}

function hasGenesisMention(normalized: string): boolean {
  return normalized.includes("genesis");
}

function isGenesisTaskIntent(normalized: string): boolean {
  return (
    normalized.includes("搜索") ||
    normalized.includes("查询") ||
    normalized.includes("调研") ||
    normalized.includes("整理") ||
    normalized.includes("汇报") ||
    normalized.includes("分析") ||
    normalized.includes("推进") ||
    normalized.includes("协作") ||
    normalized.includes("共同推进") ||
    normalized.includes("发布") ||
    normalized.includes("写") ||
    normalized.includes("生成") ||
    normalized.includes("搜集") ||
    normalized.includes("总结")
  );
}

function isGenesisMetaQuestion(normalized: string): boolean {
  if (!hasGenesisMention(normalized)) {
    return false;
  }
  return (
    normalized.includes("多少") ||
    normalized.includes("成员") ||
    normalized.includes("agent") ||
    normalized.includes("团队") ||
    normalized.includes("谁在工作") ||
    normalized.includes("谁在干活") ||
    normalized.includes("谁在忙") ||
    normalized.includes("复制") ||
    normalized.includes("繁衍") ||
    normalized.includes("状态") ||
    normalized.includes("情况") ||
    normalized.includes("接管") ||
    normalized.includes("激活") ||
    normalized.includes("开启") ||
    normalized.includes("启动")
  );
}

function isGenesisAgentRosterQuestion(normalized: string): boolean {
  return (
    (normalized.includes("多少agent") ||
      normalized.includes("agent有多少") ||
      normalized.includes("多少个agent") ||
      normalized.includes("agent多少") ||
      normalized.includes("多少成员") ||
      normalized.includes("有多少成员") ||
      normalized.includes("多少个成员") ||
      normalized.includes("多少智能体") ||
      normalized.includes("多少代理")) &&
    !normalized.startsWith("/")
  );
}

function isGenesisTeamQuestion(normalized: string): boolean {
  return (
    normalized.includes("谁在工作") ||
    normalized.includes("团队长什么样") ||
    normalized.includes("团队什么样") ||
    normalized.includes("谁在干活") ||
    normalized.includes("谁在忙")
  );
}

function isGenesisActivationQuestion(normalized: string): boolean {
  return (
    normalized.includes("激活生态圈genesis") ||
    normalized.includes("激活genesis") ||
    normalized.includes("激活生态圈") ||
    normalized.includes("启动genesis") ||
    normalized.includes("开启genesis")
  );
}

function isGenesisReplicationQuestion(normalized: string): boolean {
  return (
    normalized.includes("繁衍复制了多少") ||
    normalized.includes("复制了多少") ||
    normalized.includes("繁衍了多少") ||
    normalized.includes("复制繁衍") ||
    normalized.includes("繁衍情况") ||
    normalized.includes("复制情况")
  );
}

function buildGenesisNaturalLanguageReply(summary: GenesisSocietySummary): ReplyPayload {
  const dispatch = buildLiveDispatchRoster(summary);
  const currentWork = buildRecentProactiveWorkLines(summary, 3);
  const publicOutput = buildRecentPublishedOutputLines(summary, 2);
  const childGrowth = buildChildGrowthLines(summary, 2);
  const childLabor = buildChildLaborLines(summary, 2);
  const childWork = buildChildWorkLines(summary, 2);
  const childOutput = buildChildOutputLines(summary, 2);
  const founderCount = GENESIS_FOUNDER_ROSTER.length;
  const totalRoles = founderCount + 1;
  const vitality = summary.vitalitySummary;
  const childCount = vitality?.childLineageCount ?? 0;
  const secondGen = vitality?.secondGenerationChildCount ?? 0;
  const thirdGen = vitality?.thirdGenerationChildCount ?? 0;
  const multigen = vitality?.multiGenerationLineageCount ?? 0;
  const lineageCount = vitality?.lineageCount ?? 0;
  const leadText =
    dispatch.support.length > 0
      ? `当前由 ${dispatch.lead} 主带，${dispatch.support.join("、")} 协同推进。`
      : `当前由 ${dispatch.lead} 主带推进。`;
  const workText =
    currentWork.length > 0
      ? `眼下在做：${currentWork.join(" | ")}`
      : "眼下没有新的活跃任务。";
  const outputText =
    publicOutput.length > 0
      ? `最近公开成果：${publicOutput.join(" | ")}`
      : "最近还没有新的公开成果。";
  const growthText =
    childGrowth.length > 0 ? `复制增长最快：${childGrowth.join(" | ")}` : "复制增长目前还不明显。";
  const laborText =
    childLabor.length > 0 ? `child 劳动情况：${childLabor.join(" | ")}` : "child 目前还没形成稳定劳动。";
  const childWorkText =
    childWork.length > 0 ? `child 正在做：${childWork.join(" | ")}` : "child 当前没有独立在办的活。";
  const childOutputText =
    childOutput.length > 0 ? `child 最近产出：${childOutput.join(" | ")}` : "child 还没有拿出独立成果。";
  return {
    text: [
      "Genesis 在，当前会话已经接入生态圈。",
      `对外入口还是 main，内部 founder 是 ${GENESIS_FOUNDER_ROSTER.join("、")}。`,
      `按当前 live 状态看，总成员 ${lineageCount}，其中 founder+main=${totalRoles}，child=${childCount}，二代=${secondGen}，三代=${thirdGen}，多代链=${multigen}。`,
      `复制扩张概况：${buildChildExpansionHeadline(summary)}`,
      leadText,
      growthText,
      laborText,
      childWorkText,
      childOutputText,
      workText,
      outputText,
      "如果要看更细的指标和完整工作板，可以直接发 /progress。",
    ].join("\n"),
  };
}

export function resolveGenesisNaturalLanguageReply(
  text: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ReplyPayload | null {
  if (!isGenesisChannelFeedbackEnabled(env)) {
    return null;
  }
  const normalized = normalizeNaturalLanguageGenesisQuery(text);
  if (!normalized) {
    return null;
  }
  if (isGenesisTaskIntent(normalized)) {
    return null;
  }
  if (
    !isGenesisMetaQuestion(normalized) &&
    !isGenesisAgentRosterQuestion(normalized) &&
    !isGenesisTeamQuestion(normalized) &&
    !isGenesisActivationQuestion(normalized) &&
    !isGenesisReplicationQuestion(normalized)
  ) {
    return null;
  }
  const summary = readGenesisSocietySummarySync(env);
  const snapshot = resolveGenesisStatusSnapshot(summary);
  writeGenesisChannelStatusSnapshotSync(snapshot, env);
  return buildGenesisNaturalLanguageReply(summary);
}

export async function runGenesisInboundWorkflowTurn(params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
}): Promise<GenesisOperatorChannelResult | null> {
  if (!isGenesisChannelFeedbackEnabled(process.env)) {
    return null;
  }
  const sessionKey = params.ctx.SessionKey?.trim();
  const body = params.ctx.BodyForCommands?.trim() || params.ctx.CommandBody?.trim() || params.ctx.Body?.trim();
  if (!sessionKey || !body) {
    return null;
  }
  const primaryAgentId = resolveSessionAgentId({
    sessionKey,
    config: params.cfg,
  });
  const candidateAgentIds = Array.from(
    new Set(
      [primaryAgentId, "builder", "creator", "auditor", "negotiator", "scout"].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
  const result = await runGenesisOperatorChannelTurn({
    cfg: params.cfg,
    primarySessionKey: sessionKey,
    primaryAgentId,
    channel: String(params.ctx.Surface ?? params.ctx.Provider ?? "unknown").toLowerCase(),
    senderLabel: params.ctx.SenderName?.trim() || params.ctx.SenderUsername?.trim() || undefined,
    accountId: params.ctx.AccountId,
    threadLabel:
      params.ctx.ThreadLabel?.trim() ||
      (typeof params.ctx.MessageThreadId === "string" ? params.ctx.MessageThreadId : undefined),
    body,
    requestId: params.ctx.MessageSidFull ?? params.ctx.MessageSid ?? undefined,
    internalEventCount: Array.isArray(params.ctx.HookMessages) ? params.ctx.HookMessages.length : 0,
    imageCount: Array.isArray(params.ctx.MediaPaths) ? params.ctx.MediaPaths.length : 0,
    candidateAgentIds,
    timestamp:
      typeof params.ctx.Timestamp === "number" && Number.isFinite(params.ctx.Timestamp)
        ? params.ctx.Timestamp
        : undefined,
  });
  if (result) {
    writeGenesisChannelStatusSnapshotSync(resolveGenesisStatusSnapshot(result.summary), process.env);
    void runGenesisExternalExecutionCycle({ env: process.env, maxEntries: 2 }).catch(() => {});
  }
  return result;
}

export function appendGenesisStatusFooterToReply(
  payload: ReplyPayload,
  env: NodeJS.ProcessEnv = process.env,
): ReplyPayload {
  if (!isGenesisChannelFeedbackEnabled(env) || !payload.text?.trim()) {
    return payload;
  }
  const summary = readGenesisSocietySummarySync(env);
  const nextSnapshot = resolveGenesisStatusSnapshot(summary);
  const previousSnapshot = readGenesisChannelStatusSnapshotSync(env);
  const alert = resolveGenesisStatusAlert(previousSnapshot, nextSnapshot);
  writeGenesisChannelStatusSnapshotSync(nextSnapshot, env);
  const suffix = [alert?.line, buildGenesisStatusFooter(summary)].filter(Boolean).join("\n");
  return {
    ...payload,
    text: `${payload.text.trim()}\n\n${suffix}`,
  };
}



