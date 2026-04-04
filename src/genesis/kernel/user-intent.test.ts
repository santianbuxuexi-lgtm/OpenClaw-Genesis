import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readGenesisUserIntentSummarySync,
  resolveGenesisUserIntentBias,
  writeGenesisUserIntentHistoryStateSync,
} from "./user-intent.js";

let stateDir: string;
let profilePath: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-user-intent-"));
  profilePath = path.join(stateDir, "USER.md");
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  vi.stubEnv("OPENCLAW_GENESIS_USER_PROFILE_PATH", profilePath);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis user intent summary", () => {
  it("derives founder intent signals from history and USER.md", async () => {
    await fs.writeFile(
      profilePath,
      [
        "# USER",
        "",
        "## Work",
        "- Build reusable workflow automation tools.",
        "",
        "## Preferences",
        "- Prefer strong coordination and proactive regression review.",
        "",
        "## Interests",
        "- Interested in source discovery and scenario design.",
      ].join("\n"),
      "utf-8",
    );
    writeGenesisUserIntentHistoryStateSync({
      entries: [
        {
          kind: "search",
          summary: "Search workflow automation signals and source discovery notes",
          ts: 100,
        },
        {
          kind: "query",
          summary: "Query reusable build patterns and regression review steps",
          ts: 110,
        },
        {
          kind: "consultation",
          summary: "Consult about coordination protocol and recovery planning",
          ts: 120,
        },
      ],
      updatedAt: 120,
    });

    const summary = readGenesisUserIntentSummarySync(process.env);

    expect(summary).toMatchObject({
      historyEntryCount: 3,
      searchHistoryCount: 1,
      queryHistoryCount: 1,
      consultationHistoryCount: 1,
      profileVisible: true,
    });
    expect(["research_signal", "workflow_capability"]).toContain(summary.strongestTopicCluster);
    expect(summary.timeWeightedHistorySignalScore).toBeGreaterThan(0);
    expect(summary.workProfileSignalScore).toBeGreaterThan(0);
    expect(summary.interestProfileSignalScore).toBeGreaterThan(0);
    expect(summary.longTermIntentFounderCount).toBeGreaterThanOrEqual(2);
    expect(summary.highestLongTermIntentFounderOrigin).toBeTruthy();
    expect(summary.topicClusters?.length).toBeGreaterThanOrEqual(2);
    expect(summary.founderIntentLeaders?.[0]?.longTermIntentAlignmentScore ?? 0).toBeGreaterThan(0);
    expect(summary.founderIntentLeaders?.[0]?.matchedTopicClusters?.length ?? 0).toBeGreaterThan(0);
    expect(summary.highestIntentFounderOrigin).toBeTruthy();
    expect(summary.combinedSignalScore).toBeGreaterThan(0);
    expect(summary.founderIntentLeaders?.length).toBeGreaterThanOrEqual(2);
    expect(resolveGenesisUserIntentBias("builder", process.env)).toBeGreaterThan(0);
    expect(resolveGenesisUserIntentBias("agent:negotiator:main", process.env)).toBeGreaterThan(0);
  });

  it("prioritizes recent history keywords over profile-only keywords", async () => {
    await fs.writeFile(
      profilePath,
      [
        "# Work",
        "- Build autonomous founder ecology and workflow automation.",
        "",
        "## Interests",
        "- Enjoy long-term strategy and ecosystem design.",
      ].join("\n"),
      "utf-8",
    );
    writeGenesisUserIntentHistoryStateSync({
      entries: [
        {
          kind: "search",
          summary: "Search israel iran united-states headlines and hotspot signals for short social publishing",
          ts: 1000,
        },
        {
          kind: "query",
          summary: "Query toutiao weibo posting strategy for breaking geopolitical updates",
          ts: 1010,
        },
      ],
      updatedAt: 1010,
    });

    const summary = readGenesisUserIntentSummarySync(process.env);

    expect(summary.recentKeywords).toEqual(
      expect.arrayContaining(["israel", "iran", "united-states", "toutiao", "weibo"]),
    );
    expect(summary.recentKeywords).not.toEqual(
      expect.arrayContaining(["search", "content", "hot", "follow-up", "international"]),
    );
    expect(summary.topicClusters.length).toBeGreaterThan(0);
    expect(summary.historySignalScore).toBeGreaterThan(0);
  });
});
