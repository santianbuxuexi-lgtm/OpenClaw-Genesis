import { describe, expect, it } from "vitest";
import {
  buildGenesisAutonomyHeartbeatSummary,
  shouldRunGenesisAutonomyHeartbeat,
} from "./autonomy-heartbeat.js";

describe("autonomy heartbeat", () => {
  it("builds a summary from user intent, ready platforms, skill gaps, and active work", () => {
    const text = buildGenesisAutonomyHeartbeatSummary({
      userIntentSummary: {
        recentKeywords: ["以色列", "伊朗", "美国", "局势", "微头条"],
        strongestTopicCluster: "research_signal",
        dominantHistoryKind: "search",
      },
      loginStatePoolSummary: {
        platformLeaders: [
          { platform: "toutiao", readyCount: 1, busyCount: 0, pendingCount: 0, reloginCount: 0, blockedCount: 0 },
          { platform: "weibo", readyCount: 1, busyCount: 0, pendingCount: 0, reloginCount: 0, blockedCount: 0 },
        ],
      },
      skillCapabilitySummary: {
        degradedSkillNames: ["publish-creator", "signal-scout"],
      },
      proactiveWorkSummary: {
        recentEntries: [
          { founderOrigin: "creator", workType: "external_publish", status: "in_progress" },
          { founderOrigin: "scout", workType: "external_signal", status: "in_progress" },
        ],
      },
    } as never);

    expect(text).toContain("以色列 伊朗 美国 局势 微头条");
    expect(text).toContain("dominant");
    expect(text).toContain("cluster");
    expect(text).toContain("toutiao, weibo");
    expect(text).toContain("publish-creator, signal-scout");
    expect(text).toContain("creator:external_publish");
  });

  it("respects the heartbeat interval", () => {
    expect(
      shouldRunGenesisAutonomyHeartbeat({
        now: 2_000,
        lastTickAt: 1_000,
        minIntervalMs: 500,
      }),
    ).toBe(true);
    expect(
      shouldRunGenesisAutonomyHeartbeat({
        now: 1_200,
        lastTickAt: 1_000,
        minIntervalMs: 500,
      }),
    ).toBe(false);
  });
});
