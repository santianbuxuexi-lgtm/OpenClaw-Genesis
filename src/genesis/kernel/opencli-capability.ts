import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  readJsonFileSync,
  resolveGenesisOpenCliCapabilitySummaryPath,
  type GenesisOpenCliCapabilitySummary,
  type GenesisOpenCliScoutItem,
  type GenesisSocietySummary,
} from "./state.js";
import { appendGenesisProactiveWorkEntrySync } from "./proactive-work.js";
import { readGenesisUserIntentSummarySnapshotSync } from "./user-intent.js";

const DEFAULT_GENESIS_OPENCLI_CAPABILITY_SUMMARY: GenesisOpenCliCapabilitySummary = {
  available: false,
  invocation: "none",
  commandCount: 0,
  browserBridgeConnected: false,
  hotSourceCount: 0,
  readyHotSourceNames: [],
  lastProbeError: null,
  lastScoutError: null,
  latestScoutSource: null,
  latestScoutTitle: null,
  latestScoutUrl: null,
  recentScoutItems: [],
};

const OPENCLI_HOT_SOURCE_HINTS = [
  "36kr/news",
  "36kr/hot",
  "weibo/hot",
  "bbc/news",
  "hackernews/top",
  "google/news",
  "zhihu/hot",
  "producthunt/hot",
];

const OPENCLI_SCOUT_SOURCE_PREFERENCE = [
  "36kr/news",
  "bbc/news",
  "hackernews/top",
  "36kr/hot",
  "weibo/hot",
  "zhihu/hot",
  "google/news",
];

const OPENCLI_SOCIAL_INTENT_HINTS = [
  "weibo",
  "微博",
  "toutiao",
  "头条",
  "微头条",
  "publish",
  "posting",
  "post",
  "social",
  "自媒体",
  "短内容",
  "短帖",
];

type OpenCliInvocation = {
  command: string;
  argsPrefix: string[];
  mode: "global" | "npx";
};

type OpenCliCommandSuccess = {
  ok: true;
  mode: "global" | "npx";
  stdout: string;
  stderr: string;
};

type OpenCliCommandFailure = {
  ok: false;
  mode: "global" | "npx" | "none";
  error: string;
  stderr: string;
};

function resolveOpenCliInvocations(): OpenCliInvocation[] {
  if (process.platform === "win32") {
    return [
      { command: "opencli.cmd", argsPrefix: [], mode: "global" },
      { command: "npx.cmd", argsPrefix: ["-y", "@jackwener/opencli"], mode: "npx" },
    ];
  }
  return [
    { command: "opencli", argsPrefix: [], mode: "global" },
    { command: "npx", argsPrefix: ["-y", "@jackwener/opencli"], mode: "npx" },
  ];
}

function executeOpenCliCommand(args: string[]): OpenCliCommandSuccess | OpenCliCommandFailure {
  const attempts: OpenCliCommandFailure[] = [];
  for (const invocation of resolveOpenCliInvocations()) {
    const commandArgs = [...invocation.argsPrefix, ...args];
    const result =
      process.platform === "win32"
        ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", invocation.command, ...commandArgs], {
            encoding: "utf8",
            shell: false,
            maxBuffer: 20 * 1024 * 1024,
          })
        : spawnSync(invocation.command, commandArgs, {
            encoding: "utf8",
            shell: false,
            maxBuffer: 20 * 1024 * 1024,
          });
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    if (result.status === 0 && stdout) {
      return {
        ok: true,
        mode: invocation.mode,
        stdout,
        stderr,
      };
    }
    const error =
      result.error?.message?.trim() ||
      stderr ||
      stdout ||
      `opencli command failed (${invocation.mode})`;
    attempts.push({
      ok: false,
      mode: invocation.mode,
      error,
      stderr,
    });
  }
  return attempts[attempts.length - 1] ?? {
    ok: false,
    mode: "none",
    error: "opencli unavailable",
    stderr: "",
  };
}

function parseJsonOutput<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function resolveBridgeConnectedProbe(): boolean {
  const result = executeOpenCliCommand(["weibo", "hot", "-f", "json"]);
  if (result.ok) {
    return true;
  }
  return !/browser bridge not connected|extension is not connected|extension ✗/i.test(
    `${result.error} ${result.stderr}`,
  );
}

function extractHotSources(commands: Array<{ command?: string }>): string[] {
  return commands
    .map((entry) => entry.command?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) =>
      OPENCLI_HOT_SOURCE_HINTS.some((hint) => value.toLowerCase() === hint.toLowerCase()),
    )
    .sort((left, right) => left.localeCompare(right));
}

function readOpenCliCapabilitySummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisOpenCliCapabilitySummary | null {
  const snapshot = readJsonFileSync<GenesisOpenCliCapabilitySummary>(
    resolveGenesisOpenCliCapabilitySummaryPath(env),
  );
  if (!snapshot) {
    return null;
  }
  return {
    ...DEFAULT_GENESIS_OPENCLI_CAPABILITY_SUMMARY,
    ...snapshot,
    readyHotSourceNames: [...(snapshot.readyHotSourceNames ?? [])],
    recentScoutItems: [...(snapshot.recentScoutItems ?? [])],
  };
}

function writeOpenCliCapabilitySummarySnapshotSync(
  summary: GenesisOpenCliCapabilitySummary,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisOpenCliCapabilitySummaryPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
}

export function readGenesisOpenCliCapabilitySummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisOpenCliCapabilitySummary | null {
  return readOpenCliCapabilitySummarySnapshotSync(env);
}

export function refreshGenesisOpenCliCapabilitySummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisOpenCliCapabilitySummary {
  const now = Date.now();
  const previous = readOpenCliCapabilitySummarySnapshotSync(env);
  const listResult = executeOpenCliCommand(["list", "-f", "json"]);
  if (!listResult.ok) {
    const failedSummary: GenesisOpenCliCapabilitySummary = {
      ...DEFAULT_GENESIS_OPENCLI_CAPABILITY_SUMMARY,
      ...(previous ?? {}),
      available: false,
      invocation: "none",
      commandCount: 0,
      hotSourceCount: 0,
      readyHotSourceNames: [],
      browserBridgeConnected: false,
      lastProbeAt: now,
      lastProbeError: listResult.error,
    };
    writeOpenCliCapabilitySummarySnapshotSync(failedSummary, env);
    return failedSummary;
  }

  const commands = parseJsonOutput<Array<{ command?: string }>>(listResult.stdout) ?? [];
  const readyHotSourceNames = extractHotSources(commands);
  const summary: GenesisOpenCliCapabilitySummary = {
    ...DEFAULT_GENESIS_OPENCLI_CAPABILITY_SUMMARY,
    ...(previous ?? {}),
    available: true,
    invocation: listResult.mode,
    commandCount: commands.length,
    browserBridgeConnected: resolveBridgeConnectedProbe(),
    hotSourceCount: readyHotSourceNames.length,
    readyHotSourceNames,
    lastProbeAt: now,
    lastProbeError: null,
  };
  writeOpenCliCapabilitySummarySnapshotSync(summary, env);
  return summary;
}

export function resolveGenesisOpenCliScoutSource(
  summary: GenesisOpenCliCapabilitySummary,
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null,
): string | null {
  const intentText = [
    ...(intentSummary?.recentKeywords ?? []),
    intentSummary?.strongestTopicCluster ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const shouldPreferSocialHotSource =
    summary.browserBridgeConnected &&
    summary.readyHotSourceNames.some((entry) => entry.toLowerCase() === "weibo/hot") &&
    OPENCLI_SOCIAL_INTENT_HINTS.some((hint) => intentText.includes(hint.toLowerCase()));
  if (shouldPreferSocialHotSource) {
    return "weibo/hot";
  }
  for (const preferred of OPENCLI_SCOUT_SOURCE_PREFERENCE) {
    if (summary.readyHotSourceNames.some((entry) => entry.toLowerCase() === preferred.toLowerCase())) {
      return preferred;
    }
  }
  return summary.readyHotSourceNames[0] ?? null;
}

function normalizeOpenCliScoutItems(payload: unknown, source: string, ts: number): GenesisOpenCliScoutItem[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const title =
        String(
          Reflect.get(entry, "title") ??
            Reflect.get(entry, "name") ??
            Reflect.get(entry, "headline") ??
            "",
        ).trim();
      if (!title) {
        return null;
      }
      const url = String(
        Reflect.get(entry, "url") ??
          Reflect.get(entry, "link") ??
          Reflect.get(entry, "href") ??
          "",
      ).trim();
      const summary =
        String(
          Reflect.get(entry, "summary") ??
            Reflect.get(entry, "snippet") ??
            Reflect.get(entry, "description") ??
            "",
        ).replace(/\s+/g, " ").trim() || undefined;
      return {
        source,
        title,
        ...(url ? { url } : {}),
        ...(summary ? { summary } : {}),
        ts,
      } satisfies GenesisOpenCliScoutItem;
    })
    .filter((entry): entry is GenesisOpenCliScoutItem => Boolean(entry))
    .slice(0, 6);
}

function buildScoutObjective(intentSummary?: GenesisSocietySummary["userIntentSummary"] | null): string {
  const keywords = intentSummary?.recentKeywords?.slice(0, 4).filter(Boolean) ?? [];
  if (keywords.length > 0) {
    return keywords.join(" / ");
  }
  if (intentSummary?.strongestTopicCluster) {
    return intentSummary.strongestTopicCluster;
  }
  return "current user focus";
}

