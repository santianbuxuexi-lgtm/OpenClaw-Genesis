import fs from "node:fs";
import path from "node:path";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import {
  resolveGenesisFocusSummaryPath,
  resolveGenesisStateDir,
  readJsonDirSync,
  readJsonFileSync,
} from "./state.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import { resolveGenesisSkillEvolutionBias } from "./skill-evolution.js";
import { resolveGenesisUserIntentBias } from "./user-intent.js";

export type GenesisFocusStatus = "active" | "paused" | "completed";

export type GenesisLineageFocusItem = {
  id: string;
  title: string;
  domain?: string;
  intensity: number;
  status: GenesisFocusStatus;
  triggerMode: "manual" | "workflow" | "heartbeat" | "search";
  keywords?: string[];
  createdAt: number;
  updatedAt: number;
};

export type GenesisLineageTriggerItem = {
  id: string;
  focusId?: string;
  title: string;
  status: "active" | "paused" | "completed";
  triggerMode: "workflow" | "heartbeat" | "search";
  threshold?: number;
  lastTriggeredAt?: number;
  activationScore?: number;
  createdAt: number;
  updatedAt: number;
};

export type GenesisFocusSummary = {
  activeFocusCount: number;
  activeLineageCount: number;
  activeTriggerCount: number;
  topFocusedLineages: Array<{
    lineageId: string;
    activeFocusCount: number;
    activeTriggerCount: number;
    totalIntensity: number;
    strongestFocusTitle?: string;
  }>;
};

const DEFAULT_GENESIS_FOCUS_SUMMARY: GenesisFocusSummary = {
  activeFocusCount: 0,
  activeLineageCount: 0,
  activeTriggerCount: 0,
  topFocusedLineages: [],
};

type GenesisLineageFocusRecord = {
  lineageId: string;
  items: GenesisLineageFocusItem[];
  triggers?: GenesisLineageTriggerItem[];
  updatedAt: number;
};

export type GenesisFocusActivationEvent = {
  trigger: "cron" | "heartbeat" | "workflow" | "search";
  summary: string;
  intensity: number;
  ts?: number;
};

function resolveGenesisFocusCandidateIds(lineageId: string): string[] {
  const trimmed = lineageId.trim();
  if (!trimmed) {
    return [];
  }
  const candidates = new Set<string>([trimmed]);
  const parsed = parseAgentSessionKey(trimmed);
  if (parsed?.agentId) {
    candidates.add(parsed.agentId);
    candidates.add(`agent:${parsed.agentId}:main`);
  }
  if (!trimmed.includes(":")) {
    candidates.add(`agent:${trimmed}:main`);
  }
  return [...candidates];
}

export function resolveGenesisLineageFocusPath(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "focus", `${encodeURIComponent(lineageId)}.json`);
}

