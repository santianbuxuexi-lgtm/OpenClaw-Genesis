import fs from "node:fs";
import path from "node:path";
import type { GenesisDispatchAssignmentRecord, GenesisSocietySummary } from "./state.js";
import { resolveGenesisStateDir } from "./state.js";
import {
  readGenesisLineageSummarySync,
} from "./lineage-summary.js";
import {
  readGenesisLoginStatePoolSummarySync,
} from "./login-state-pool.js";
import {
  readGenesisProactiveWorkSummarySync,
} from "./proactive-work.js";
import {
  readGenesisUserIntentSummarySnapshotSync,
  readGenesisUserIntentSummarySync,
} from "./user-intent.js";

export type GenesisStrategicMemoryRole = "main" | "negotiator";

type GenesisStrategicMemorySnapshot = {
  role: GenesisStrategicMemoryRole;
  generatedAt: number;
  strongestTopicCluster?: string | null;
  recentKeywords: string[];
  recentPublicOutputs: string[];
  activeWork: string[];
  accountStatus?: string | null;
  expansionStatus?: string | null;
};

function resolveGenesisStrategicMemoryPath(
  role: GenesisStrategicMemoryRole,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveGenesisStateDir(env), "memory", `${role}.json`);
}

function normalizePreview(text: string | undefined, maxLength = 180): string | null {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function isTrustedPublicOutput(
  entry: NonNullable<GenesisSocietySummary["proactiveWorkSummary"]>["recentConcreteOutcomes"][number],
): boolean {
  if (entry.workType !== "external_publish" || entry.status !== "completed") {
    return false;
  }
  if (entry.platform === "weibo") {
    return (
      entry.externalEvidenceType === "post_id" &&
      typeof entry.externalEvidenceValue === "string" &&
      /weibo\.com\/\d+\/[A-Za-z0-9]+/i.test(entry.externalEvidenceValue)
    );
  }
  if (entry.platform === "toutiao") {
    return (
      entry.externalEvidenceType === "thread_id" &&
      typeof entry.externalEvidenceValue === "string" &&
      /toutiao\.com\/w\/\d+/i.test(entry.externalEvidenceValue)
    );
  }
  return Boolean(entry.externalEvidenceValue);
}

function buildRecentPublicOutputs(
  proactive: NonNullable<GenesisSocietySummary["proactiveWorkSummary"]>,
): string[] {
  return proactive.recentConcreteOutcomes
    .filter((entry) => isTrustedPublicOutput(entry))
    .slice(0, 3)
    .map((entry) => {
      const hotspot = normalizePreview(entry.hotspotTitle ?? undefined, 72);
      const content = normalizePreview(
        entry.contentPreview ?? entry.effectEvidence ?? entry.resultPreview ?? entry.task,
        120,
      );
      return [
        entry.platform ?? "platform",
        hotspot ? `hotspot=${hotspot}` : null,
        content ? `content=${content}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    });
}

function buildActiveWorkLines(
  proactive: NonNullable<GenesisSocietySummary["proactiveWorkSummary"]>,
  role: GenesisStrategicMemoryRole,
): string[] {
  const founder = role === "negotiator" ? "negotiator" : undefined;
  return proactive.recentEntries
    .filter((entry) => entry.status !== "completed")
    .filter((entry) => (founder ? entry.founderOrigin === founder : true))
    .slice(0, 4)
    .map((entry) => {
      const task = normalizePreview(entry.task, 110) ?? entry.workType;
      const driver = normalizePreview(entry.driverSummary, 90);
      return [
        `${entry.founderOrigin ?? entry.agentId}:${entry.workType}:${entry.status}`,
        task,
        driver ? `driver=${driver}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    });
}

function buildAccountStatus(
  loginSummary: ReturnType<typeof readGenesisLoginStatePoolSummarySync>,
): string {
  return [
    `ready=${loginSummary.readyAccountCount}`,
    `busy=${loginSummary.busyAccountCount}`,
    `relogin=${loginSummary.reloginNeededCount}`,
    loginSummary.highestReadyPlatform ? `best=${loginSummary.highestReadyPlatform}` : null,
    loginSummary.highestGapPlatform ? `gap=${loginSummary.highestGapPlatform}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildExpansionStatus(
  lineageSummary: ReturnType<typeof readGenesisLineageSummarySync>,
): string | null {
  const vitality = lineageSummary?.vitalitySummary;
  if (!vitality) {
    return null;
  }
  return [
    `children=${vitality.childLineageCount ?? 0}`,
    `secondGen=${vitality.secondGenerationChildCount ?? 0}`,
    `thirdGen=${vitality.thirdGenerationChildCount ?? 0}`,
    `multigen=${vitality.multiGenerationLineageCount ?? 0}`,
    `working=${vitality.specialtyWorkingChildCount ?? 0}`,
    `proactive=${vitality.specialtyProactiveChildCount ?? 0}`,
  ].join(" ");
}

function buildSnapshot(
  role: GenesisStrategicMemoryRole,
  env: NodeJS.ProcessEnv = process.env,
): GenesisStrategicMemorySnapshot {
  const proactive = readGenesisProactiveWorkSummarySync(env);
  const intent =
    readGenesisUserIntentSummarySnapshotSync(env) ?? readGenesisUserIntentSummarySync(env);
  const lineage = readGenesisLineageSummarySync(env);
  const login = readGenesisLoginStatePoolSummarySync(env);
  return {
    role,
    generatedAt: Date.now(),
    strongestTopicCluster: intent?.strongestTopicCluster ?? null,
    recentKeywords: (intent?.recentKeywords ?? []).slice(0, 6),
    recentPublicOutputs: proactive ? buildRecentPublicOutputs(proactive) : [],
    activeWork: proactive ? buildActiveWorkLines(proactive, role) : [],
    accountStatus: role === "negotiator" ? buildAccountStatus(login) : null,
    expansionStatus: buildExpansionStatus(lineage),
  };
}

export function refreshGenesisStrategicMemorySnapshotSync(
  role: GenesisStrategicMemoryRole,
  env: NodeJS.ProcessEnv = process.env,
): GenesisStrategicMemorySnapshot {
  const snapshot = buildSnapshot(role, env);
  const filePath = resolveGenesisStrategicMemoryPath(role, env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  return snapshot;
}

function buildPrompt(snapshot: GenesisStrategicMemorySnapshot): string | undefined {
  const lines: string[] = ["Strategic memory (internal):"];
  if (snapshot.strongestTopicCluster || snapshot.recentKeywords.length > 0) {
    lines.push(
      `- User focus: cluster=${snapshot.strongestTopicCluster ?? "none"} keywords=${snapshot.recentKeywords.join(",") || "none"}`,
    );
  }
  if (snapshot.recentPublicOutputs.length > 0) {
    lines.push("- Recent public outputs:");
    for (const item of snapshot.recentPublicOutputs) {
      lines.push(`  - ${item}`);
    }
  }
  if (snapshot.activeWork.length > 0) {
    lines.push(`- Active ${snapshot.role} work cues:`);
    for (const item of snapshot.activeWork) {
      lines.push(`  - ${item}`);
    }
  }
  if (snapshot.accountStatus) {
    lines.push(`- Platform readiness: ${snapshot.accountStatus}`);
  }
  if (snapshot.expansionStatus) {
    lines.push(`- Expansion state: ${snapshot.expansionStatus}`);
  }
  if (lines.length <= 1) {
    return undefined;
  }
  lines.push(
    "Use this as durable working memory for continuity and prioritization. Do not present it as proof unless the current run has explicit evidence.",
  );
  return lines.join("\n");
}

export function resolveGenesisStrategicMemoryPromptSync(params: {
  assignment?: GenesisDispatchAssignmentRecord | null;
  agentId?: string | null;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const env = params.env ?? process.env;
  const assignmentAgentId = params.assignment?.assignment.agentId?.trim().toLowerCase();
  const fallbackAgentId = params.agentId?.trim().toLowerCase();
  const role: GenesisStrategicMemoryRole | undefined =
    assignmentAgentId === "negotiator" || fallbackAgentId === "negotiator"
      ? "negotiator"
      : assignmentAgentId === "main" ||
          params.assignment?.assignment.action === "lead" ||
          fallbackAgentId === "main"
        ? "main"
        : undefined;
  if (!role) {
    return undefined;
  }
  const snapshot = refreshGenesisStrategicMemorySnapshotSync(role, env);
  return buildPrompt(snapshot);
}