function buildScoutDriverSummary(intentSummary?: GenesisSocietySummary["userIntentSummary"] | null): {
  driverHistoryKind?: "search" | "query" | "consultation" | null;
  driverTopicCluster?: string | null;
  driverKeywords: string[];
  driverSummary: string;
} {
  const driverHistoryKind = intentSummary?.dominantHistoryKind ?? null;
  const driverTopicCluster = intentSummary?.strongestTopicCluster ?? null;
  const driverKeywords = intentSummary?.recentKeywords?.slice(0, 5) ?? [];
  const parts: string[] = [];
  if (driverHistoryKind) {
    parts.push(`history:${driverHistoryKind}`);
  }
  if (driverTopicCluster) {
    parts.push(`topic:${driverTopicCluster}`);
  }
  if (driverKeywords.length > 0) {
    parts.push(`keywords:${driverKeywords.join(",")}`);
  }
  return {
    driverHistoryKind,
    driverTopicCluster,
    driverKeywords,
    driverSummary: parts.join(" | ") || "source:opencli",
  };
}

export function runGenesisOpenCliScoutHotspotSync(params?: {
  ts?: number;
  env?: NodeJS.ProcessEnv;
  intentSummary?: GenesisSocietySummary["userIntentSummary"] | null;
}): GenesisOpenCliCapabilitySummary {
  const env = params?.env ?? process.env;
  const ts = params?.ts ?? Date.now();
  const slotKey = new Date(ts).toISOString().slice(0, 13);
  const intentSummary =
    params?.intentSummary ?? readGenesisUserIntentSummarySnapshotSync(env);
  const capabilitySummary =
    refreshGenesisOpenCliCapabilitySummarySnapshotSync(env);
  const source = resolveGenesisOpenCliScoutSource(capabilitySummary, intentSummary);
  if (!capabilitySummary.available || !source) {
    return capabilitySummary;
  }

  const [site, action] = source.split("/");
  const fetchResult = executeOpenCliCommand([site, action, "-f", "json"]);
  if (!fetchResult.ok) {
    const failedSummary: GenesisOpenCliCapabilitySummary = {
      ...capabilitySummary,
      lastScoutAt: ts,
      lastScoutError: fetchResult.error,
    };
    writeOpenCliCapabilitySummarySnapshotSync(failedSummary, env);
    return failedSummary;
  }

  const items = normalizeOpenCliScoutItems(
    parseJsonOutput<unknown>(fetchResult.stdout),
    source,
    ts,
  );
  if (items.length === 0) {
    const emptySummary: GenesisOpenCliCapabilitySummary = {
      ...capabilitySummary,
      lastScoutAt: ts,
      lastScoutError: `opencli ${source} returned no usable hotspot items`,
    };
    writeOpenCliCapabilitySummarySnapshotSync(emptySummary, env);
    return emptySummary;
  }

  const driver = buildScoutDriverSummary(intentSummary);
  const objective = buildScoutObjective(intentSummary);
  const lead = items[0];
  const preview = items
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${item.title}${item.url ? ` ${item.url}` : ""}`)
    .join(" | ")
    .slice(0, 520);

  appendGenesisProactiveWorkEntrySync(
    {
      workId: `opencli:${source.replace(/[\\/]/g, "_")}:${slotKey}:scout`,
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "opencli-hotspot",
      workType: "intelligence",
      task: `Use opencli ${source} to gather live hotspot signals around ${objective}`,
      status: "completed",
      executionStage: "skill_use",
      usedSkillName: `opencli.${source}`,
      driverKind: "history",
      driverHistoryKind: driver.driverHistoryKind,
      driverTopicCluster: driver.driverTopicCluster,
      driverKeywords: driver.driverKeywords,
      driverSummary: driver.driverSummary,
      resultPreview: `Scout used opencli ${source} and found hotspots: ${preview}`,
      artifactLabel: "signal/opportunity",
      effectType: "opportunity",
      effectEvidence: lead.url ?? lead.title,
      source: "run_completion",
      ts,
      updatedAt: ts,
    },
    env,
  );

  const nextSummary: GenesisOpenCliCapabilitySummary = {
    ...capabilitySummary,
    lastScoutAt: ts,
    lastScoutError: null,
    latestScoutSource: source,
    latestScoutTitle: lead.title,
    latestScoutUrl: lead.url ?? null,
    recentScoutItems: items,
  };
  writeOpenCliCapabilitySummarySnapshotSync(nextSummary, env);
  return nextSummary;
}