export function readGenesisLineageFocusItemsSync(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageFocusItem[] {
  for (const candidate of resolveGenesisFocusCandidateIds(lineageId)) {
    const record = readJsonFileSync<GenesisLineageFocusRecord>(
      resolveGenesisLineageFocusPath(candidate, env),
    );
    if (record?.items) {
      return record.items;
    }
  }
  return [];
}

export function writeGenesisLineageFocusItemsSync(
  lineageId: string,
  items: GenesisLineageFocusItem[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisLineageFocusPath(lineageId, env);
  const previous = readJsonFileSync<GenesisLineageFocusRecord>(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record: GenesisLineageFocusRecord = {
    lineageId,
    items,
    triggers: Array.isArray(previous?.triggers) ? previous.triggers : [],
    updatedAt: Date.now(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  refreshGenesisFocusSummarySnapshotSync(env);
}

export function readGenesisLineageTriggersSync(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): GenesisLineageTriggerItem[] {
  for (const candidate of resolveGenesisFocusCandidateIds(lineageId)) {
    const record = readJsonFileSync<GenesisLineageFocusRecord>(
      resolveGenesisLineageFocusPath(candidate, env),
    );
    if (record?.triggers) {
      return record.triggers;
    }
  }
  return [];
}

export function writeGenesisLineageTriggersSync(
  lineageId: string,
  triggers: GenesisLineageTriggerItem[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisLineageFocusPath(lineageId, env);
  const previous = readJsonFileSync<GenesisLineageFocusRecord>(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record: GenesisLineageFocusRecord = {
    lineageId,
    items: Array.isArray(previous?.items) ? previous.items : [],
    triggers,
    updatedAt: Date.now(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  refreshGenesisFocusSummarySnapshotSync(env);
}

function resolveEventTriggerModes(
  trigger: GenesisFocusActivationEvent["trigger"],
): GenesisLineageTriggerItem["triggerMode"][] {
  switch (trigger) {
    case "workflow":
      return ["workflow", "search"];
    case "heartbeat":
      return ["heartbeat"];
    case "search":
      return ["search", "workflow"];
    case "cron":
    default:
      return ["workflow"];
  }
}

function matchesTriggerSummary(params: {
  trigger: GenesisLineageTriggerItem;
  focus?: GenesisLineageFocusItem;
  summary: string;
}): boolean {
  const normalizedSummary = params.summary.trim().toLowerCase();
  if (!normalizedSummary) {
    return true;
  }
  const keywordPool = [
    ...(Array.isArray(params.focus?.keywords) ? params.focus.keywords : []),
    params.trigger.title,
    params.focus?.title,
    params.focus?.domain,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
  if (keywordPool.length === 0) {
    return true;
  }
  return keywordPool.some((keyword) => normalizedSummary.includes(keyword));
}

export function activateGenesisTriggersForEventSync(
  event: GenesisFocusActivationEvent,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const profile = readGenesisExperimentProfileSync(env);
  const focusDir = path.join(resolveGenesisStateDir(env), "focus");
  const records = readJsonDirSync<GenesisLineageFocusRecord>(focusDir);
  if (records.length === 0) {
    return 0;
  }
  const ts = event.ts ?? Date.now();
  const triggerModes = new Set(resolveEventTriggerModes(event.trigger));
  let activatedCount = 0;

  for (const record of records) {
    const items = Array.isArray(record.items) ? record.items : [];
    const triggers = Array.isArray(record.triggers) ? record.triggers : [];
    if (triggers.length === 0) {
      continue;
    }
    const focusById = new Map(items.map((item) => [item.id, item]));
    let changed = false;
    const nextTriggers = triggers.map((trigger) => {
      if (trigger.status !== "active" || !triggerModes.has(trigger.triggerMode)) {
        return trigger;
      }
      const linkedFocus = trigger.focusId ? focusById.get(trigger.focusId) : undefined;
      if (
        linkedFocus &&
        linkedFocus.status !== "active" &&
        linkedFocus.status !== "paused"
      ) {
        return trigger;
      }
      if (!matchesTriggerSummary({ trigger, focus: linkedFocus, summary: event.summary })) {
        return trigger;
      }
      const evolutionBias = resolveGenesisSkillEvolutionBias(record.lineageId, env);
      const nextScore = Math.min(
        20,
        Math.max(0, (trigger.activationScore ?? 0) * 0.72) +
          Math.max(0.5, event.intensity * profile.triggerActivationGain) +
          Math.max(0, evolutionBias * 0.25),
      );
      changed = true;
      activatedCount += 1;
      return {
        ...trigger,
        lastTriggeredAt: ts,
        activationScore: nextScore,
        updatedAt: ts,
      };
    });
    if (!changed) {
      continue;
    }
    const filePath = resolveGenesisLineageFocusPath(record.lineageId, env);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          lineageId: record.lineageId,
          items,
          triggers: nextTriggers,
          updatedAt: ts,
        } satisfies GenesisLineageFocusRecord,
        null,
        2,
      )}\n`,
      "utf-8",
    );
  }

  if (activatedCount > 0) {
    refreshGenesisFocusSummarySnapshotSync(env);
  }

  return activatedCount;
}

export function readGenesisFocusSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisFocusSummary {
  const records = readJsonDirSync<GenesisLineageFocusRecord>(
    path.join(resolveGenesisStateDir(env), "focus"),
  );
  const normalized = records
    .map((record) => {
      const activeItems = (Array.isArray(record.items) ? record.items : []).filter(
        (item) => item.status === "active",
      );
      const activeTriggers = (Array.isArray(record.triggers) ? record.triggers : []).filter(
        (item) => item.status === "active",
      );
      const totalIntensity = activeItems.reduce((sum, item) => sum + Math.max(0, item.intensity), 0);
      const strongest = [...activeItems].sort((a, b) => b.intensity - a.intensity)[0];
      return {
        lineageId: record.lineageId,
        activeItems,
        activeTriggers,
        totalIntensity,
        strongestFocusTitle: strongest?.title,
      };
    })
    .filter((record) => record.activeItems.length > 0 || record.activeTriggers.length > 0);
  return {
    activeFocusCount: normalized.reduce((sum, record) => sum + record.activeItems.length, 0),
    activeTriggerCount: normalized.reduce((sum, record) => sum + record.activeTriggers.length, 0),
    activeLineageCount: normalized.length,
    topFocusedLineages: normalized
      .sort(
        (left, right) =>
          right.totalIntensity - left.totalIntensity ||
          right.activeItems.length - left.activeItems.length,
      )
      .slice(0, 5)
      .map((record) => ({
        lineageId: record.lineageId,
        activeFocusCount: record.activeItems.length,
        activeTriggerCount: record.activeTriggers.length,
        totalIntensity: record.totalIntensity,
        ...(record.strongestFocusTitle ? { strongestFocusTitle: record.strongestFocusTitle } : {}),
      })),
  };
}

export function readGenesisFocusSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisFocusSummary | null {
  const snapshot = readJsonFileSync<GenesisFocusSummary>(resolveGenesisFocusSummaryPath(env));
  if (!snapshot) {
    return null;
  }
  return {
    ...DEFAULT_GENESIS_FOCUS_SUMMARY,
    ...snapshot,
    topFocusedLineages: Array.isArray(snapshot.topFocusedLineages)
      ? snapshot.topFocusedLineages
      : [],
  };
}

export function writeGenesisFocusSummarySnapshotSync(
  summary: GenesisFocusSummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisFocusSummaryPath(env);
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

export function refreshGenesisFocusSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisFocusSummary {
  const summary = readGenesisFocusSummarySync(env);
  writeGenesisFocusSummarySnapshotSync(summary, env);
  return summary;
}

export function resolveGenesisFocusBias(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const evolutionBias = resolveGenesisSkillEvolutionBias(lineageId, env);
  const userIntentBias = resolveGenesisUserIntentBias(lineageId, env);
  const items = readGenesisLineageFocusItemsSync(lineageId, env).filter(
    (item) => item.status === "active",
  );
  if (items.length === 0) {
    const triggers = readGenesisLineageTriggersSync(lineageId, env).filter(
      (item) => item.status === "active",
    );
    if (triggers.length === 0) {
      return Math.max(0, evolutionBias + userIntentBias);
    }
    const triggerScore = triggers.reduce(
      (sum, item) => sum + Math.max(0, item.activationScore ?? item.threshold ?? 1),
      0,
    );
    return Math.min(
      20,
      triggers.length * 1.25 + triggerScore + Math.max(0, evolutionBias) + Math.max(0, userIntentBias),
    );
  }
  const totalIntensity = items.reduce((sum, item) => sum + Math.max(0, item.intensity), 0);
  const triggers = readGenesisLineageTriggersSync(lineageId, env).filter(
    (item) => item.status === "active",
  );
  const triggerScore = triggers.reduce(
    (sum, item) => sum + Math.max(0, item.activationScore ?? item.threshold ?? 1),
    0,
  );
  return Math.min(
    20,
    items.length * 1.5 +
      totalIntensity * 2 +
      triggers.length +
      triggerScore +
      Math.max(0, evolutionBias) +
      Math.max(0, userIntentBias),
  );
}
