import fs from "node:fs";
import path from "node:path";
import {
  readJsonFileSync,
  resolveGenesisUserIntentHistoryPath,
  resolveGenesisUserIntentSummaryPath,
  type GenesisSocietySummary,
  type GenesisUserIntentHistoryEntry,
  type GenesisUserIntentHistoryState,
} from "./state.js";

type GenesisFounderOrigin = NonNullable<
  NonNullable<
    NonNullable<GenesisSocietySummary["vitalitySummary"]>["founderRoleBreakdown"][number]
  >["founderOrigin"]
>;

type GenesisFounderIntentLeader = NonNullable<
  NonNullable<GenesisSocietySummary["userIntentSummary"]>["founderIntentLeaders"]
>[number];

const FOUNDER_USER_INTENT_SIGNALS: Record<
  GenesisFounderOrigin,
  {
    domains: string[];
    keywords: string[];
    historyKindWeights: Record<GenesisUserIntentHistoryEntry["kind"], number>;
  }
> = {
  scout: {
    domains: ["source_discovery", "research", "search", "signal"],
    keywords: ["search", "source", "signal", "research", "monitor", "discover"],
    historyKindWeights: {
      search: 1.25,
      query: 0.45,
      consultation: 0.2,
    },
  },
  builder: {
    domains: ["workflow", "tool_synthesis", "build", "capability"],
    keywords: ["workflow", "tool", "automation", "capability", "build", "repeat"],
    historyKindWeights: {
      search: 0.6,
      query: 1,
      consultation: 0.35,
    },
  },
  creator: {
    domains: ["scenario_generation", "ideation", "novelty", "concept"],
    keywords: ["idea", "novel", "scenario", "strategy", "design", "creative"],
    historyKindWeights: {
      search: 0.3,
      query: 0.35,
      consultation: 0.7,
    },
  },
  auditor: {
    domains: ["audit", "risk", "failure", "regression"],
    keywords: ["audit", "risk", "failure", "review", "regression", "verify"],
    historyKindWeights: {
      search: 0.25,
      query: 0.65,
      consultation: 0.45,
    },
  },
  negotiator: {
    domains: ["coordination", "protocol", "coalition", "resource_allocation"],
    keywords: ["coordination", "consult", "protocol", "consensus", "resource", "align"],
    historyKindWeights: {
      search: 0.2,
      query: 0.45,
      consultation: 1.15,
    },
  },
};

const USER_INTENT_STOPWORDS = new Set([
  "and",
  "about",
  "after",
  "agent",
  "agents",
  "also",
  "angles",
  "around",
  "are",
  "autonomous",
  "analyze",
  "best",
  "been",
  "break",
  "breaking",
  "current",
  "continuous",
  "developments",
  "content",
  "consultation",
  "consultations",
  "during",
  "ecology",
  "emphasis",
  "effects",
  "external",
  "find",
  "findings",
  "focus",
  "follow",
  "follow-up",
  "followup",
  "for",
  "founder",
  "founders",
  "from",
  "have",
  "headline",
  "headlines",
  "hot",
  "hotspot",
  "hotspots",
  "into",
  "international",
  "latest",
  "likely",
  "most",
  "news",
  "over",
  "post",
  "posting",
  "posts",
  "publishing",
  "real",
  "short",
  "short-form",
  "signal",
  "signals",
  "social",
  "sustained",
  "the",
  "their",
  "these",
  "they",
  "this",
  "today",
  "topic",
  "topics",
  "types",
  "updates",
  "use",
  "into",
  "just",
  "more",
  "platform",
  "platforms",
  "prefer",
  "preferred",
  "profile",
  "production",
  "proactive",
  "public",
  "query",
  "queries",
  "readiness",
  "based",
  "search",
  "searches",
  "situation",
  "sustained",
  "valuable",
  "worthwhile",
  "consult",
  "that",
  "want",
  "with",
  "work",
  "which",
  "user",
]);

const USER_INTENT_HISTORY_HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;

