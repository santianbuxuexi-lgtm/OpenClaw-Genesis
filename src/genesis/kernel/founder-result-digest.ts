import {
  loadSessionEntry,
  readSessionPreviewItemsFromTranscript,
} from "../../gateway/session-utils.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import type {
  GenesisSocietyDispatchAssignment,
  GenesisSocietyDispatchPlan,
} from "./workflow.js";

export type GenesisFounderResultDigestEntry = {
  agentId: string;
  sessionKey: string;
  action: GenesisSocietyDispatchAssignment["action"];
  mode: GenesisSocietyDispatchAssignment["mode"];
  preview: string;
};

export type GenesisFounderResultDigest = {
  entries: GenesisFounderResultDigestEntry[];
};

function normalizeFounderPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shouldSkipFounderPreview(text: string): boolean {
  const normalized = normalizeFounderPreview(text);
  return normalized.length === 0 || normalized === "HEARTBEAT_OK";
}

export function resolveFounderPreviewForSession(sessionKey: string): string | null {
  const parsed = parseAgentSessionKey(sessionKey);
  const agentId = parsed?.agentId;
  const loaded = loadSessionEntry(sessionKey);
  const entry = loaded.entry;
  if (!entry?.sessionId) {
    return null;
  }

  const items = readSessionPreviewItemsFromTranscript(
    entry.sessionId,
    loaded.storePath,
    entry.sessionFile,
    agentId,
    8,
    280,
  );
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.role !== "assistant") {
      continue;
    }
    const normalized = normalizeFounderPreview(item.text);
    if (shouldSkipFounderPreview(normalized)) {
      continue;
    }
    return normalized;
  }
  return null;
}

export function resolveGenesisFounderResultDigest(params: {
  society?: GenesisSocietyDispatchPlan | null;
  currentSessionKey?: string | null;
}): GenesisFounderResultDigest | undefined {
  const society = params.society;
  if (!society) {
    return undefined;
  }

  const entries: GenesisFounderResultDigestEntry[] = [];
  for (const assignment of society.assignments) {
    if (assignment.sessionKey === params.currentSessionKey) {
      continue;
    }
    if (assignment.action === "lead") {
      continue;
    }
    const preview = resolveFounderPreviewForSession(assignment.sessionKey);
    if (!preview) {
      continue;
    }
    entries.push({
      agentId: assignment.agentId,
      sessionKey: assignment.sessionKey,
      action: assignment.action,
      mode: assignment.mode,
      preview,
    });
  }

  return entries.length > 0 ? { entries } : undefined;
}

export function buildGenesisFounderResultDigestPrompt(
  digest: GenesisFounderResultDigest | null | undefined,
): string | undefined {
  if (!digest || digest.entries.length === 0) {
    return undefined;
  }
  const lines = [
    "Recent founder result digest (internal):",
    ...digest.entries.map(
      (entry) => `- ${entry.agentId} [${entry.action}/${entry.mode}]: ${entry.preview}`,
    ),
    "Use these recent founder outputs as working context when synthesizing the final answer.",
    "Treat this digest as provisional working context, not as proof that external execution or completed outcomes already happened.",
    "Only claim a completed result when you also have explicit evidence or a completed outcome.",
    "Prefer concrete facts, findings, and actionable conclusions over internal coordination talk.",
  ];
  return lines.join("\n");
}
