import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let stateDir: string;

describe("opencli capability", () => {
  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-opencli-"));
    vi.resetModules();
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.doUnmock("node:child_process");
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  it("probes opencli capabilities and records available hot sources", async () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const full = [command, ...args].join(" ");
      if (/opencli(?:\.cmd)?\s+list\s+-f\s+json/i.test(full) && !/@jackwener\/opencli/i.test(full)) {
        return { status: 1, stdout: "", stderr: "opencli unavailable" };
      }
      if (/(?:npx(?:\.cmd)?\s+-y\s+@jackwener\/opencli\s+list\s+-f\s+json)/i.test(full)) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { command: "36kr/news" },
            { command: "weibo/hot" },
            { command: "zhihu/hot" },
          ]),
          stderr: "",
        };
      }
      if (/opencli(?:\.cmd)?\s+weibo\s+hot\s+-f\s+json/i.test(full) && !/@jackwener\/opencli/i.test(full)) {
        return { status: 1, stdout: "", stderr: "opencli unavailable" };
      }
      if (/(?:npx(?:\.cmd)?\s+-y\s+@jackwener\/opencli\s+weibo\s+hot\s+-f\s+json)/i.test(full)) {
        return { status: 1, stdout: "", stderr: "Browser Bridge not connected" };
      }
      return { status: 1, stdout: "", stderr: `unexpected:${full}` };
    });

    vi.doMock("node:child_process", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:child_process")>();
      return {
        ...actual,
        spawnSync,
      };
    });

    const { refreshGenesisOpenCliCapabilitySummarySnapshotSync } = await import("./opencli-capability.js");
    const { resolveGenesisOpenCliCapabilitySummaryPath } = await import("./state.js");

    const summary = refreshGenesisOpenCliCapabilitySummarySnapshotSync(process.env);

    expect(summary.available).toBe(true);
    expect(summary.invocation).toBe("npx");
    expect(summary.commandCount).toBe(3);
    expect(summary.browserBridgeConnected).toBe(false);
    expect(summary.readyHotSourceNames).toEqual(["36kr/news", "weibo/hot", "zhihu/hot"]);
    if (process.platform === "win32") {
      expect(spawnSync.mock.calls[0]?.[0]).toMatch(/cmd(\.exe)?$/i);
    }

    const persisted = JSON.parse(
      await fs.readFile(resolveGenesisOpenCliCapabilitySummaryPath(process.env), "utf8"),
    );
    expect(persisted.readyHotSourceNames).toEqual(["36kr/news", "weibo/hot", "zhihu/hot"]);
  });

  it("lets scout fetch hotspots via opencli and writes a completed proactive outcome", async () => {
    const spawnSync = vi.fn((command: string, args: string[]) => {
      const full = [command, ...args].join(" ");
      if (/opencli(?:\.cmd)?\s+list\s+-f\s+json/i.test(full) && !/@jackwener\/opencli/i.test(full)) {
        return { status: 1, stdout: "", stderr: "opencli unavailable" };
      }
      if (/(?:npx(?:\.cmd)?\s+-y\s+@jackwener\/opencli\s+list\s+-f\s+json)/i.test(full)) {
        return {
          status: 0,
          stdout: JSON.stringify([
            { command: "36kr/news" },
            { command: "weibo/hot" },
          ]),
          stderr: "",
        };
      }
      if (/opencli(?:\.cmd)?\s+36kr\s+news\s+-f\s+json/i.test(full) && !/@jackwener\/opencli/i.test(full)) {
        return { status: 1, stdout: "", stderr: "opencli unavailable" };
      }
      if (/(?:npx(?:\.cmd)?\s+-y\s+@jackwener\/opencli\s+36kr\s+news\s+-f\s+json)/i.test(full)) {
        return {
          status: 0,
          stdout: JSON.stringify([
            {
              title: "以色列伊朗冲突升温，原油与避险资产受关注",
              url: "https://36kr.com/p/alpha",
              summary: "国际局势带动热点变化。",
            },
            {
              title: "美国表态与中东局势联动，市场情绪波动",
              url: "https://36kr.com/p/beta",
            },
          ]),
          stderr: "",
        };
      }
      if (/opencli(?:\.cmd)?\s+weibo\s+hot\s+-f\s+json/i.test(full) && !/@jackwener\/opencli/i.test(full)) {
        return { status: 1, stdout: "", stderr: "opencli unavailable" };
      }
      if (/(?:npx(?:\.cmd)?\s+-y\s+@jackwener\/opencli\s+weibo\s+hot\s+-f\s+json)/i.test(full)) {
        return { status: 1, stdout: "", stderr: "Browser Bridge not connected" };
      }
      return { status: 1, stdout: "", stderr: `unexpected:${full}` };
    });

    vi.doMock("node:child_process", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:child_process")>();
      return {
        ...actual,
        spawnSync,
      };
    });

    const {
      runGenesisOpenCliScoutHotspotSync,
      readGenesisOpenCliCapabilitySummarySnapshotSync,
    } = await import("./opencli-capability.js");
    const { readGenesisProactiveWorkSummarySync } = await import("./proactive-work.js");

    runGenesisOpenCliScoutHotspotSync({
      ts: 1_800_000_000_000,
      env: process.env,
      intentSummary: {
        dominantHistoryKind: "search",
        strongestTopicCluster: "research_signal",
        recentKeywords: ["israel", "iran", "us", "headline"],
      } as never,
    });

    const summary = readGenesisOpenCliCapabilitySummarySnapshotSync(process.env);
    expect(summary?.latestScoutSource).toBe("36kr/news");
    expect(summary?.latestScoutTitle).toBeTruthy();
    expect(summary?.latestScoutUrl).toBeTruthy();
    expect((summary?.recentScoutItems ?? []).length).toBeGreaterThan(0);

    const proactive = readGenesisProactiveWorkSummarySync(process.env);
    const latest = proactive.recentEntries[0];
    expect(latest?.founderOrigin).toBe("scout");
    expect(latest?.status).toBe("completed");
    expect(latest?.workType).toBe("intelligence");
    expect(latest?.usedSkillName).toBe("opencli.36kr/news");
    expect(latest?.driverKind).toBe("history");
    expect(latest?.driverHistoryKind).toBe("search");
    expect(latest?.driverTopicCluster).toBe("research_signal");
    expect(latest?.driverKeywords).toEqual(["israel", "iran", "us", "headline"]);
    expect(latest?.effectType).toBe("opportunity");
    expect(latest?.effectEvidence).toBeTruthy();
    expect(latest?.resultPreview).toContain("36kr/news");
    expect(latest?.resultPreview).toMatch(/hotspots|36kr\/news/i);
  });

  it("prefers weibo hot when browser bridge is connected and social publishing intent is strong", async () => {
    const { resolveGenesisOpenCliScoutSource } = await import("./opencli-capability.js");

    const source = resolveGenesisOpenCliScoutSource(
      {
        available: true,
        invocation: "npx",
        commandCount: 10,
        browserBridgeConnected: true,
        hotSourceCount: 2,
        readyHotSourceNames: ["36kr/news", "weibo/hot"],
        recentScoutItems: [],
      },
      {
        recentKeywords: ["weibo", "toutiao", "publish"],
        strongestTopicCluster: "research_signal",
      } as never,
    );

    expect(source).toBe("weibo/hot");
  });
});