const USER_INTENT_TOPIC_CLUSTERS = {
  research_signal: ["search", "source", "signal", "research", "discover", "monitor"],
  workflow_capability: ["workflow", "tool", "automation", "capability", "build", "repeat"],
  coordination_recovery: [
    "coordination",
    "protocol",
    "consult",
    "recovery",
    "align",
    "consensus",
  ],
  audit_quality: ["audit", "risk", "failure", "review", "regression", "verify"],
  ideation_strategy: ["idea", "novel", "scenario", "strategy", "design", "creative"],
} as const;

type GenesisUserIntentTopicCluster = keyof typeof USER_INTENT_TOPIC_CLUSTERS;

type ParsedUserProfileSections = {
  allTokens: string[];
  workTokens: string[];
  interestTokens: string[];
};

function tokenizeUserIntentText(input: string): string[] {
  return (input.toLowerCase().match(/[a-z0-9_-]{3,}|[\u4e00-\u9fff]{2,}/g) ?? []).filter(
    (token) => !USER_INTENT_STOPWORDS.has(token),
  );
}

function resolveUserProfileSectionType(
  heading: string,
): "work" | "interest" | "general" {
  const normalized = heading.trim().toLowerCase();
  if (
    /(^|[\s_-])(work|career|project|projects|task|tasks|职业|工作|项目|任务)([\s_-]|$)/.test(
      normalized,
    )
  ) {
    return "work";
  }
  if (
    /(^|[\s_-])(preference|preferences|interest|interests|hobby|hobbies|like|likes|偏好|兴趣|爱好|喜好)([\s_-]|$)/.test(
      normalized,
    )
  ) {
    return "interest";
  }
  return "general";
}

function parseGenesisUserProfileSections(profileText: string): ParsedUserProfileSections {
  const workTokens: string[] = [];
  const interestTokens: string[] = [];
  const allTokens: string[] = [];
  let currentSection: "work" | "interest" | "general" = "general";

  for (const rawLine of profileText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("#")) {
      currentSection = resolveUserProfileSectionType(line.replace(/^#+\s*/, ""));
      continue;
    }
    const cleaned = line.replace(/^[-*]\s*/, "").trim();
    if (!cleaned) {
      continue;
    }
    const tokens = tokenizeUserIntentText(cleaned);
    if (tokens.length === 0) {
      continue;
    }
    allTokens.push(...tokens);
    if (currentSection === "work") {
      workTokens.push(...tokens);
    } else if (currentSection === "interest") {
      interestTokens.push(...tokens);
    }
  }

  return {
    allTokens,
    workTokens,
    interestTokens,
  };
}

function resolveGenesisUserProfilePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OPENCLAW_GENESIS_USER_PROFILE_PATH?.trim();
  if (explicit) {
    return explicit;
  }
  return path.join(process.cwd(), "USER.md");
}

