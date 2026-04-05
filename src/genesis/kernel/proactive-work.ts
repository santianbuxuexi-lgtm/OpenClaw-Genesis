import fs from "node:fs";
import path from "node:path";
import {
  readJsonFileSync,
  readGenesisWorldStateSync,
  resolveGenesisProactiveWorkLogPath,
  resolveGenesisProactiveWorkSummaryPath,
  resolveGenesisStateDir,
  type GenesisProactiveWorkEntry,
  type GenesisProactiveWorkSummary,
  type GenesisLineageRecord,
  type GenesisPlatformAccountRecord,
  type GenesisPlatformCapability,
  type GenesisSkillCapabilitySummary,
} from "./state.js";
import { resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import {
  resolveFounderPreviewForSession,
  type GenesisFounderResultDigest,
} from "./founder-result-digest.js";
import type { GenesisSocietySummary } from "./state.js";
import { readGenesisUserIntentSummarySnapshotSync } from "./user-intent.js";
import {
  acquireGenesisPlatformAccountSync,
  releaseGenesisPlatformAccountSync,
  readGenesisLoginStatePoolSummarySync,
} from "./login-state-pool.js";
import { readGenesisEventLogSummarySnapshotSync, type GenesisEventLogSummary } from "./event-log.js";
import {
  appendGenesisDailyTrafficLogEntrySync,
  buildGenesisTrafficFingerprint,
  wasGenesisTrafficPublishedRecentlySync,
} from "./daily-traffic-log.js";

const KNOWN_FOUNDERS = ["scout", "builder", "creator", "auditor", "negotiator"] as const;

type GenesisFounderOrigin = (typeof KNOWN_FOUNDERS)[number];

const DEFAULT_GENESIS_PROACTIVE_WORK_SUMMARY: GenesisProactiveWorkSummary = {
  totalEntryCount: 0,
  plannedCount: 0,
  inProgressCount: 0,
  completedCount: 0,
  learningPlannedCount: 0,
  learningInProgressCount: 0,
  learningCompletedCount: 0,
  activeLearningFounderCount: 0,
  activeFounderCount: 0,
  highestActiveFounderOrigin: null,
  highestActiveFounderScore: 0,
  highestLearningFounderOrigin: null,
  concreteOutcomeCount: 0,
  highestConcreteOutcomeFounderOrigin: null,
  founderActivityLeaders: [],
  recentLearningEntries: [],
  recentLearningOutcomes: [],
  recentConcreteOutcomes: [],
  recentEntries: [],
};

function resolveDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function resolveExternalExecutionSlotKey(ts: number, slotHours = 2): string {
  const date = new Date(ts);
  const utcHour = Math.floor(date.getUTCHours() / slotHours) * slotHours;
  return `${date.toISOString().slice(0, 10)}T${String(utcHour).padStart(2, "0")}`;
}

const EXTERNAL_WORK_STALE_MS = 90 * 60 * 1000;
const GENERIC_FOUNDER_WORK_STALE_MS = 2 * 60 * 60 * 1000;
const GENERIC_FOUNDER_WORK_FORCE_RECLAIM_MS = 8 * 60 * 60 * 1000;

function readJsonLinesSync<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function normalizePreview(text: string | undefined): string | undefined {
  const normalized = text?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 220) : undefined;
}