function readGenesisUserProfileTextSync(env: NodeJS.ProcessEnv = process.env): string {
  try {
    return fs.readFileSync(resolveGenesisUserProfilePath(env), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function countSignalMatches(tokens: string[], founderOrigin: GenesisFounderOrigin): number {
  const signals = FOUNDER_USER_INTENT_SIGNALS[founderOrigin];
  const uniqueTokens = new Set(tokens);
  let score = 0;
  for (const token of uniqueTokens) {
    if (signals.domains.some((domain) => token.includes(domain) || domain.includes(token))) {
      score += 1.4;
      continue;
    }
    if (signals.keywords.some((keyword) => token.includes(keyword) || keyword.includes(token))) {
      score += 0.85;
    }
  }
  return score;
}

function countTopicClusterMatches(tokens: string[], cluster: GenesisUserIntentTopicCluster): number {
  const uniqueTokens = new Set(tokens);
  const keywords = USER_INTENT_TOPIC_CLUSTERS[cluster];
  let score = 0;
  for (const token of uniqueTokens) {
    if (keywords.some((keyword) => token.includes(keyword) || keyword.includes(token))) {
      score += 0.9;
    }
  }
  return score;
}

function resolveHistoryTimeWeight(entryTs: number, latestTs: number): number {
  const ageMs = Math.max(0, latestTs - entryTs);
  return Math.exp((-1 * ageMs) / USER_INTENT_HISTORY_HALF_LIFE_MS);
}

function roundIntentScore(value: number): number {
  return Number(value.toFixed(6));
}

function buildRecentIntentKeywords(params: {
  historyEntries: GenesisUserIntentHistoryEntry[];
  profileSections: ParsedUserProfileSections;
}): string[] {
  const latestTs = params.historyEntries.reduce((max, entry) => Math.max(max, entry.ts), 0) || Date.now();
  const tokenScores = new Map<string, number>();
  const tokenSources = new Map<string, "history" | "profile">();

  for (const entry of params.historyEntries) {
    const weight = resolveHistoryTimeWeight(entry.ts, latestTs);
    for (const token of tokenizeUserIntentText(entry.summary)) {
      const nextScore = (tokenScores.get(token) ?? 0) + weight * 2.4;
      tokenScores.set(token, nextScore);
      tokenSources.set(token, "history");
    }
  }

  for (const token of params.profileSections.workTokens) {
    tokenScores.set(token, (tokenScores.get(token) ?? 0) + 0.55);
    if (!tokenSources.has(token)) {
      tokenSources.set(token, "profile");
    }
  }

  for (const token of params.profileSections.interestTokens) {
    tokenScores.set(token, (tokenScores.get(token) ?? 0) + 0.42);
    if (!tokenSources.has(token)) {
      tokenSources.set(token, "profile");
    }
  }

  for (const token of params.profileSections.allTokens) {
    tokenScores.set(token, (tokenScores.get(token) ?? 0) + 0.08);
    if (!tokenSources.has(token)) {
      tokenSources.set(token, "profile");
    }
  }

  return [...tokenScores.entries()]
    .sort((left, right) => {
      const sourceBoost =
        (tokenSources.get(right[0]) === "history" ? 1 : 0) -
        (tokenSources.get(left[0]) === "history" ? 1 : 0);
      return right[1] - left[1] || sourceBoost || left[0].localeCompare(right[0]);
    })
    .slice(0, 12)
    .map(([token]) => token);
}

function resolveFounderIntentLeaders(params: {
  historyEntries: GenesisUserIntentHistoryEntry[];
  profileSections: ParsedUserProfileSections;
}): GenesisFounderIntentLeader[] {
  const founderOrigins = Object.keys(FOUNDER_USER_INTENT_SIGNALS) as GenesisFounderOrigin[];
  const latestTs = params.historyEntries.reduce((max, entry) => Math.max(max, entry.ts), 0) || Date.now();
  const topicClusterScores = Object.keys(USER_INTENT_TOPIC_CLUSTERS).map((cluster) => {
    const historySignalScore = params.historyEntries.reduce((sum, entry) => {
      const tokens = tokenizeUserIntentText(entry.summary);
      const weight = resolveHistoryTimeWeight(entry.ts, latestTs);
      return sum + countTopicClusterMatches(tokens, cluster as GenesisUserIntentTopicCluster) * weight;
    }, 0);
    const profileSignalScore =
      countTopicClusterMatches(params.profileSections.workTokens, cluster as GenesisUserIntentTopicCluster) *
        0.85 +
      countTopicClusterMatches(
        params.profileSections.interestTokens,
        cluster as GenesisUserIntentTopicCluster,
      ) *
        0.65 +
      countTopicClusterMatches(params.profileSections.allTokens, cluster as GenesisUserIntentTopicCluster) *
        0.15;
    return {
      cluster,
      weightedSignalScore: roundIntentScore(historySignalScore + profileSignalScore),
      historySignalScore: roundIntentScore(historySignalScore),
      profileSignalScore: roundIntentScore(profileSignalScore),
    };
  });
  const activeTopicClusters = topicClusterScores
    .filter((entry) => entry.weightedSignalScore > 0)
    .sort((left, right) => right.weightedSignalScore - left.weightedSignalScore);
  return founderOrigins
    .map((founderOrigin) => {
      const signals = FOUNDER_USER_INTENT_SIGNALS[founderOrigin];
      let historyIntentScore = 0;
      let timeWeightedHistoryIntentScore = 0;
      let matchedHistoryCount = 0;
      for (const entry of params.historyEntries) {
        const tokens = tokenizeUserIntentText(entry.summary);
        const matchScore = countSignalMatches(tokens, founderOrigin);
        if (matchScore <= 0) {
          continue;
        }
        matchedHistoryCount += 1;
        historyIntentScore += matchScore * signals.historyKindWeights[entry.kind];
        timeWeightedHistoryIntentScore +=
          matchScore *
          signals.historyKindWeights[entry.kind] *
          resolveHistoryTimeWeight(entry.ts, latestTs);
      }
      const rawProfileScore = countSignalMatches(params.profileSections.allTokens, founderOrigin);
      const workProfileIntentScore =
        countSignalMatches(params.profileSections.workTokens, founderOrigin) * 0.85;
      const interestProfileIntentScore =
        countSignalMatches(params.profileSections.interestTokens, founderOrigin) * 0.7;
      const profileIntentScore =
        workProfileIntentScore * 0.75 + interestProfileIntentScore * 0.55 + rawProfileScore * 0.15;
      const matchedProfileKeywordCount =
        workProfileIntentScore > 0 || interestProfileIntentScore > 0 || rawProfileScore > 0
          ? Math.ceil(workProfileIntentScore + interestProfileIntentScore + rawProfileScore * 0.25)
          : 0;
      const matchedTopicClusters = activeTopicClusters
        .filter((cluster) => {
          const keywords = USER_INTENT_TOPIC_CLUSTERS[
            cluster.cluster as GenesisUserIntentTopicCluster
          ];
          return keywords.some(
            (keyword) =>
              signals.domains.some((domain) => domain.includes(keyword) || keyword.includes(domain)) ||
              signals.keywords.some((signalKeyword) =>
                signalKeyword.includes(keyword) || keyword.includes(signalKeyword),
              ),
          );
        })
        .slice(0, 3)
        .map((entry) => entry.cluster);
      const longTermIntentAlignmentScore =
        timeWeightedHistoryIntentScore * 0.7 +
        workProfileIntentScore * 0.6 +
        interestProfileIntentScore * 0.35 +
        matchedTopicClusters.length * 0.2;
      const userIntentAlignmentScore =
        historyIntentScore * 0.65 +
        profileIntentScore * 0.55 +
        timeWeightedHistoryIntentScore * 0.45 +
        matchedHistoryCount * 0.2 +
        matchedProfileKeywordCount * 0.1;
      return {
        founderOrigin,
        historyIntentScore: roundIntentScore(historyIntentScore),
        timeWeightedHistoryIntentScore: roundIntentScore(timeWeightedHistoryIntentScore),
        profileIntentScore: roundIntentScore(profileIntentScore),
        workProfileIntentScore: roundIntentScore(workProfileIntentScore),
        interestProfileIntentScore: roundIntentScore(interestProfileIntentScore),
        userIntentAlignmentScore: roundIntentScore(userIntentAlignmentScore),
        longTermIntentAlignmentScore: roundIntentScore(longTermIntentAlignmentScore),
        matchedTopicClusters,
        matchedHistoryCount,
        matchedProfileKeywordCount,
      };
    })
    .filter(
      (entry) =>
        entry.historyIntentScore > 0 ||
        entry.profileIntentScore > 0 ||
        entry.userIntentAlignmentScore > 0,
    )
    .sort(
      (left, right) =>
        (right.longTermIntentAlignmentScore ?? 0) - (left.longTermIntentAlignmentScore ?? 0) ||
        right.userIntentAlignmentScore - left.userIntentAlignmentScore ||
        right.historyIntentScore - left.historyIntentScore ||
        left.founderOrigin.localeCompare(right.founderOrigin),
    );
}

export function readGenesisUserIntentHistoryStateSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisUserIntentHistoryState | null {
  const snapshot = readJsonFileSync<GenesisUserIntentHistoryState>(resolveGenesisUserIntentHistoryPath(env));
  if (!snapshot) {
    return null;
  }
  return {
    entries: Array.isArray(snapshot.entries) ? snapshot.entries : [],
    updatedAt: Number(snapshot.updatedAt ?? 0),
  };
}

export function writeGenesisUserIntentHistoryStateSync(
  state: GenesisUserIntentHistoryState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisUserIntentHistoryPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export function appendGenesisUserIntentHistoryEntrySync(
  entry: GenesisUserIntentHistoryEntry,
  env: NodeJS.ProcessEnv = process.env,
): GenesisUserIntentHistoryState {
  const previous = readGenesisUserIntentHistoryStateSync(env) ?? {
    entries: [],
    updatedAt: 0,
  };
  const entries = [...previous.entries, entry]
    .sort((left, right) => left.ts - right.ts)
    .slice(-24);
  const next = {
    entries,
    updatedAt: Date.now(),
  };
  writeGenesisUserIntentHistoryStateSync(next, env);
  refreshGenesisUserIntentSummarySnapshotSync(env);
  return next;
}

export function readGenesisUserIntentSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietySummary["userIntentSummary"] | null {
  return readJsonFileSync<GenesisSocietySummary["userIntentSummary"]>(
    resolveGenesisUserIntentSummaryPath(env),
  );
}

export function writeGenesisUserIntentSummarySnapshotSync(
  summary: NonNullable<GenesisSocietySummary["userIntentSummary"]>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisUserIntentSummaryPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
}

export function readGenesisUserIntentSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietySummary["userIntentSummary"] {
  const historyState = readGenesisUserIntentHistoryStateSync(env) ?? {
    entries: [],
    updatedAt: 0,
  };
  const historyEntries = historyState.entries;
  const profileText = readGenesisUserProfileTextSync(env);
  const profileSections = parseGenesisUserProfileSections(profileText);
  const founderIntentLeaders = resolveFounderIntentLeaders({
    historyEntries,
    profileSections,
  });
  const searchHistoryCount = historyEntries.filter((entry) => entry.kind === "search").length;
  const queryHistoryCount = historyEntries.filter((entry) => entry.kind === "query").length;
  const consultationHistoryCount = historyEntries.filter(
    (entry) => entry.kind === "consultation",
  ).length;
  const dominantHistoryKind = (
    [
      ["search", searchHistoryCount],
      ["query", queryHistoryCount],
      ["consultation", consultationHistoryCount],
    ] as const
  ).sort((left, right) => right[1] - left[1])[0]?.[1]
    ? ([
        ["search", searchHistoryCount],
        ["query", queryHistoryCount],
        ["consultation", consultationHistoryCount],
      ] as const).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
    : null;
  const historySignalScore = roundIntentScore(
    founderIntentLeaders.reduce((sum, entry) => sum + entry.historyIntentScore, 0),
  );
  const timeWeightedHistorySignalScore = roundIntentScore(
    founderIntentLeaders.reduce((sum, entry) => sum + (entry.timeWeightedHistoryIntentScore ?? 0), 0),
  );
  const profileSignalScore = roundIntentScore(
    founderIntentLeaders.reduce((sum, entry) => sum + entry.profileIntentScore, 0),
  );
  const workProfileSignalScore = roundIntentScore(
    founderIntentLeaders.reduce((sum, entry) => sum + (entry.workProfileIntentScore ?? 0), 0),
  );
  const interestProfileSignalScore = roundIntentScore(
    founderIntentLeaders.reduce((sum, entry) => sum + (entry.interestProfileIntentScore ?? 0), 0),
  );
  const combinedSignalScore = roundIntentScore(
    founderIntentLeaders.reduce((sum, entry) => sum + entry.userIntentAlignmentScore, 0),
  );
  const topicClusters = Object.keys(USER_INTENT_TOPIC_CLUSTERS)
    .map((cluster) => {
      const historySignalScore = historyEntries.reduce((sum, entry) => {
        const tokens = tokenizeUserIntentText(entry.summary);
        const latestTs = historyEntries.reduce((max, item) => Math.max(max, item.ts), 0) || Date.now();
        return (
          sum +
          countTopicClusterMatches(tokens, cluster as GenesisUserIntentTopicCluster) *
            resolveHistoryTimeWeight(entry.ts, latestTs)
        );
      }, 0);
      const profileSignalScore =
        countTopicClusterMatches(profileSections.workTokens, cluster as GenesisUserIntentTopicCluster) *
          0.85 +
        countTopicClusterMatches(
          profileSections.interestTokens,
          cluster as GenesisUserIntentTopicCluster,
        ) *
          0.65 +
        countTopicClusterMatches(profileSections.allTokens, cluster as GenesisUserIntentTopicCluster) *
          0.15;
      const weightedSignalScore = historySignalScore * 1.35 + profileSignalScore;
      return {
        cluster,
        weightedSignalScore: roundIntentScore(weightedSignalScore),
        historySignalScore: roundIntentScore(historySignalScore),
        profileSignalScore: roundIntentScore(profileSignalScore),
      };
    })
    .filter((entry) => entry.weightedSignalScore > 0)
    .sort((left, right) => right.weightedSignalScore - left.weightedSignalScore)
    .slice(0, 5);
  const recentKeywords = buildRecentIntentKeywords({
    historyEntries,
    profileSections,
  });
  const highestIntent = founderIntentLeaders[0];
  const highestLongTermIntent = [...founderIntentLeaders].sort(
    (left, right) =>
      (right.longTermIntentAlignmentScore ?? 0) - (left.longTermIntentAlignmentScore ?? 0) ||
      right.userIntentAlignmentScore - left.userIntentAlignmentScore,
  )[0];
  return {
    historyEntryCount: historyEntries.length,
    searchHistoryCount,
    queryHistoryCount,
    consultationHistoryCount,
    dominantHistoryKind,
    profileVisible: profileText.trim().length > 0,
    profileKeywordCount: profileSections.allTokens.length,
    timeWeightedHistorySignalScore,
    workProfileSignalScore,
    interestProfileSignalScore,
    strongestTopicCluster: topicClusters[0]?.cluster ?? null,
    strongestTopicSignalScore: topicClusters[0]?.weightedSignalScore ?? 0,
    historyDrivenFounderCount: founderIntentLeaders.filter((entry) => entry.historyIntentScore > 0)
      .length,
    profileDrivenFounderCount: founderIntentLeaders.filter((entry) => entry.profileIntentScore > 0)
      .length,
    proactiveIntentFounderCount: founderIntentLeaders.filter(
      (entry) => entry.userIntentAlignmentScore > 0,
    ).length,
    longTermIntentFounderCount: founderIntentLeaders.filter(
      (entry) => (entry.longTermIntentAlignmentScore ?? 0) > 0,
    ).length,
    highestIntentFounderOrigin: highestIntent?.founderOrigin ?? null,
    highestIntentFounderScore: highestIntent?.userIntentAlignmentScore ?? 0,
    highestLongTermIntentFounderOrigin: highestLongTermIntent?.founderOrigin ?? null,
    highestLongTermIntentFounderScore: highestLongTermIntent?.longTermIntentAlignmentScore ?? 0,
    historySignalScore,
    profileSignalScore,
    combinedSignalScore,
    recentKeywords,
    topicClusters,
    founderIntentLeaders: founderIntentLeaders.slice(0, 5),
  };
}

export function refreshGenesisUserIntentSummarySnapshotSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietySummary["userIntentSummary"] {
  const summary = readGenesisUserIntentSummarySync(env);
  writeGenesisUserIntentSummarySnapshotSync(summary, env);
  return summary;
}

function resolveFounderOriginFromLineageId(lineageId: string): GenesisFounderOrigin | null {
  const normalized = lineageId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const founderOrigins = Object.keys(FOUNDER_USER_INTENT_SIGNALS) as GenesisFounderOrigin[];
  return (
    founderOrigins.find(
      (origin) =>
        normalized === origin ||
        normalized.startsWith(`${origin}_`) ||
        normalized.startsWith(`${origin}-`) ||
        normalized.startsWith(`agent:${origin}:`),
    ) ?? null
  );
}

export function resolveGenesisUserIntentBias(
  lineageId: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const founderOrigin = resolveFounderOriginFromLineageId(lineageId);
  if (!founderOrigin) {
    return 0;
  }
  const summary =
    readGenesisUserIntentSummarySnapshotSync(env) ?? readGenesisUserIntentSummarySync(env);
  const leader = summary?.founderIntentLeaders?.find((entry) => entry.founderOrigin === founderOrigin);
  return Math.max(
    0,
    (leader?.userIntentAlignmentScore ?? 0) * 0.45 +
      (leader?.longTermIntentAlignmentScore ?? 0) * 0.75,
  );
}