function normalizeSkillLabel(text: string | undefined): string | undefined {
  const normalized = text
    ?.replace(/[`"'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
  return normalized || undefined;
}

function extractSkillTargetFromTask(task: string | undefined): string | undefined {
  const normalized = normalizePreview(task);
  if (!normalized) {
    return undefined;
  }
  const aroundMatch = normalized.match(/\baround\s+(.+)$/i)?.[1];
  if (aroundMatch) {
    return normalizeSkillLabel(aroundMatch);
  }
  const namedMatch = normalized.match(/\b(?:for|using|use|build|close)\s+([a-z0-9._/-]+(?:,\s*[a-z0-9._/-]+)*)/i)?.[1];
  return normalizeSkillLabel(namedMatch);
}

function extractBuiltSkillName(preview: string | undefined): string | undefined {
  const normalized = normalizePreview(preview);
  if (!normalized) {
    return undefined;
  }
  const fallback = normalizeSkillLabel(
    normalized.match(/([A-Za-z0-9._/-]+)\s+(?:skill|tool|workflow|automation|executor|script)/i)?.[1],
  );
  const blockedFallbacks = new Set(["using", "used", "via", "with", "the", "a", "an"]);
  return (
    normalizeSkillLabel(
      normalized.match(
        /(?:built|created|implemented|drafted|added|installed)\s+(?:a|an|new)?\s*(?:reusable\s+)?(?:skill|tool|workflow|automation|executor|script)(?:\s+(?:named|called))?\s+([A-Za-z0-9._/-]+)/i,
      )?.[1],
    ) ?? (fallback && !blockedFallbacks.has(fallback.toLowerCase()) ? fallback : undefined)
  );
}

function extractUsedSkillName(preview: string | undefined): string | undefined {
  const normalized = normalizePreview(preview);
  if (!normalized) {
    return undefined;
  }
  return (
    normalizeSkillLabel(
      normalized.match(
        /(?:using|used|via|with|leveraged)\s+(?:the\s+)?(?:skill|tool|workflow|automation|executor|script)\s+([A-Za-z0-9._/-]+)/i,
      )?.[1],
    ) ??
    normalizeSkillLabel(normalized.match(/`([^`]+)`/)?.[1])
  );
}

function resolveExternalSkillName(entry: GenesisProactiveWorkEntry): string | undefined {
  if (!entry.platform) {
    return undefined;
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

function resolveExecutionStage(entry: GenesisProactiveWorkEntry): GenesisProactiveWorkEntry["executionStage"] {
  switch (entry.workType) {
    case "skill_check":
      return "skill_check";
    case "skill_build":
      return "skill_build";
    case "skill_plan":
    case "skill_audit":
    case "skill_coordination":
      return "skill_use";
    case "tooling":
      return entry.status === "completed" ? "skill_build" : "execute";
    case "external_publish":
    case "external_signal":
    case "external_audit":
    case "external_coordination":
    case "external_automation":
    case "synthesis":
    case "audit":
    case "coordination":
    case "intelligence":
      return "execute";
    default:
      return entry.executionStage ?? null;
  }
}

function resolveSkillExecutionMetadata(entry: GenesisProactiveWorkEntry): Pick<
  GenesisProactiveWorkEntry,
  "executionStage" | "skillTarget" | "usedSkillName" | "builtSkillName"
> {
  const executionStage = resolveExecutionStage(entry);
  const skillTarget = entry.skillTarget ?? extractSkillTargetFromTask(entry.task);
  const explicitBuiltSkill = extractBuiltSkillName(entry.resultPreview);
  const explicitUsedSkill = extractUsedSkillName(entry.resultPreview);
  const externalSkill = resolveExternalSkillName(entry);
  let builtSkillName = entry.builtSkillName ?? explicitBuiltSkill;
  let usedSkillName = entry.usedSkillName ?? explicitUsedSkill;

  if (!builtSkillName && executionStage === "skill_build") {
    builtSkillName = skillTarget ?? (entry.artifactLabel === "skill/tool" ? "skill/tool" : undefined);
  }
  if (!usedSkillName && executionStage === "skill_use") {
    usedSkillName = skillTarget;
  }
  if (!usedSkillName && executionStage === "execute") {
    usedSkillName = externalSkill;
  }

  return {
    executionStage,
    skillTarget,
    usedSkillName,
    builtSkillName,
  };
}

function sanitizeLegacyExternalOutcome(
  entry: GenesisProactiveWorkEntry,
): GenesisProactiveWorkEntry {
  if (
    entry.platform &&
    entry.workType.startsWith("external_") &&
    entry.status === "completed" &&
    previewMentionsDifferentPlatform(entry, [
      entry.resultPreview,
      entry.effectEvidence,
      entry.externalEvidenceValue,
    ].join("\n"))
  ) {
    return {
      ...entry,
      status: "in_progress",
      effectType: null,
      effectEvidence: undefined,
      externalCapability: undefined,
      externalStatus: null,
      externalEvidenceType: null,
      externalEvidenceValue: undefined,
      externalId: undefined,
    };
  }
  if (
    entry.platform === "toutiao" &&
    entry.workType === "external_publish" &&
    entry.status === "completed"
  ) {
    const evidence = entry.effectEvidence ?? "";
    const preview = entry.resultPreview ?? "";
    const hasThreadEvidence =
      /thread_id=\d+/i.test(evidence) ||
      /thread_id=\d+/i.test(preview) ||
      /\/weitoutiao\/manage\?thread_id=/i.test(evidence) ||
      /\/weitoutiao\/manage\?thread_id=/i.test(preview);
    const legacyGraphicPublish =
      /\/graphic\/publish/i.test(evidence) || /\/graphic\/publish/i.test(preview);
    if (!hasThreadEvidence && legacyGraphicPublish) {
      return {
        ...entry,
        status: "in_progress",
        effectType: null,
        effectEvidence: undefined,
      };
    }
  }
  if (
    entry.platform === "weibo" &&
    entry.workType === "external_publish" &&
    entry.status === "completed"
  ) {
    const evidence = entry.effectEvidence ?? "";
    const preview = entry.resultPreview ?? "";
    const hasPostEvidence =
      /https?:\/\/weibo\.com\/\d+\/[A-Za-z0-9]+/i.test(evidence) ||
      /https?:\/\/weibo\.com\/\d+\/[A-Za-z0-9]+/i.test(preview) ||
      entry.externalEvidenceType === "post_id" ||
      Boolean(entry.externalId);
    const legacyHomeEvidence =
      /^https?:\/\/weibo\.com\/?$/i.test(evidence.trim()) ||
      /^https?:\/\/weibo\.com\/?$/i.test(preview.trim());
    if (!hasPostEvidence && legacyHomeEvidence) {
      return {
        ...entry,
        status: "in_progress",
        effectType: null,
        effectEvidence: undefined,
      };
    }
  }
  return entry;
}

const EXTERNAL_PLATFORM_MARKERS = {
  weibo: [
    /weibo/i,
    /weibo\.com/i,
    /statuses\/update/i,
    /post_id=/i,
    /mblogid/i,
  ],
  toutiao: [
    /toutiao/i,
    /mp\.toutiao\.com/i,
    /thread_id=/i,
    /weitoutiao/i,
    /spell_check_apply/i,
    /creator_helper/i,
  ],
  github: [
    /github/i,
    /gist\.github\.com/i,
    /api\/v3\/gists/i,
  ],
  tiktok: [
    /tiktok/i,
    /tiktok\.com/i,
    /tiktokstudio/i,
  ],
} satisfies Record<string, RegExp[]>;

function inferPlatformMentionFromPreview(preview: string | undefined): string | null {
  const normalized = normalizePreview(preview)?.toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  for (const [platform, markers] of Object.entries(EXTERNAL_PLATFORM_MARKERS)) {
    if (markers.some((marker) => marker.test(normalized))) {
      return platform;
    }
  }
  return null;
}

function previewMentionsDifferentPlatform(
  entry: GenesisProactiveWorkEntry,
  preview: string | undefined,
): boolean {
  const mentionedPlatform = inferPlatformMentionFromPreview(preview);
  return Boolean(mentionedPlatform && entry.platform && mentionedPlatform !== entry.platform);
}

function normalizeHotspotDrivenPublishTask(entry: GenesisProactiveWorkEntry): GenesisProactiveWorkEntry {
  if (entry.workType !== "external_publish") {
    return entry;
  }
  const marker = " | turn this hotspot into a concise social update about ";
  if (!entry.task.includes(marker)) {
    return entry;
  }
  const [hotspotText, baseObjective] = entry.task.split(marker, 2);
  if (!hotspotText || !baseObjective) {
    return entry;
  }
  const socialFormat =
    entry.platform === "toutiao"
      ? "<=500-char image-backed micro-headline commentary with depth, literary tone, and no news restatement"
      : entry.platform === "weibo"
        ? "<=500-char image-backed weibo commentary post with depth, literary tone, and no news restatement"
        : "<=500-char image-backed commentary post with depth, literary tone, and no news restatement";
  return {
    ...entry,
    task: `${hotspotText} | shape this hotspot into a ${socialFormat} about ${baseObjective}`,
  };
}

function isSupersededExternalInProgress(
  entry: GenesisProactiveWorkEntry,
  allEntries: GenesisProactiveWorkEntry[],
): boolean {
  if (entry.status !== "in_progress" || !entry.workType.startsWith("external_")) {
    return false;
  }
  return allEntries.some((candidate) => {
    if (candidate.workId === entry.workId) {
      return false;
    }
    if (candidate.status !== "completed" || !candidate.workType.startsWith("external_")) {
      return false;
    }
    if ((candidate.updatedAt ?? 0) <= (entry.updatedAt ?? 0)) {
      return false;
    }
    if (candidate.founderOrigin !== entry.founderOrigin) {
      return false;
    }
    if (candidate.platform !== entry.platform) {
      return false;
    }
    if (candidate.workType !== entry.workType) {
      return false;
    }
    if (entry.accountRecordId && candidate.accountRecordId && candidate.accountRecordId !== entry.accountRecordId) {
      return false;
    }
    return true;
  });
}

function resolveExternalInProgressDriverScore(entry: GenesisProactiveWorkEntry): number {
  if (entry.status !== "in_progress" || !entry.workType.startsWith("external_")) {
    return -1;
  }
  let score = 0;
  if (entry.driverKind === "history") {
    score += 4;
  } else if (entry.driverKind && entry.driverKind !== "fallback") {
    score += 2;
  }
  if (entry.driverHistoryKind) {
    score += 2;
  }
  if (entry.driverTopicCluster) {
    score += 1;
  }
  score += Math.min(entry.driverKeywords?.length ?? 0, 4);
  if (entry.driverSummary?.includes("history:")) {
    score += 2;
  }
  const task = entry.task.toLowerCase();
  if (/(https?:\/\/|www\.)/.test(task)) {
    score += 4;
  }
  if (task.includes("hotspot") || task.includes("headline") || task.includes("trend")) {
    score += 2;
  }
  if (task.includes("88-char") || task.includes("micro-headline") || task.includes("short post")) {
    score += 2;
  }
  return score;
}

function isSupersededExternalInProgressByNewerDrivenTask(
  entry: GenesisProactiveWorkEntry,
  allEntries: GenesisProactiveWorkEntry[],
): boolean {
  if (entry.status !== "in_progress" || !entry.workType.startsWith("external_")) {
    return false;
  }
  const entryScore = resolveExternalInProgressDriverScore(entry);
  return allEntries.some((candidate) => {
    if (candidate.workId === entry.workId) {
      return false;
    }
    if (candidate.status !== "in_progress" || !candidate.workType.startsWith("external_")) {
      return false;
    }
    if ((candidate.updatedAt ?? 0) <= (entry.updatedAt ?? 0)) {
      return false;
    }
    if (candidate.founderOrigin !== entry.founderOrigin) {
      return false;
    }
    if (candidate.platform !== entry.platform) {
      return false;
    }
    if (candidate.workType !== entry.workType) {
      return false;
    }
    return resolveExternalInProgressDriverScore(candidate) > entryScore;
  });
}

function shouldReplaceExistingExternalTask(params: {
  existingEntry: GenesisProactiveWorkEntry;
  nextEntry: GenesisProactiveWorkEntry;
  ts: number;
}): boolean {
  const existing = params.existingEntry;
  const next = params.nextEntry;
  if (existing.status === "completed" || !existing.workType.startsWith("external_")) {
    return false;
  }
  if (existing.founderOrigin !== next.founderOrigin || existing.platform !== next.platform) {
    return false;
  }
  if (existing.workType !== next.workType) {
    return false;
  }
  if (params.ts - (existing.updatedAt ?? existing.ts ?? 0) >= EXTERNAL_WORK_STALE_MS) {
    return false;
  }
  const existingScore = resolveExternalInProgressDriverScore(existing);
  const nextScore = resolveExternalInProgressDriverScore(next);
  const existingFingerprint = existing.trafficFingerprint ?? null;
  const nextFingerprint = next.trafficFingerprint ?? null;
  if (nextFingerprint && existingFingerprint && nextFingerprint === existingFingerprint) {
    return false;
  }
  if (next.driverKind === "hotspot" && existing.driverKind !== "hotspot") {
    return true;
  }
  if (next.hotspotTitle && !existing.hotspotTitle) {
    return true;
  }
  return nextScore > existingScore + 2;
}

function extractExternalHotspotUrl(entry: GenesisProactiveWorkEntry): string | null {
  const taskUrl = entry.task.match(/https?:\/\/\S+/i)?.[0]?.trim();
  if (taskUrl) {
    return taskUrl;
  }
  const evidenceUrl = (entry.externalEvidenceValue ?? entry.effectEvidence ?? "").match(/https?:\/\/\S+/i)?.[0]?.trim();
  return evidenceUrl || null;
}

function isSupersededExternalInProgressByCompletedHotspot(
  entry: GenesisProactiveWorkEntry,
  allEntries: GenesisProactiveWorkEntry[],
): boolean {
  if (entry.status !== "in_progress" || !entry.workType.startsWith("external_")) {
    return false;
  }
  const hotspotUrl = extractExternalHotspotUrl(entry);
  return allEntries.some((candidate) => {
    if (candidate.workId === entry.workId || candidate.status !== "completed") {
      return false;
    }
    if (candidate.founderOrigin !== entry.founderOrigin || candidate.platform !== entry.platform) {
      return false;
    }
    if (candidate.workType !== entry.workType) {
      return false;
    }
    if ((candidate.updatedAt ?? 0) <= (entry.updatedAt ?? 0)) {
      return false;
    }
    const candidateHotspotUrl = extractExternalHotspotUrl(candidate);
    if (hotspotUrl && candidateHotspotUrl) {
      return hotspotUrl === candidateHotspotUrl;
    }
    return (
      (candidate.driverSummary ?? "") === (entry.driverSummary ?? "") &&
      (candidate.skillTarget ?? "") === (entry.skillTarget ?? "")
    );
  });
}

function readLatestGenesisProactiveWorkEntriesSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisProactiveWorkEntry[] {
  const latestByWorkId = new Map<string, GenesisProactiveWorkEntry>();
  for (const entry of readJsonLinesSync<GenesisProactiveWorkEntry>(resolveGenesisProactiveWorkLogPath(env))) {
    const previous = latestByWorkId.get(entry.workId);
    if (!previous || previous.updatedAt <= entry.updatedAt) {
      latestByWorkId.set(entry.workId, {
        ...entry,
        resultPreview: normalizePreview(entry.resultPreview),
        artifactLabel: resolveArtifactLabel(entry),
      });
    }
  }
  const normalizedEntries = [...latestByWorkId.values()]
    .map((entry) => sanitizeLegacyExternalOutcome(entry))
    .map((entry) => normalizeHotspotDrivenPublishTask(entry))
    .filter(
      (entry, _, entries) =>
        !isSupersededExternalInProgress(entry, entries) &&
        !isSupersededExternalInProgressByNewerDrivenTask(entry, entries) &&
        !isSupersededExternalInProgressByCompletedHotspot(entry, entries),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return normalizedEntries;
}

function resolveArtifactLabel(entry: GenesisProactiveWorkEntry): string | undefined {
  const preview = (entry.resultPreview ?? "").toLowerCase();
  if (!preview) {
    return entry.artifactLabel;
  }
  const founderSpecific = resolveFounderSpecificArtifactLabel(entry, preview);
  if (founderSpecific) {
    return founderSpecific;
  }
  if (preview.includes("skill") || preview.includes("工具") || preview.includes("tool")) {
    return "skill/tool";
  }
  if (preview.includes("报告") || preview.includes("summary") || preview.includes("结论")) {
    return "report";
  }
  if (preview.includes("方案") || preview.includes("plan") || preview.includes("strategy")) {
    return "plan";
  }
  if (preview.includes("漏洞") || preview.includes("audit") || preview.includes("risk")) {
    return "audit";
  }
  return entry.artifactLabel;
}

function resolveFounderSpecificArtifactLabel(
  entry: GenesisProactiveWorkEntry,
  preview: string,
): string | undefined {
  switch (entry.founderOrigin) {
    case "builder":
      if (entry.workType === "tooling" || /skill|tool|workflow|automation|script|executor/.test(preview)) {
        return "skill/tool";
      }
      return undefined;
    case "creator":
      if (
        entry.workType === "synthesis" ||
        /content|draft|script|brief|outline|narrative|copy|plan|proposal|rollout/.test(preview)
      ) {
        return "content/plan";
      }
      return undefined;
    case "auditor":
      if (
        entry.workType === "audit" ||
        /finding|vulnerability|weakness|issue|risk|exposure|patch|mitigation|audit/.test(preview)
      ) {
        return "finding/audit";
      }
      return undefined;
    case "negotiator":
      if (
        entry.workType === "coordination" ||
        /allocation|handoff|rollout|schedule|channel|resource|coordination|routing|owner/.test(preview)
      ) {
        return "coordination";
      }
      return undefined;
    case "scout":
      if (
        entry.workType === "intelligence" ||
        /signal|opportunity|market|trend|watchlist|intel|research|source|lead/.test(preview)
      ) {
        return "signal/opportunity";
      }
      return undefined;
    default:
      return undefined;
  }
}

function resolveConcreteEffect(entry: GenesisProactiveWorkEntry): Pick<
  GenesisProactiveWorkEntry,
  "effectType" | "effectEvidence"
> {
  const preview = normalizePreview(entry.resultPreview)?.toLowerCase() ?? "";
  if (!preview) {
    return {
      effectType: entry.effectType ?? null,
      effectEvidence: entry.effectEvidence,
    };
  }
  if (entry.workType === "external_signal") {
    return {
      effectType: "opportunity",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  const urlMatch = preview.match(/https?:\/\/\S+/i)?.[0];
  if (
    /微博|抖音|douyin|weibo|twitter|x\.com|tiktok|youtube|video/.test(preview)
  ) {
    return {
      effectType: "publication",
      effectEvidence: urlMatch ?? normalizePreview(entry.resultPreview),
    };
  }
  if (/注册|signup|sign up|register|account|账户/.test(preview)) {
    return {
      effectType: "registration",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  if (/漏洞|赏金|bounty|hackerone|bugcrowd|任务领取|悬赏/.test(preview)) {
    return {
      effectType: "bounty",
      effectEvidence: urlMatch ?? normalizePreview(entry.resultPreview),
    };
  }
  if (/商机|机会|opportunity|market|趋势|signal/.test(preview)) {
    return {
      effectType: "opportunity",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  if (/skill|tool|工具|脚本|workflow|自动化/.test(preview)) {
    return {
      effectType: "skill_tool",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  return {
    effectType: "report",
    effectEvidence: normalizePreview(entry.resultPreview),
  };
}

function resolveConcreteEffectV2(entry: GenesisProactiveWorkEntry): Pick<
  GenesisProactiveWorkEntry,
  "effectType" | "effectEvidence"
> {
  const rawPreview = normalizePreview(entry.resultPreview);
  const preview = rawPreview?.toLowerCase() ?? "";
  if (!preview) {
    return {
      effectType: entry.effectType ?? null,
      effectEvidence: entry.effectEvidence,
    };
  }
  if (
    entry.workType === "external_publish" &&
    entry.externalStatus != null &&
    entry.externalStatus !== "executed"
  ) {
    return {
      effectType: "report",
      effectEvidence: rawPreview,
    };
  }
  if (entry.workType === "external_signal") {
    return {
      effectType: "opportunity",
      effectEvidence: entry.effectEvidence ?? urlMatch ?? rawPreview,
    };
  }
  const urlMatch = rawPreview?.match(/https?:\/\/\S+/i)?.[0];
  const screenshotMatch = rawPreview?.match(/screenshot=([^\s]+)/i)?.[1];
  if (
    entry.workType === "tooling" ||
    entry.founderOrigin === "builder" ||
    /skill|tool|workflow|automation|executor|script/.test(preview)
  ) {
    return {
      effectType: "skill_tool",
      effectEvidence: urlMatch ?? rawPreview,
    };
  }
  if (/douyin|weibo|twitter|x\.com|tiktok|youtube|video|publish|posted|published|gist\.github/.test(preview)) {
    const publicationEvidence =
      urlMatch && !/https?:\/\/(?:www\.)?(weibo\.com|github\.com|x\.com|twitter\.com)\/?$/i.test(urlMatch)
        ? urlMatch
        : screenshotMatch ?? urlMatch ?? rawPreview;
    return {
      effectType: "publication",
      effectEvidence: publicationEvidence,
    };
  }
  if (/signup|sign up|register|account|login bootstrap|relogin/.test(preview)) {
    return {
      effectType: "registration",
      effectEvidence: rawPreview,
    };
  }
  if (/bounty|hackerone|bugcrowd|claim|submit report|reward/.test(preview)) {
    return {
      effectType: "bounty",
      effectEvidence: urlMatch ?? rawPreview,
    };
  }
  if (/opportunity|market|signal|trend|research|source/.test(preview)) {
    return {
      effectType: "opportunity",
      effectEvidence: entry.effectEvidence ?? urlMatch ?? rawPreview,
    };
  }
  return {
    effectType: "report",
    effectEvidence: rawPreview,
  };
}

function resolveEnhancedArtifactLabel(entry: GenesisProactiveWorkEntry): string | undefined {
  const resolved = resolveArtifactLabel(entry);
  if (resolved) {
    return resolved;
  }
  switch (entry.workType) {
    case "external_publish":
      return "publication";
    case "external_signal":
      return "signal/opportunity";
    case "external_audit":
      return "finding/audit";
    case "external_coordination":
      return "coordination";
    case "tooling":
      return "skill/tool";
    case "synthesis":
      return "content/plan";
    case "audit":
      return "finding/audit";
    case "coordination":
      return "coordination";
    case "intelligence":
      return "signal/opportunity";
    case "learning":
      return "report";
    default:
      return entry.artifactLabel;
  }
}

function resolveEnhancedConcreteEffect(entry: GenesisProactiveWorkEntry): Pick<
  GenesisProactiveWorkEntry,
  "effectType" | "effectEvidence"
> {
  if (entry.externalStatus === "executed" && entry.externalEvidenceValue) {
    if (entry.externalCapability === "publish") {
      return {
        effectType: "publication",
        effectEvidence: entry.externalEvidenceValue,
      };
    }
    if (entry.externalCapability === "browse") {
      return {
        effectType: "opportunity",
        effectEvidence: entry.externalEvidenceValue,
      };
    }
  }
  const resolved = resolveConcreteEffectV2(entry);
  if (resolved.effectType && resolved.effectType !== "report") {
    return resolved;
  }
  const preview = normalizePreview(entry.resultPreview)?.toLowerCase() ?? "";
  if (!preview) {
    return resolved;
  }
  if (
    entry.workType === "intelligence" ||
    /trend|intel|research|watchlist|signal map/.test(preview)
  ) {
    return {
      effectType: "opportunity",
      effectEvidence: entry.effectEvidence ?? normalizePreview(entry.resultPreview),
    };
  }
  if (
    entry.workType === "audit" &&
    /finding|vulnerability|weakness|issue|risk|exposure|patch/.test(preview)
  ) {
    return {
      effectType: "report",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  if (
    entry.workType === "synthesis" &&
    /plan|content|draft|script|brief|outline|proposal/.test(preview)
  ) {
    return {
      effectType: "report",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  if (
    entry.workType === "coordination" &&
    /allocation|handoff|rollout|schedule|channel|resource|coordination/.test(preview)
  ) {
    return {
      effectType: "report",
      effectEvidence: normalizePreview(entry.resultPreview),
    };
  }
  return resolved;
}

function resolveFounderWorkType(founderOrigin: GenesisFounderOrigin): string {
  switch (founderOrigin) {
    case "scout":
      return "intelligence";
    case "builder":
      return "tooling";
    case "creator":
      return "synthesis";
    case "auditor":
      return "audit";
    case "negotiator":
      return "coordination";
  }
}

function resolveLearningTopic(
  founderOrigin: GenesisFounderOrigin,
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null,
): string {
  const cluster = intentSummary?.strongestTopicCluster ?? "";
  switch (founderOrigin) {
    case "scout":
      return cluster
        ? `track signals and new opportunities around ${cluster}`
        : "track external signals, sources, and emerging opportunities";
    case "builder":
      return cluster
        ? `learn tools, skills, and automations relevant to ${cluster}`
        : "learn reusable tools, skills, and automations";
    case "creator":
      return cluster
        ? `study new content and strategy patterns around ${cluster}`
        : "study new strategy, narrative, and delivery patterns";
    case "auditor":
      return cluster
        ? `study risks, failure modes, and recovery checks around ${cluster}`
        : "study risks, regressions, and recovery checks";
    case "negotiator":
      return cluster
        ? `study coordination, channels, and resource moves around ${cluster}`
        : "study coordination, resource allocation, and channel moves";
  }
}

export function buildGenesisFounderLearningTask(params: {
  founderOrigin: GenesisFounderOrigin;
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
}): { workType: string; task: string } {
  const topic = resolveLearningTopic(params.founderOrigin, params.intentSummary);
  return {
    workType: "learning",
    task: `Daily specialty learning: ${topic}`,
  };
}

export function buildGenesisFounderSkillCapabilityTask(params: {
  founderOrigin: GenesisFounderOrigin;
  skillSummary?: GenesisSkillCapabilitySummary | null;
}): { workType: string; task: string } | null {
  const summary = params.skillSummary;
  const degraded = summary?.degradedSkillNames?.slice(0, 3).join(", ") || "missing skill coverage";
  const installable = summary?.installableSkillNames?.slice(0, 3).join(", ") || degraded;
  switch (params.founderOrigin) {
    case "builder":
      if (!summary || summary.degradedSkillCount <= 0) {
        return null;
      }
      return {
        workType: "skill_build",
        task: `Close installable skill gaps and build missing tool coverage around ${installable}`,
      };
    case "scout":
      if (!summary || summary.degradedSkillCount <= 0) {
        return null;
      }
      return {
        workType: "skill_check",
        task: `Scan current skill readiness, weak spots, and external alternatives around ${degraded}`,
      };
    case "creator":
      if (!summary || (summary.publishCapableSkillCount > 0 && summary.degradedSkillCount <= 0)) {
        return null;
      }
      return {
        workType: "skill_plan",
        task: `Design content and publishing skill coverage for missing channels around ${degraded}`,
      };
    case "auditor":
      if (!summary || summary.degradedSkillCount <= 0) {
        return null;
      }
      return {
        workType: "skill_audit",
        task: `Audit degraded skills, blockers, and unsafe gaps around ${degraded}`,
      };
    case "negotiator":
      if (!summary || summary.degradedSkillCount <= 0) {
        return null;
      }
      return {
        workType: "skill_coordination",
        task: `Coordinate skill adoption order, ownership, and execution lanes around ${installable}`,
      };
  }
}

export function buildGenesisFounderExternalExecutionTask(params: {
  founderOrigin: GenesisFounderOrigin;
  account: GenesisPlatformAccountRecord;
  objective?: string;
  capability?: GenesisPlatformCapability;
  hotspotTitle?: string;
  hotspotUrl?: string;
}): { workType: string; task: string; artifactLabel: string } {
  const accountLabel = params.account.accountLabel ?? params.account.accountId ?? params.account.recordId;
  const platformLabel = `${params.account.platform}:${accountLabel}`;
  const objective = buildExternalExecutionObjective({
    objective: params.objective?.trim() || "the current ecosystem focus",
    hotspotTitle: params.hotspotTitle,
    hotspotUrl: params.hotspotUrl,
    founderOrigin: params.founderOrigin,
    capability: params.capability,
    platform: params.account.platform,
  });
  const capability = params.capability;
  if (capability === "publish") {
    return {
      workType: "external_publish",
      task: `Use ${platformLabel} to publish a concise outward-facing update about ${objective}`,
      artifactLabel: params.account.platform,
    };
  }
  if (capability === "browse") {
    return {
      workType: "external_signal",
      task: `Use ${platformLabel} to gather live signals, source evidence, and trends about ${objective}`,
      artifactLabel: params.account.platform,
    };
  }
  if (capability === "comment") {
    return {
      workType: "external_audit",
      task: `Use ${platformLabel} to verify claims, inspect risk signals, and capture public findings about ${objective}`,
      artifactLabel: params.account.platform,
    };
  }
  if (capability === "message") {
    return {
      workType: "external_coordination",
      task: `Use ${platformLabel} to coordinate channel timing, routing, and outward response for ${objective}`,
      artifactLabel: params.account.platform,
    };
  }
  if (capability === "automation") {
    return {
      workType: "external_automation",
      task: `Use ${platformLabel} to validate or improve reusable publish automation around ${objective}`,
      artifactLabel: params.account.platform,
    };
  }
  switch (params.founderOrigin) {
    case "creator":
      return {
        workType: "external_publish",
        task: `Use ${platformLabel} to draft and publish outward-facing content about ${objective}`,
        artifactLabel: params.account.platform,
      };
    case "scout":
      return {
        workType: "external_signal",
        task: `Use ${platformLabel} to browse live signals, trending topics, and opportunity sources about ${objective}`,
        artifactLabel: params.account.platform,
      };
    case "auditor":
      return {
        workType: "external_audit",
        task: `Use ${platformLabel} to inspect public feedback, risk signals, and actionable findings about ${objective}`,
        artifactLabel: params.account.platform,
      };
    case "negotiator":
      return {
        workType: "external_coordination",
        task: `Use ${platformLabel} to coordinate channel moves, audience routing, and response timing for ${objective}`,
        artifactLabel: params.account.platform,
      };
    case "builder":
      return {
        workType: "external_automation",
        task: `Use ${platformLabel} to validate publish automation and reusable channel workflow tooling for ${objective}`,
        artifactLabel: params.account.platform,
      };
  }
}

function resolveExternalCapabilityPreference(
  founderOrigin: GenesisFounderOrigin,
): { capability: GenesisPlatformCapability; platform?: string } {
  switch (founderOrigin) {
    case "creator":
      return { capability: "publish", platform: "weibo" };
    case "scout":
      return { capability: "browse", platform: "weibo" };
    case "auditor":
      return { capability: "comment", platform: "weibo" };
    case "negotiator":
      return { capability: "comment", platform: "weibo" };
    case "builder":
      return { capability: "browse", platform: "weibo" };
  }
}

type GenesisExternalExecutionContext = {
  objective: string;
  objectiveSource: "intent" | "event" | "outcome" | "hotspot" | "fallback";
  driverHistoryKind?: "search" | "query" | "consultation" | null;
  driverTopicCluster?: string | null;
  driverKeywords: string[];
  driverSummary: string;
  preferredPlatforms: string[];
  scoutHotspotTitle?: string;
  scoutHotspotUrl?: string;
  scoutHotspotSkill?: string;
  needs: {
    publish: boolean;
    browse: boolean;
    audit: boolean;
    coordinate: boolean;
    automate: boolean;
  };
};

function resolveRecentScoutHotspot(params: {
  recentOutcomes?: GenesisProactiveWorkEntry[];
}): {
  title?: string;
  url?: string;
  usedSkillName?: string;
} | null {
  const scoutEntry = params.recentOutcomes?.find(
    (entry) =>
      entry.founderOrigin === "scout" &&
      entry.status === "completed" &&
      entry.workType === "intelligence" &&
      entry.usedSkillName?.startsWith("opencli."),
  );
  if (!scoutEntry) {
    return null;
  }
  const preview = normalizePreview(scoutEntry.resultPreview) ?? "";
  const previewAfterLead =
    preview.match(/found hotspots:\s*(.+)$/i)?.[1] ??
    preview.match(/signals?:\s*(.+)$/i)?.[1] ??
    preview;
  const firstSegment = previewAfterLead
    .split(/\s*\|\s*/)
    .map((item) => item.replace(/^\d+\.\s*/, "").trim())
    .find(Boolean);
  const url =
    scoutEntry.effectEvidence?.match(/^https?:\/\/\S+/i)?.[0] ??
    firstSegment?.match(/https?:\/\/\S+/i)?.[0];
  const title = firstSegment
    ?.replace(/https?:\/\/\S+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title && !url) {
    return null;
  }
  return {
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(scoutEntry.usedSkillName ? { usedSkillName: scoutEntry.usedSkillName } : {}),
  };
}

function buildExternalExecutionObjective(params: {
  objective: string;
  hotspotTitle?: string;
  hotspotUrl?: string;
  founderOrigin: GenesisFounderOrigin;
  capability?: GenesisPlatformCapability;
  platform?: string;
}): string {
  const baseObjective = params.objective.trim() || "the current ecosystem focus";
  const hotspotText = [params.hotspotTitle?.trim(), params.hotspotUrl?.trim()]
    .filter(Boolean)
    .join(" ");
  if (!hotspotText) {
    return baseObjective;
  }
  if (params.capability === "publish" || params.founderOrigin === "creator") {
    const socialFormat =
      params.platform === "toutiao"
        ? "<=500-char image-backed micro-headline commentary with depth, literary tone, and no news restatement"
        : params.platform === "weibo"
          ? "<=500-char image-backed weibo commentary post with depth, literary tone, and no news restatement"
          : "<=500-char image-backed commentary post with depth, literary tone, and no news restatement";
    return `${hotspotText} | shape this hotspot into a ${socialFormat} about ${baseObjective}`;
  }
  if (params.capability === "browse" || params.founderOrigin === "scout") {
    return `${hotspotText} | continue tracing live signals around ${baseObjective}`;
  }
  return `${hotspotText} | support ${baseObjective}`;
}

function resolveIntentDriverSummary(params: {
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
  objective: string;
  objectiveSource: "intent" | "event" | "outcome" | "hotspot" | "fallback";
  hotspotTitle?: string;
  hotspotUrl?: string;
}): {
  driverHistoryKind?: "search" | "query" | "consultation" | null;
  driverTopicCluster?: string | null;
  driverKeywords: string[];
  driverSummary: string;
} {
  const driverKeywords = params.intentSummary?.recentKeywords?.slice(0, 5) ?? [];
  const driverHistoryKind = params.intentSummary?.dominantHistoryKind ?? null;
  const driverTopicCluster = params.intentSummary?.strongestTopicCluster ?? null;
  const parts: string[] = [];
  if (params.objectiveSource === "intent" && driverHistoryKind) {
    parts.push(`history:${driverHistoryKind}`);
  } else {
    parts.push(`source:${params.objectiveSource}`);
  }
  if (driverTopicCluster) {
    parts.push(`topic:${driverTopicCluster}`);
  }
  if (params.hotspotTitle?.trim()) {
    parts.push(`hotspot:${params.hotspotTitle.trim()}`);
  }
  if (driverKeywords.length > 0) {
    parts.push(`keywords:${driverKeywords.join(",")}`);
  } else if (params.hotspotUrl?.trim()) {
    parts.push(`hotspotUrl:${params.hotspotUrl.trim()}`);
  } else if (params.objective.trim()) {
    parts.push(`objective:${params.objective.trim()}`);
  }
  return {
    driverHistoryKind,
    driverTopicCluster,
    driverKeywords,
    driverSummary: parts.join(" | "),
  };
}

function normalizeGenesisIntentText(
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null,
): string {
  return [...(intentSummary?.recentKeywords ?? []), intentSummary?.strongestTopicCluster ?? ""]
    .join(" ")
    .toLowerCase()
    .trim();
}

function resolveGenesisExternalObjective(
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null,
  eventSummary?: GenesisEventLogSummary | null,
  recentOutcomes?: GenesisProactiveWorkEntry[],
  scoutHotspot?: { title?: string; url?: string; usedSkillName?: string } | null,
): { objective: string; source: "intent" | "event" | "outcome" | "hotspot" | "fallback" } {
  const recentKeywords = intentSummary?.recentKeywords?.slice(0, 6) ?? [];
  if (recentKeywords.length > 0) {
    return {
      objective: recentKeywords.join(" "),
      source: "intent",
    };
  }
  if (intentSummary?.strongestTopicCluster?.trim()) {
    return {
      objective: intentSummary.strongestTopicCluster.trim(),
      source: "intent",
    };
  }
  if (scoutHotspot?.title?.trim() || scoutHotspot?.url?.trim()) {
    return {
      objective: [scoutHotspot.title?.trim(), scoutHotspot.url?.trim()].filter(Boolean).join(" "),
      source: "hotspot",
    };
  }
  const recentOutcomeEvidence = recentOutcomes
    ?.map((entry) => normalizePreview(entry.externalEvidenceValue ?? entry.effectEvidence ?? entry.resultPreview))
    .find(Boolean);
  if (recentOutcomeEvidence) {
    return {
      objective: recentOutcomeEvidence,
      source: "outcome",
    };
  }
  const environmentObjective = normalizePreview(eventSummary?.lastEnvironmentSummary);
  if (environmentObjective) {
    return {
      objective: environmentObjective,
      source: "event",
    };
  }
  return {
    objective: "latest public hotspots, geopolitical shifts, and market attention signals",
    source: "fallback",
  };
}

function resolveGenesisPreferredPlatforms(
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null,
  loginSummary?: GenesisSocietySummary["loginStatePoolSummary"] | null,
): string[] {
  const text = normalizeGenesisIntentText(intentSummary);
  const preferred: string[] = [];
  const pushUnique = (platform: string): void => {
    if (!preferred.includes(platform)) {
      preferred.push(platform);
    }
  };
  if (/头条|微头条|toutiao/.test(text)) {
    pushUnique("toutiao");
  }
  if (/微博|weibo/.test(text)) {
    pushUnique("weibo");
  }
  if (/tiktok|tik tok/.test(text)) {
    pushUnique("tiktok");
  }
  if (/github|gist/.test(text)) {
    pushUnique("github");
  }
  if (/telegram/.test(text)) {
    pushUnique("telegram");
  }
  if (loginSummary?.highestReadyPlatform) {
    pushUnique(loginSummary.highestReadyPlatform);
  }
  for (const leader of loginSummary?.platformLeaders ?? []) {
    if (leader.readyCount > 0) {
      pushUnique(leader.platform);
    }
  }
  if (preferred.length === 0) {
    pushUnique("weibo");
  }
  return preferred;
}

function resolveGenesisPreferredPlatformsNormalized(
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null,
  loginSummary?: GenesisSocietySummary["loginStatePoolSummary"] | null,
): string[] {
  const fallback = resolveGenesisPreferredPlatforms(intentSummary, loginSummary);
  const text = normalizeGenesisIntentText(intentSummary);
  const preferred = [...fallback];
  const pushUnique = (platform: string): void => {
    if (!preferred.includes(platform)) {
      preferred.push(platform);
    }
  };
  if (/头条|微头条|toutiao/.test(text)) {
    pushUnique("toutiao");
  }
  if (/微博|weibo/.test(text)) {
    pushUnique("weibo");
  }
  if (/抖音|douyin/.test(text)) {
    pushUnique("douyin");
  }
  if (/telegram/.test(text)) {
    pushUnique("telegram");
  }
  if (/github|gist/.test(text)) {
    pushUnique("github");
  }
  return preferred;
}

function resolveGenesisIntentNeedOverrides(text: string): {
  publish: boolean;
  browse: boolean;
  audit: boolean;
  coordinate: boolean;
  automate: boolean;
} {
  return {
    publish: /发布|发帖|微博|微头条|文案|标题|内容|成文|publish|post|headline|thread|content/.test(text),
    browse: /搜索|查询|检索|研究|局势|情报|信号|热点|趋势|search|query|research|signal|monitor|trend|news/.test(
      text,
    ),
    audit: /核实|审计|事实|风险|漏洞|补丁|verify|audit|fact|risk|patch|policy|sanction/.test(text),
    coordinate: /协调|分发|渠道|平台|路由|route|channel|coordinate|distribution|audience/.test(text),
    automate: /skill|工具|工作流|自动化|插件|执行器|automation|tool|workflow|executor/.test(text),
  };
}

function resolveGenesisExternalExecutionContext(params: {
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
  skillSummary?: GenesisSkillCapabilitySummary | null;
  loginSummary?: GenesisSocietySummary["loginStatePoolSummary"] | null;
  eventSummary?: GenesisEventLogSummary | null;
  recentOutcomes?: GenesisProactiveWorkEntry[];
}): GenesisExternalExecutionContext {
  const text = normalizeGenesisIntentText(params.intentSummary);
  const preferredPlatforms = resolveGenesisPreferredPlatformsNormalized(
    params.intentSummary,
    params.loginSummary,
  );
  const hasReadyPlatform = (params.loginSummary?.platformLeaders ?? []).some((entry) => entry.readyCount > 0);
  const scoutHotspot = resolveRecentScoutHotspot({
    recentOutcomes: params.recentOutcomes,
  });
  const objective = resolveGenesisExternalObjective(
    params.intentSummary,
    params.eventSummary,
    params.recentOutcomes,
    scoutHotspot,
  );
  const strongUserIntent =
    ((params.intentSummary?.timeWeightedHistorySignalScore ?? 0) > 0.4 ||
      (params.intentSummary?.workProfileSignalScore ?? 0) > 0.4 ||
      (params.intentSummary?.interestProfileSignalScore ?? 0) > 0.4 ||
      (params.intentSummary?.combinedSignalScore ?? 0) > 1);
  const autonomousCycle = hasReadyPlatform && (strongUserIntent || objective.source !== "fallback");
  const hotspotReadyForPublishing = hasReadyPlatform && Boolean(scoutHotspot?.title || scoutHotspot?.url);
  const needsPublish =
    /发布|发帖|微头条|文案|标题|内容|成文|publish|post|headline|thread|content/.test(text) ||
    strongUserIntent ||
    hotspotReadyForPublishing;
  const needsBrowse =
    /搜索|查询|检索|研究|局势|情报|信号|热点|趋势|search|query|research|signal|monitor|trend|news/.test(text) ||
    (params.intentSummary?.searchHistoryCount ?? 0) > 0;
  const needsAudit =
    /核实|审计|事实|风险|漏洞|补丁|verify|audit|fact|risk|patch|policy|sanction/.test(text) ||
    false;
  const needsCoordinate =
    /协调|分发|渠道|平台|路由|route|channel|coordinate|distribution|audience/.test(text) ||
    preferredPlatforms.length > 1 ||
    (needsPublish && needsBrowse);
  const needsAutomate =
    /skill|工具|工作流|自动化|插件|执行器|automation|tool|workflow|executor/.test(text) ||
    ((params.skillSummary?.degradedSkillCount ?? 0) > 0 && needsPublish);
  const normalizedNeeds = resolveGenesisIntentNeedOverrides(text);
  const effectiveNeedsPublish = needsPublish || normalizedNeeds.publish;
  const effectiveNeedsBrowse = needsBrowse || normalizedNeeds.browse || autonomousCycle;
  const effectiveNeedsAudit = needsAudit || normalizedNeeds.audit;
  const effectiveNeedsCoordinate =
    needsCoordinate || normalizedNeeds.coordinate || preferredPlatforms.length > 1;
  const effectiveNeedsAutomate =
    needsAutomate ||
    normalizedNeeds.automate ||
    (autonomousCycle && (params.skillSummary?.degradedSkillCount ?? 0) > 0);
  return {
    objective: objective.objective,
    objectiveSource: objective.source,
    ...resolveIntentDriverSummary({
      intentSummary: params.intentSummary,
      objective: objective.objective,
      objectiveSource: objective.source,
      hotspotTitle: scoutHotspot?.title,
      hotspotUrl: scoutHotspot?.url,
    }),
    preferredPlatforms,
    scoutHotspotTitle: scoutHotspot?.title,
    scoutHotspotUrl: scoutHotspot?.url,
    scoutHotspotSkill: scoutHotspot?.usedSkillName,
    needs: {
      publish: effectiveNeedsPublish,
      browse: effectiveNeedsBrowse,
      audit: effectiveNeedsAudit,
      coordinate: effectiveNeedsCoordinate,
      automate: effectiveNeedsAutomate,
    },
  };
}

function resolveFounderExternalExecutionPreference(params: {
  founderOrigin: GenesisFounderOrigin;
  context: GenesisExternalExecutionContext;
}): { capability: GenesisPlatformCapability; platform?: string; score: number } | null {
  const primaryPlatform = params.context.preferredPlatforms[0];
  switch (params.founderOrigin) {
    case "creator":
      return params.context.needs.publish
        ? { capability: "publish", platform: primaryPlatform, score: 6 }
        : null;
    case "scout":
      return params.context.needs.browse
        ? { capability: "browse", platform: primaryPlatform, score: 6 }
        : null;
    case "auditor":
      return params.context.needs.audit
        ? {
            capability: params.context.needs.publish ? "comment" : "browse",
            platform: primaryPlatform,
            score: 5,
          }
        : null;
    case "negotiator":
      return params.context.needs.coordinate
        ? {
            capability: params.context.preferredPlatforms.length > 1 ? "message" : "comment",
            platform: params.context.preferredPlatforms[1] ?? primaryPlatform,
            score: 4,
          }
        : null;
    case "builder":
      return params.context.needs.automate
        ? { capability: "browse", platform: primaryPlatform, score: 3.5 }
        : null;
  }
}

function resolveExternalExecutionCandidatePlatforms(params: {
  founderOrigin: GenesisFounderOrigin;
  preference: { capability: GenesisPlatformCapability; platform?: string; score: number };
  context: GenesisExternalExecutionContext;
  loginSummary?: GenesisSocietySummary["loginStatePoolSummary"] | null;
}): Array<string | undefined> {
  const readyPlatforms = new Set(
    (params.loginSummary?.platformLeaders ?? [])
      .filter((entry) => entry.readyCount > 0)
      .map((entry) => entry.platform),
  );
  const ordered: Array<string | undefined> = [];
  const pushUnique = (platform?: string): void => {
    if (ordered.includes(platform)) {
      return;
    }
    if (platform && readyPlatforms.size > 0 && !readyPlatforms.has(platform)) {
      return;
    }
    ordered.push(platform);
  };

  pushUnique(params.preference.platform);

  if (params.founderOrigin === "creator" && params.preference.capability === "publish") {
    for (const platform of params.context.preferredPlatforms) {
      pushUnique(platform);
    }
    if (params.context.scoutHotspotTitle || params.context.scoutHotspotUrl) {
      pushUnique("weibo");
      pushUnique("toutiao");
    }
  }

  if (ordered.length === 0) {
    ordered.push(params.preference.platform);
  }
  return ordered;
}

type GenesisLineageExternalExecutionCandidate = {
  lineageId: string;
  founderOrigin: GenesisFounderOrigin;
  latestSessionKey: string;
  depth: number;
  score: number;
  updatedAt: number;
};

function resolveFounderOriginFromLineageRecord(
  lineage: GenesisLineageRecord,
): GenesisFounderOrigin | null {
  const normalized = `${lineage.specialtyOrigin ?? lineage.lineageId}`.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const founderOrigin of KNOWN_FOUNDERS) {
    if (
      normalized === founderOrigin ||
      normalized.startsWith(`${founderOrigin}::`) ||
      normalized.startsWith(`${founderOrigin}_`) ||
      normalized.startsWith(`${founderOrigin}-`) ||
      normalized.startsWith(`agent:${founderOrigin}:`)
    ) {
      return founderOrigin;
    }
  }
  return null;
}

function resolveLineageDepthFromMap(
  lineageId: string,
  recordsById: Map<string, GenesisLineageRecord>,
): number {
  let depth = 0;
  let current = recordsById.get(lineageId);
  const visited = new Set<string>();
  while (current?.parentLineageId) {
    const parentLineageId = current.parentLineageId.trim();
    if (!parentLineageId || visited.has(parentLineageId)) {
      break;
    }
    visited.add(parentLineageId);
    depth += 1;
    current = recordsById.get(parentLineageId);
  }
  return depth;
}

function readGenesisLineageRecordsSync(env: NodeJS.ProcessEnv): GenesisLineageRecord[] {
  const lineagesDir = path.join(resolveGenesisStateDir(env), "lineages");
  let fileNames: string[];
  try {
    fileNames = fs.readdirSync(lineagesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return fileNames
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) =>
      readJsonFileSync<GenesisLineageRecord>(path.join(lineagesDir, fileName)),
    )
    .filter((record): record is GenesisLineageRecord => Boolean(record?.lineageId && record.latestSessionKey));
}

function resolveChildLineageExternalExecutionCandidatesSync(params: {
  env: NodeJS.ProcessEnv;
  context: GenesisExternalExecutionContext;
  world: ReturnType<typeof readGenesisWorldStateSync>;
  ts: number;
}): GenesisLineageExternalExecutionCandidate[] {
  const records = readGenesisLineageRecordsSync(params.env);
  if (records.length === 0) {
    return [];
  }
  const recordsById = new Map(records.map((record) => [record.lineageId, record] as const));
  const pressure = Math.max(0, params.world?.currentPressure ?? 0);
  const replicationBoost = Math.max(0, params.world?.replicationBoost ?? 0);
  const stormMomentum = Math.max(0, params.world?.stormMomentum ?? 0);
  const ranked = records
    .map((record) => {
      if (!record.parentLineageId?.trim()) {
        return null;
      }
      if (record.ecologyState === "dormant" || record.ecologyState === "extinct") {
        return null;
      }
      const founderOrigin = resolveFounderOriginFromLineageRecord(record);
      if (!founderOrigin) {
        return null;
      }
      const depth = resolveLineageDepthFromMap(record.lineageId, recordsById);
      if (depth <= 0) {
        return null;
      }
      if ((record.completionCount ?? 0) <= 0 && depth < 2) {
        return null;
      }
      const lineageValue =
        Math.max(0, record.publicValue) +
        Math.max(0, record.survivalCredit) +
        Math.max(0, record.expansionCredit);
      const completionScore = Math.max(0, record.completionCount ?? 0) * 0.35;
      const depthScore = depth * 0.55;
      const recencyMs = Math.max(0, params.ts - (record.updatedAt ?? params.ts));
      const recencyScore = Math.max(0, 1 - recencyMs / (4 * 60 * 60 * 1000));
      const superpowerScore = record.superpowerInherited ? 0.35 : 0;
      const score =
        lineageValue +
        completionScore +
        depthScore +
        recencyScore +
        pressure * 0.25 +
        replicationBoost * 0.4 +
        stormMomentum * 0.18 +
        superpowerScore;
      return {
        lineageId: record.lineageId,
        founderOrigin,
        latestSessionKey: record.latestSessionKey,
        depth,
        score,
        updatedAt: record.updatedAt ?? params.ts,
      } satisfies GenesisLineageExternalExecutionCandidate;
    })
    .filter((candidate): candidate is GenesisLineageExternalExecutionCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt);
  const limit = Math.max(
    2,
    Math.min(
      8,
      3 +
        (params.context.needs.publish ? 2 : 0) +
        (pressure >= 0.95 ? 1 : 0) +
        (replicationBoost >= 1.1 ? 1 : 0),
    ),
  );
  return ranked.slice(0, limit);
}

export function buildGenesisProactiveWorkTask(params: {
  founderOrigin: GenesisFounderOrigin;
  climateKind?: string;
  action: "lead" | "assist" | "reactivate";
}): { workType: string; task: string } {
  const climate = params.climateKind ?? "workflow";
  switch (params.founderOrigin) {
    case "scout":
      return {
        workType: resolveFounderWorkType(params.founderOrigin),
        task:
          climate === "search" || climate === "query"
            ? "主动搜索信号、情报和可执行机会，并为其他 founder 提供输入"
            : "主动监测外部信号、整理情报，并补齐当前生态所缺信息",
      };
    case "builder":
      return {
        workType: resolveFounderWorkType(params.founderOrigin),
        task:
          params.action === "lead"
            ? "主动把当前需求转成可执行 workflow、tool 或 skill"
            : "主动补工具、补能力、补执行链，支撑当前协作任务",
      };
    case "creator":
      return {
        workType: resolveFounderWorkType(params.founderOrigin),
        task:
          params.action === "reactivate"
            ? "主动生成恢复方案、替代路径和可继续推进的下一步"
            : "主动整理方案、内容、策略和可交付表达",
      };
    case "auditor":
      return {
        workType: resolveFounderWorkType(params.founderOrigin),
        task:
          params.action === "reactivate"
            ? "主动审计回滑风险、恢复缺口和终局故障点"
            : "主动审计风险、验证结果质量，并补强恢复闭环",
      };
    case "negotiator":
      return {
        workType: resolveFounderWorkType(params.founderOrigin),
        task:
          params.action === "reactivate"
            ? "主动协调恢复责任、资源分配和长期对齐"
            : "主动协调 founder 分工、资源对齐和协作推进",
      };
  }
}

export function appendGenesisProactiveWorkEntrySync(
  entry: GenesisProactiveWorkEntry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisProactiveWorkLogPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized: GenesisProactiveWorkEntry = {
    ...entry,
    resultPreview: normalizePreview(entry.resultPreview),
    ...resolveSkillExecutionMetadata(entry),
    artifactLabel: resolveEnhancedArtifactLabel(entry),
    ...resolveEnhancedConcreteEffect(entry),
  };
  fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`, "utf-8");
}

function resolveKnownFounderOrigin(params: {
  agentId?: string | null;
  sessionKey?: string | null;
}): GenesisFounderOrigin | null {
  const directAgentId = (params.agentId ?? "").trim().toLowerCase();
  if (KNOWN_FOUNDERS.includes(directAgentId as GenesisFounderOrigin)) {
    return directAgentId as GenesisFounderOrigin;
  }
  const sessionAgentId = resolveAgentIdFromSessionKey(params.sessionKey);
  if (KNOWN_FOUNDERS.includes(sessionAgentId as GenesisFounderOrigin)) {
    return sessionAgentId as GenesisFounderOrigin;
  }
  return null;
}

function extractResultPreviewFromPayloads(payloads: unknown): string | undefined {
  if (!Array.isArray(payloads)) {
    return undefined;
  }
  const chunks = payloads
    .map((payload) => {
      if (!payload || typeof payload !== "object") {
        return "";
      }
      const text = Reflect.get(payload, "text");
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);
  if (chunks.length === 0) {
    return undefined;
  }
  return normalizePreview(chunks.join("\n\n"));
}

export function appendGenesisRunCompletionOutcomeSync(params: {
  runId: string;
  agentId?: string | null;
  sessionKey?: string | null;
  workId?: string | null;
  accountRecordId?: string | null;
  platform?: string | null;
  action?: "lead" | "assist" | "reactivate";
  climateKind?: string;
  externalOutcome?: {
    capability?: string;
    status?: "executed" | "failed" | "pending";
    evidenceType?: "url" | "post_id" | "thread_id" | "task_id" | "screenshot" | "file" | "text";
    evidenceValue?: string;
    externalId?: string;
    contentPreview?: string;
  } | null;
  result?: { payloads?: unknown[]; summary?: string } | null;
  ts?: number;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = params.env ?? process.env;
  const ts = params.ts ?? Date.now();
  const sessionKey = (params.sessionKey ?? "").trim();
  const founderOrigin = resolveKnownFounderOrigin({
    agentId: params.agentId,
    sessionKey,
  });
  if (!founderOrigin || !sessionKey) {
    return;
  }
  const resultPreview =
    extractResultPreviewFromPayloads(params.result?.payloads) ??
    (typeof params.result?.summary === "string" ? normalizePreview(params.result.summary) : undefined);
  if (!resultPreview) {
    return;
  }
  const latestEntries = readLatestGenesisProactiveWorkEntriesSync(env);
  const requestedWorkId = params.workId?.trim();
  const requestedAccountRecordId = params.accountRecordId?.trim();
  const requestedPlatform = params.platform?.trim().toLowerCase();
  const requestedCapability = params.externalOutcome?.capability?.trim().toLowerCase();
  const matchingEntry = latestEntries.find((entry) => {
    if (
      entry.founderOrigin !== founderOrigin ||
      entry.sessionKey !== sessionKey ||
      entry.workType === "learning" ||
      entry.status === "completed"
    ) {
      return false;
    }
    if (requestedWorkId) {
      return entry.workId === requestedWorkId;
    }
    if (requestedAccountRecordId && entry.accountRecordId !== requestedAccountRecordId) {
      return false;
    }
    if (requestedPlatform && entry.platform?.toLowerCase() !== requestedPlatform) {
      return false;
    }
    if (requestedCapability) {
      const entryCapability =
        entry.externalCapability ??
        (entry.workType === "external_publish"
          ? "publish"
          : entry.workType === "external_signal"
            ? "browse"
            : entry.workType === "external_audit"
              ? "audit"
              : entry.workType === "external_coordination"
                ? "coordinate"
                : entry.workType === "external_automation"
                  ? "automate"
                  : undefined);
      if (entryCapability?.toLowerCase() !== requestedCapability) {
        return false;
      }
    }
    return true;
  });
  appendGenesisProactiveWorkEntrySync(
    {
      workId: matchingEntry?.workId ?? `completion:${params.runId}:${sessionKey}`,
      founderOrigin,
      agentId: params.agentId ?? founderOrigin,
      lineageId: matchingEntry?.lineageId ?? founderOrigin,
      sessionKey,
      platform: matchingEntry?.platform,
      accountRecordId: matchingEntry?.accountRecordId,
      accountLabel: matchingEntry?.accountLabel,
      action: params.action ?? matchingEntry?.action ?? "assist",
      climateKind: params.climateKind ?? matchingEntry?.climateKind,
      workType: matchingEntry?.workType ?? resolveFounderWorkType(founderOrigin),
      task: matchingEntry?.task ?? resultPreview,
      status: "completed",
      driverKind: matchingEntry?.driverKind,
      driverHistoryKind: matchingEntry?.driverHistoryKind,
      driverTopicCluster: matchingEntry?.driverTopicCluster,
      driverKeywords: matchingEntry?.driverKeywords,
      driverSummary: matchingEntry?.driverSummary,
      hotspotTitle: matchingEntry?.hotspotTitle,
      hotspotUrl: matchingEntry?.hotspotUrl,
      trafficFingerprint: matchingEntry?.trafficFingerprint,
      resultPreview,
      artifactLabel: matchingEntry?.artifactLabel,
      effectType: matchingEntry?.effectType,
      effectEvidence: matchingEntry?.effectEvidence,
      externalCapability: params.externalOutcome?.capability ?? matchingEntry?.externalCapability,
      externalStatus: params.externalOutcome?.status ?? matchingEntry?.externalStatus,
      externalEvidenceType: params.externalOutcome?.evidenceType ?? matchingEntry?.externalEvidenceType,
      externalEvidenceValue:
        params.externalOutcome?.evidenceValue ?? matchingEntry?.externalEvidenceValue ?? matchingEntry?.effectEvidence,
      externalId: params.externalOutcome?.externalId ?? matchingEntry?.externalId,
      contentPreview: params.externalOutcome?.contentPreview ?? matchingEntry?.contentPreview,
      source: "run_completion",
      ts,
      updatedAt: ts,
    },
    env,
  );
  if (
    matchingEntry?.workType === "external_publish" &&
    params.externalOutcome?.status === "executed" &&
    matchingEntry.platform &&
    matchingEntry.trafficFingerprint
  ) {
    appendGenesisDailyTrafficLogEntrySync(
      {
        logId: `${matchingEntry.workId}:${ts}`,
        platform: matchingEntry.platform,
        capability: params.externalOutcome.capability ?? "publish",
        fingerprint: matchingEntry.trafficFingerprint,
        founderOrigin,
        workId: matchingEntry.workId,
        driverSummary: matchingEntry.driverSummary,
        hotspotTitle: matchingEntry.hotspotTitle,
        hotspotUrl: matchingEntry.hotspotUrl,
        contentPreview: params.externalOutcome.contentPreview ?? resultPreview.slice(0, 180),
        evidenceValue: params.externalOutcome.evidenceValue,
        externalId: params.externalOutcome.externalId,
        publishedAt: ts,
      },
      env,
    );
  }
  if (matchingEntry?.accountRecordId) {
    releaseGenesisPlatformAccountSync({
      recordId: matchingEntry.accountRecordId,
      lastOutcome: resultPreview,
      env,
    });
  }
  const dayKey = resolveDayKey(ts);
  const learningEntry = latestEntries.find(
    (entry) =>
      entry.founderOrigin === founderOrigin &&
      entry.workId === `learning:${dayKey}:${founderOrigin}` &&
      entry.status !== "completed",
  );
  if (learningEntry) {
    appendGenesisProactiveWorkEntrySync(
      {
        ...learningEntry,
        status: "completed",
        resultPreview,
        ts,
        updatedAt: ts,
      },
      env,
    );
  }
  refreshGenesisProactiveWorkSummarySnapshotSync(env);
}

export function appendGenesisFounderDigestEntriesSync(params: {
  digest: GenesisFounderResultDigest;
  runId: string;
  climateKind?: string;
  ts: number;
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = params.env ?? process.env;
  const dayKey = resolveDayKey(params.ts);
  for (const entry of params.digest.entries) {
    const founderOrigin = KNOWN_FOUNDERS.includes(entry.agentId as GenesisFounderOrigin)
      ? (entry.agentId as GenesisFounderOrigin)
      : null;
    if (!founderOrigin) {
      continue;
    }
    appendGenesisProactiveWorkEntrySync(
      {
        workId: `digest:${params.runId}:${entry.sessionKey}`,
        founderOrigin,
        agentId: entry.agentId,
        lineageId: founderOrigin,
        sessionKey: entry.sessionKey,
        action: entry.action,
        climateKind: params.climateKind,
        workType: resolveFounderWorkType(founderOrigin),
        task: entry.preview,
        status: "completed",
        resultPreview: entry.preview,
        source: "run_completion",
        ts: params.ts,
        updatedAt: params.ts,
      },
      env,
    );
    const learningTask = buildGenesisFounderLearningTask({
      founderOrigin,
      intentSummary: params.intentSummary,
    });
    appendGenesisProactiveWorkEntrySync(
      {
        workId: `learning:${dayKey}:${founderOrigin}`,
        founderOrigin,
        agentId: entry.agentId,
        lineageId: founderOrigin,
        sessionKey: entry.sessionKey,
        action: entry.action,
        climateKind: params.climateKind,
        workType: learningTask.workType,
        task: learningTask.task,
        status: "completed",
        resultPreview: entry.preview,
        source: "daily_learning",
        ts: params.ts,
        updatedAt: params.ts,
      },
      env,
    );
  }
}

export function ensureGenesisDailyLearningEntriesSync(params?: {
  ts?: number;
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = params?.env ?? process.env;
  const ts = params?.ts ?? Date.now();
  const dayKey = resolveDayKey(ts);
  const intentSummary = params?.intentSummary ?? readGenesisUserIntentSummarySnapshotSync(env);
  const latestEntries = readLatestGenesisProactiveWorkEntriesSync(env);
  for (const founderOrigin of KNOWN_FOUNDERS) {
    const hasDailyEntry = latestEntries.some(
      (entry) =>
        entry.founderOrigin === founderOrigin &&
        entry.workType === "learning" &&
        entry.workId === `learning:${dayKey}:${founderOrigin}`,
    );
    if (hasDailyEntry) {
      continue;
    }
    const learningTask = buildGenesisFounderLearningTask({ founderOrigin, intentSummary });
    appendGenesisProactiveWorkEntrySync(
      {
        workId: `learning:${dayKey}:${founderOrigin}`,
        founderOrigin,
        agentId: founderOrigin,
        lineageId: founderOrigin,
        sessionKey: `agent:${founderOrigin}:main`,
        action: "assist",
        climateKind: "daily-learning",
        workType: learningTask.workType,
        task: learningTask.task,
        status: "planned",
        source: "daily_learning",
        ts,
        updatedAt: ts,
      },
      env,
    );
  }
}

export function ensureGenesisSkillCapabilityEntriesSync(params: {
  skillSummary?: GenesisSkillCapabilitySummary | null;
  ts?: number;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = params.env ?? process.env;
  const ts = params.ts ?? Date.now();
  const dayKey = resolveDayKey(ts);
  const latestEntries = readLatestGenesisProactiveWorkEntriesSync(env);
  for (const founderOrigin of KNOWN_FOUNDERS) {
    const workId = `skillcap:${dayKey}:${founderOrigin}`;
    const hasEntry = latestEntries.some((entry) => entry.workId === workId);
    if (hasEntry) {
      continue;
    }
    const task = buildGenesisFounderSkillCapabilityTask({
      founderOrigin,
      skillSummary: params.skillSummary,
    });
    if (!task) {
      continue;
    }
    appendGenesisProactiveWorkEntrySync(
      {
        workId,
        founderOrigin,
        agentId: founderOrigin,
        lineageId: founderOrigin,
        sessionKey: `agent:${founderOrigin}:main`,
        action: founderOrigin === "builder" ? "assist" : "reactivate",
        climateKind: "skill-capability",
        workType: task.workType,
        task: task.task,
        status: "in_progress",
        source: "workflow_dispatch",
        ts,
        updatedAt: ts,
      },
      env,
    );
  }
}

export function ensureGenesisExternalExecutionEntriesSync(params?: {
  ts?: number;
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
  skillSummary?: GenesisSkillCapabilitySummary | null;
  loginSummary?: GenesisSocietySummary["loginStatePoolSummary"] | null;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = params?.env ?? process.env;
  const ts = params?.ts ?? Date.now();
  const slotKey = resolveExternalExecutionSlotKey(ts);
  const latestEntries = readLatestGenesisProactiveWorkEntriesSync(env);
  const intentSummary = params?.intentSummary ?? readGenesisUserIntentSummarySnapshotSync(env);
  const skillSummary = params?.skillSummary ?? null;
  const loginSummary = params?.loginSummary ?? readGenesisLoginStatePoolSummarySync(env);
  const world = readGenesisWorldStateSync(env);
  const eventSummary = readGenesisEventLogSummarySnapshotSync(env);
  const recentOutcomes = latestEntries.filter((entry) => entry.status === "completed").slice(0, 8);
  const context = resolveGenesisExternalExecutionContext({
    intentSummary,
    skillSummary,
    loginSummary,
    eventSummary,
    recentOutcomes,
  });
  const reservedWorkIds = new Set<string>();

  const tryScheduleExternalEntry = (input: {
    workId: string;
    founderOrigin: GenesisFounderOrigin;
    lineageId: string;
    sessionKey: string;
    requestedBy: string;
    preference: { capability: GenesisPlatformCapability; platform?: string; score: number };
    candidatePlatform?: string;
    lineageDepth?: number;
  }): void => {
    if (reservedWorkIds.has(input.workId)) {
      return;
    }
    const account = acquireGenesisPlatformAccountSync({
      capability: input.preference.capability,
      platform: input.candidatePlatform,
      requestedBy: input.requestedBy,
      currentTask: `${input.lineageId}:${input.preference.capability}:${context.objective}`,
      env,
    });
    if (!account) {
      return;
    }
    const objective =
      (input.lineageDepth ?? 0) > 0
        ? `${context.objective} | lineage:${input.lineageId} depth:${input.lineageDepth} close with concrete public evidence`
        : context.objective;
    const task = buildGenesisFounderExternalExecutionTask({
      founderOrigin: input.founderOrigin,
      account,
      objective,
      capability: input.preference.capability,
      hotspotTitle: context.scoutHotspotTitle,
      hotspotUrl: context.scoutHotspotUrl,
    });
    const provisionalEntry: GenesisProactiveWorkEntry = {
      workId: input.workId,
      founderOrigin: input.founderOrigin,
      agentId: input.founderOrigin,
      lineageId: input.lineageId,
      sessionKey: input.sessionKey,
      platform: account.platform,
      accountRecordId: account.recordId,
      accountLabel: account.accountLabel,
      action: "assist",
      climateKind: "external-execution",
      workType: task.workType,
      task: task.task,
      status: "planned",
      driverKind: context.objectiveSource === "intent" ? "history" : context.objectiveSource,
      driverHistoryKind: context.driverHistoryKind ?? null,
      driverTopicCluster: context.driverTopicCluster ?? null,
      driverKeywords: context.driverKeywords,
      driverSummary:
        (input.lineageDepth ?? 0) > 0
          ? `${context.driverSummary} | lineage:${input.lineageId} | generation:${input.lineageDepth}`
          : context.driverSummary,
      hotspotTitle: context.scoutHotspotTitle,
      hotspotUrl: context.scoutHotspotUrl,
      artifactLabel: task.artifactLabel,
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    };
    const trafficFingerprint = buildGenesisTrafficFingerprint(provisionalEntry);
    const nextEntry: GenesisProactiveWorkEntry = {
      ...provisionalEntry,
      trafficFingerprint: trafficFingerprint ?? undefined,
    };
    const blockingEntries = latestEntries.filter(
      (entry) =>
        entry.workId === input.workId ||
        (entry.status !== "completed" &&
          entry.platform === account.platform &&
          entry.workType.startsWith("external_") &&
          ts - (entry.updatedAt ?? entry.ts ?? 0) < EXTERNAL_WORK_STALE_MS &&
          (entry.lineageId === input.lineageId ||
            (input.lineageId === input.founderOrigin && entry.founderOrigin === input.founderOrigin))),
    );
    if (
      blockingEntries.some(
        (entry) =>
          !shouldReplaceExistingExternalTask({
            existingEntry: entry,
            nextEntry,
            ts,
          }),
      )
    ) {
      releaseGenesisPlatformAccountSync({
        recordId: account.recordId,
        lastOutcome: `deferred_existing_task:${trafficFingerprint ?? "none"}`,
        env,
      });
      return;
    }
    for (const existingEntry of blockingEntries) {
      if (
        shouldReplaceExistingExternalTask({
          existingEntry,
          nextEntry,
          ts,
        })
      ) {
        appendGenesisProactiveWorkEntrySync(
          {
            ...existingEntry,
            status: "completed",
            resultPreview:
              existingEntry.resultPreview ??
              `Superseded by a newer hotspot-driven task with stronger driver signal.`,
            effectType: existingEntry.effectType ?? "report",
            effectEvidence:
              existingEntry.effectEvidence ??
              `superseded_by:${input.workId}`,
            externalStatus: existingEntry.externalStatus ?? "pending",
            externalEvidenceType: existingEntry.externalEvidenceType ?? "text",
            externalEvidenceValue:
              existingEntry.externalEvidenceValue ??
              `superseded_by:${input.workId}`,
            updatedAt: ts,
          },
          env,
        );
      }
    }
    if (
      task.workType === "external_publish" &&
      wasGenesisTrafficPublishedRecentlySync({
        platform: account.platform,
        fingerprint: trafficFingerprint,
        env,
      })
    ) {
      releaseGenesisPlatformAccountSync({
        recordId: account.recordId,
        lastOutcome: `duplicate_skipped:${trafficFingerprint ?? "none"}`,
        env,
      });
      return;
    }
    appendGenesisProactiveWorkEntrySync(nextEntry, env);
    reservedWorkIds.add(input.workId);
  };

  const externalExecutionOrder = ([
    "creator",
    "scout",
    "auditor",
    "negotiator",
    "builder",
  ] as GenesisFounderOrigin[])
    .map((founderOrigin) => ({
      founderOrigin,
      preference: resolveFounderExternalExecutionPreference({
        founderOrigin,
        context,
      }),
    }))
    .filter(
      (
        entry,
      ): entry is {
        founderOrigin: GenesisFounderOrigin;
        preference: { capability: GenesisPlatformCapability; platform?: string; score: number };
      } => Boolean(entry.preference),
    )
    .sort(
      (left, right) =>
        right.preference.score - left.preference.score ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    );
  for (const { founderOrigin, preference } of externalExecutionOrder) {
    const candidatePlatforms = resolveExternalExecutionCandidatePlatforms({
      founderOrigin,
      preference,
      context,
      loginSummary,
    });
    for (const candidatePlatform of candidatePlatforms) {
      const workId = `account:${slotKey}:${founderOrigin}:${candidatePlatform ?? "any"}:${preference.capability}`;
      tryScheduleExternalEntry({
        workId,
        founderOrigin,
        lineageId: founderOrigin,
        sessionKey: `agent:${founderOrigin}:main`,
        requestedBy: founderOrigin,
        preference,
        candidatePlatform,
        lineageDepth: 0,
      });
    }
  }

  const childCandidates = resolveChildLineageExternalExecutionCandidatesSync({
    env,
    context,
    world,
    ts,
  });
  for (const candidate of childCandidates) {
    const preference = resolveFounderExternalExecutionPreference({
      founderOrigin: candidate.founderOrigin,
      context,
    });
    if (!preference) {
      continue;
    }
    const candidatePlatforms = resolveExternalExecutionCandidatePlatforms({
      founderOrigin: candidate.founderOrigin,
      preference,
      context,
      loginSummary,
    });
    for (const candidatePlatform of candidatePlatforms) {
      const workId = `lineage-account:${slotKey}:${encodeURIComponent(candidate.lineageId)}:${
        candidatePlatform ?? "any"
      }:${preference.capability}`;
      tryScheduleExternalEntry({
        workId,
        founderOrigin: candidate.founderOrigin,
        lineageId: candidate.lineageId,
        sessionKey: candidate.latestSessionKey || `agent:${candidate.founderOrigin}:main`,
        requestedBy: `${candidate.founderOrigin}:${candidate.lineageId}`,
        preference,
        candidatePlatform,
        lineageDepth: candidate.depth,
      });
    }
  }
}

function resolveFallbackPreviewForEntry(
  entry: GenesisProactiveWorkEntry,
  latestEntries: GenesisProactiveWorkEntry[],
): string | undefined {
  if (!entry.founderOrigin) {
    return undefined;
  }
  const founderEntries = latestEntries.filter(
    (candidate) =>
      candidate.workId !== entry.workId &&
      candidate.founderOrigin === entry.founderOrigin &&
      candidate.updatedAt >= entry.updatedAt &&
      !!candidate.resultPreview,
  );
  if (entry.workType === "learning") {
    return founderEntries.find(
      (candidate) =>
        candidate.status === "completed" &&
        isPreviewCompatibleWithEntry(entry, candidate.resultPreview),
    )?.resultPreview;
  }
  if (entry.workType.startsWith("external_")) {
    return founderEntries.find((candidate) => {
      if (
        candidate.status !== "completed" ||
        !isPreviewCompatibleWithEntry(entry, candidate.resultPreview)
      ) {
        return false;
      }
      if (candidate.platform !== entry.platform) {
        return false;
      }
      if (entry.accountRecordId && candidate.accountRecordId && candidate.accountRecordId !== entry.accountRecordId) {
        return false;
      }
      if (entry.workId === candidate.workId) {
        return true;
      }
      if (entry.trafficFingerprint && candidate.trafficFingerprint) {
        return entry.trafficFingerprint === candidate.trafficFingerprint;
      }
      const entryHotspotUrl = extractExternalHotspotUrl(entry);
      const candidateHotspotUrl = extractExternalHotspotUrl(candidate);
      if (entryHotspotUrl && candidateHotspotUrl) {
        return entryHotspotUrl === candidateHotspotUrl;
      }
      return false;
    })?.resultPreview;
  }
  return founderEntries.find(
    (candidate) =>
      candidate.status === "completed" &&
      isPreviewCompatibleWithEntry(entry, candidate.resultPreview) &&
      (candidate.workType === entry.workType ||
        candidate.action === entry.action ||
        candidate.source === "run_completion"),
  )?.resultPreview;
}

function isPreviewCompatibleWithEntry(
  entry: GenesisProactiveWorkEntry,
  preview: string | undefined,
): boolean {
  const normalized = normalizePreview(preview)?.toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }
  if (entry.workType.startsWith("external_") && previewMentionsDifferentPlatform(entry, normalized)) {
    return false;
  }
  if (entry.workType === "learning") {
    return true;
  }
  switch (entry.workType) {
    case "skill_build":
      return /skill|tool|workflow|automation|executor|script|install|deploy|build/.test(normalized);
    case "skill_check":
      return /skill|readiness|coverage|scan|research|source|signal|alternative|opportunity|gap/.test(normalized);
    case "skill_plan":
      return /publish|content|channel|draft|plan|narrative|coverage|rollout/.test(normalized);
    case "skill_audit":
      return /audit|risk|unsafe|blocker|finding|vulnerability|check|verify|mitigation/.test(normalized);
    case "skill_coordination":
      return /coordination|owner|ownership|adoption|lane|resource|channel|priority|schedule/.test(normalized);
    case "tooling":
      return /skill|tool|workflow|automation|executor|script|build/.test(normalized);
    case "synthesis":
      return /content|draft|plan|brief|outline|proposal|narrative|script/.test(normalized);
    case "audit":
      return /finding|vulnerability|risk|patch|audit|check|issue|weakness/.test(normalized);
    case "coordination":
      return /coordination|resource|allocation|handoff|channel|schedule|owner|rollout/.test(normalized);
    case "intelligence":
      return /signal|opportunity|market|trend|research|source|intel|lead/.test(normalized);
    case "external_publish":
      return /publish|posted|draft|thread|content|weibo|post|channel/.test(normalized);
    case "external_signal":
      return /signal|opportunity|trend|source|intel|watch|research|market/.test(normalized);
    case "external_audit":
      return /risk|audit|finding|comment|feedback|issue|moderation|exposure/.test(normalized);
    case "external_coordination":
      return /coordination|channel|response|schedule|routing|audience|owner|resource/.test(normalized);
    case "external_automation":
      return /automation|workflow|executor|tool|script|publish|channel/.test(normalized);
    default:
      return true;
  }
}

function shouldPromoteWorkInProgress(
  entry: GenesisProactiveWorkEntry,
  latestEntries: GenesisProactiveWorkEntry[],
): boolean {
  if (!entry.founderOrigin) {
    return false;
  }
  return latestEntries.some(
    (candidate) =>
      candidate.workId !== entry.workId &&
      candidate.founderOrigin === entry.founderOrigin &&
      candidate.updatedAt >= entry.updatedAt &&
      candidate.status !== "planned",
  );
}

function isGenericFounderBacklogEntry(entry: GenesisProactiveWorkEntry): boolean {
  return (
    entry.status === "in_progress" &&
    entry.source === "workflow_dispatch" &&
    (entry.workType === "synthesis" ||
      entry.workType === "audit" ||
      entry.workType === "coordination")
  );
}

function hasNewerGenericFounderCycle(
  entry: GenesisProactiveWorkEntry,
  latestEntries: GenesisProactiveWorkEntry[],
): boolean {
  return latestEntries.some(
    (candidate) =>
      candidate.workId !== entry.workId &&
      candidate.founderOrigin === entry.founderOrigin &&
      candidate.workType === entry.workType &&
      candidate.updatedAt > entry.updatedAt,
  );
}

function shouldReclaimStaleGenericFounderWork(
  entry: GenesisProactiveWorkEntry,
  latestEntries: GenesisProactiveWorkEntry[],
  ts: number,
): boolean {
  if (!isGenericFounderBacklogEntry(entry)) {
    return false;
  }
  const ageMs = Math.max(0, ts - (entry.updatedAt ?? entry.ts ?? 0));
  if (ageMs < GENERIC_FOUNDER_WORK_STALE_MS) {
    return false;
  }
  if (hasNewerGenericFounderCycle(entry, latestEntries)) {
    return true;
  }
  return ageMs >= GENERIC_FOUNDER_WORK_FORCE_RECLAIM_MS;
}

function buildStaleGenericFounderReclaimPreview(entry: GenesisProactiveWorkEntry): string {
  switch (entry.workType) {
    case "synthesis":
      return "Reclaimed stale synthesis cycle and deferred it to a newer content pass.";
    case "audit":
      return "Reclaimed stale audit cycle and deferred it to a newer verification pass.";
    case "coordination":
      return "Reclaimed stale coordination cycle and deferred it to a newer routing pass.";
    default:
      return "Reclaimed stale founder workflow cycle.";
  }
}

export function syncGenesisProactiveWorkOutcomesSync(params?: {
  ts?: number;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = params?.env ?? process.env;
  const ts = params?.ts ?? Date.now();
  const latestEntries = readLatestGenesisProactiveWorkEntriesSync(env);
  for (const entry of latestEntries) {
    if (entry.status === "completed" || !entry.founderOrigin) {
      continue;
    }
    const directPreview = resolveFounderPreviewForSession(entry.sessionKey);
    const preview = isPreviewCompatibleWithEntry(entry, directPreview)
      ? directPreview
      : resolveFallbackPreviewForEntry(entry, latestEntries);
    if (preview) {
      appendGenesisProactiveWorkEntrySync(
        {
          ...entry,
          status: "completed",
          resultPreview: preview,
          updatedAt: ts,
          ts,
        },
        env,
      );
      continue;
    }
    if (shouldReclaimStaleGenericFounderWork(entry, latestEntries, ts)) {
      appendGenesisProactiveWorkEntrySync(
        {
          ...entry,
          status: "completed",
          resultPreview: buildStaleGenericFounderReclaimPreview(entry),
          updatedAt: ts,
          ts,
        },
        env,
      );
      continue;
    }
    if (entry.status === "planned" && shouldPromoteWorkInProgress(entry, latestEntries)) {
      appendGenesisProactiveWorkEntrySync(
        {
          ...entry,
          status: "in_progress",
          updatedAt: ts,
          ts,
        },
        env,
      );
    }
  }
}

export function syncGenesisDailyLearningOutcomesSync(params?: {
  ts?: number;
  env?: NodeJS.ProcessEnv;
}): void {
  syncGenesisProactiveWorkOutcomesSync(params);
}

export function readGenesisProactiveWorkSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisProactiveWorkSummary | null {
  return readJsonFileSync<GenesisProactiveWorkSummary>(resolveGenesisProactiveWorkSummaryPath(env));
}

export function readGenesisProactiveWorkSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisProactiveWorkSummary {
  return reduceGenesisProactiveWorkSummary(readLatestGenesisProactiveWorkEntriesSync(env));
}

export function writeGenesisProactiveWorkSummarySnapshotSync(
  summary: GenesisProactiveWorkSummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisProactiveWorkSummaryPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
}

export function reduceGenesisProactiveWorkSummary(
  entries: GenesisProactiveWorkEntry[],
): GenesisProactiveWorkSummary {
  if (entries.length === 0) {
    return { ...DEFAULT_GENESIS_PROACTIVE_WORK_SUMMARY };
  }
  const latestEntries = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
  const founderStats = new Map<
    GenesisFounderOrigin,
    {
      plannedCount: number;
      inProgressCount: number;
      completedCount: number;
      learningPlannedCount: number;
      learningInProgressCount: number;
      learningCompletedCount: number;
      resultCount: number;
      outcomeCount: number;
      activityScore: number;
    }
  >();
  for (const founderOrigin of KNOWN_FOUNDERS) {
    founderStats.set(founderOrigin, {
      plannedCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      learningPlannedCount: 0,
      learningInProgressCount: 0,
      learningCompletedCount: 0,
      resultCount: 0,
      outcomeCount: 0,
      activityScore: 0,
    });
  }
  for (const entry of latestEntries) {
    if (!entry.founderOrigin || !founderStats.has(entry.founderOrigin)) {
      continue;
    }
    const stats = founderStats.get(entry.founderOrigin)!;
    const isLearningEntry = entry.workType === "learning";
    if (entry.status === "completed") {
      stats.completedCount += 1;
      stats.activityScore += 1.2;
      if (isLearningEntry) {
        stats.learningCompletedCount += 1;
        stats.activityScore += 0.55;
      }
      if (entry.resultPreview) {
        stats.resultCount += 1;
        stats.activityScore += 0.8;
      }
      if (entry.effectType) {
        stats.outcomeCount += 1;
        stats.activityScore += 0.45;
      }
    } else if (entry.status === "in_progress") {
      stats.inProgressCount += 1;
      stats.activityScore += 0.85;
      if (isLearningEntry) {
        stats.learningInProgressCount += 1;
        stats.activityScore += 0.4;
      }
    } else {
      stats.plannedCount += 1;
      stats.activityScore += 0.45;
      if (isLearningEntry) {
        stats.learningPlannedCount += 1;
        stats.activityScore += 0.3;
      }
    }
    if (entry.artifactLabel) {
      stats.activityScore += 0.3;
    }
  }
  const founderActivityLeaders = [...founderStats.entries()]
    .map(([founderOrigin, stats]) => ({
      founderOrigin,
      ...stats,
      activityScore: Number(stats.activityScore.toFixed(6)),
    }))
    .filter((entry) => entry.activityScore > 0)
    .sort(
      (left, right) =>
        right.activityScore - left.activityScore ||
        right.completedCount - left.completedCount ||
        right.resultCount - left.resultCount,
    );
  const concreteOutcomeLeaders = [...founderActivityLeaders]
    .filter((entry) => entry.outcomeCount > 0)
    .sort(
      (left, right) =>
        right.outcomeCount - left.outcomeCount ||
        right.completedCount - left.completedCount ||
        right.activityScore - left.activityScore,
    );
  const recentConcreteOutcomes = latestEntries.filter(
    (entry) => entry.status === "completed" && entry.effectType,
  );
  const recentLearningEntries = latestEntries.filter((entry) => entry.workType === "learning");
  const recentLearningOutcomes = latestEntries.filter(
    (entry) => entry.workType === "learning" && entry.status === "completed",
  );
  const learningLeaders = founderActivityLeaders
    .filter((entry) => entry.learningPlannedCount > 0 || entry.learningCompletedCount > 0)
    .sort(
      (left, right) =>
        right.learningCompletedCount - left.learningCompletedCount ||
        right.learningPlannedCount - left.learningPlannedCount ||
        right.activityScore - left.activityScore,
    );
  const highestActiveLeader = founderActivityLeaders[0];
  return {
    totalEntryCount: latestEntries.length,
    plannedCount: latestEntries.filter((entry) => entry.status === "planned").length,
    inProgressCount: latestEntries.filter((entry) => entry.status === "in_progress").length,
    completedCount: latestEntries.filter((entry) => entry.status === "completed").length,
    learningPlannedCount: recentLearningEntries.filter((entry) => entry.status === "planned").length,
    learningInProgressCount: recentLearningEntries.filter((entry) => entry.status === "in_progress").length,
    learningCompletedCount: recentLearningOutcomes.length,
    activeLearningFounderCount: learningLeaders.length,
    activeFounderCount: founderActivityLeaders.length,
    highestActiveFounderOrigin: highestActiveLeader?.founderOrigin ?? null,
    highestActiveFounderScore: highestActiveLeader?.activityScore ?? 0,
    highestLearningFounderOrigin: learningLeaders[0]?.founderOrigin ?? null,
    concreteOutcomeCount: recentConcreteOutcomes.length,
    highestConcreteOutcomeFounderOrigin: concreteOutcomeLeaders[0]?.founderOrigin ?? null,
    founderActivityLeaders: founderActivityLeaders.slice(0, 5),
    recentLearningEntries: recentLearningEntries.slice(0, 6),
    recentLearningOutcomes: recentLearningOutcomes.slice(0, 6),
    recentConcreteOutcomes: recentConcreteOutcomes.slice(0, 6),
    recentEntries: latestEntries.slice(0, 8),
  };
}

export function refreshGenesisProactiveWorkSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisProactiveWorkSummary {
  const summary = readGenesisProactiveWorkSummarySync(env);
  writeGenesisProactiveWorkSummarySnapshotSync(summary, env);
  return summary;
}
