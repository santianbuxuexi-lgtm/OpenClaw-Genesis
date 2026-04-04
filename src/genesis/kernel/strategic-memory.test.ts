import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as lineageSummaryModule from "./lineage-summary.js";
import { resolveGenesisStrategicMemoryPromptSync } from "./strategic-memory.js";

const TEMP_DIRS: string[] = [];

async function makeStateDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "genesis-memory-"));
  TEMP_DIRS.push(dir);
  return dir;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(TEMP_DIRS.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("resolveGenesisStrategicMemoryPromptSync", () => {
  it("builds memory prompt for main from intent, outputs, and expansion", async () => {
    const stateDir = await makeStateDir();
    const genesisDir = path.join(stateDir, "genesis");
    await fs.mkdir(genesisDir, { recursive: true });
    await fs.writeFile(
      path.join(genesisDir, "user-intent-summary.json"),
      JSON.stringify(
        {
          strongestTopicCluster: "research_signal",
          recentKeywords: ["iran", "israel", "weibo", "toutiao"],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(genesisDir, "proactive-work-log.jsonl"),
      [
        JSON.stringify({
          workId: "pub-1",
          founderOrigin: "creator",
          agentId: "creator",
          sessionKey: "agent:creator:main",
          action: "lead",
          workType: "external_publish",
          task: "评论热点并发布微博",
          status: "completed",
          platform: "weibo",
          effectType: "publication",
          externalStatus: "executed",
          externalEvidenceType: "post_id",
          externalEvidenceValue: "https://weibo.com/4025893740/Q12345678",
          hotspotTitle: "伊朗以色列局势升温",
          contentPreview: "评论不重复新闻，只谈风险与情绪。",
          source: "workflow_dispatch",
          ts: 10,
          updatedAt: 10,
        }),
        JSON.stringify({
          workId: "pub-2",
          founderOrigin: "creator",
          agentId: "creator",
          sessionKey: "agent:creator:main",
          action: "lead",
          workType: "external_publish",
          task: "把热点压成微博评论",
          status: "in_progress",
          driverSummary: "history:search | topic:research_signal",
          source: "workflow_dispatch",
          ts: 11,
          updatedAt: 11,
        }),
      ].join("\n") + "\n",
    );
    vi.spyOn(lineageSummaryModule, "readGenesisLineageSummarySync").mockReturnValue({
      vitalitySummary: {
        childLineageCount: 3,
        secondGenerationChildCount: 1,
        thirdGenerationChildCount: 0,
        multiGenerationLineageCount: 1,
        specialtyWorkingChildCount: 2,
        specialtyProactiveChildCount: 1,
      } as never,
      ecologyCounts: {} as never,
      topLineages: [],
    } as never);

    const prompt = resolveGenesisStrategicMemoryPromptSync({
      agentId: "main",
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
    });

    expect(prompt).toContain("Strategic memory (internal):");
    expect(prompt).toContain("cluster=research_signal");
    expect(prompt).toContain("iran,israel,weibo,toutiao");
    expect(prompt).toContain("weibo hotspot=伊朗以色列局势升温");
    expect(prompt).toContain("Expansion state: children=3 secondGen=1");
  });

  it("adds account readiness for negotiator memory", async () => {
    const stateDir = await makeStateDir();
    const genesisDir = path.join(stateDir, "genesis");
    await fs.mkdir(genesisDir, { recursive: true });
    await fs.writeFile(
      path.join(genesisDir, "login-state-pool.json"),
      JSON.stringify(
        {
          records: [
            {
              recordId: "weibo-1",
              platform: "weibo",
              accountLabel: "wb",
              authMode: "storage_state",
              source: "browser_popup",
              status: "ready",
              capabilities: ["publish", "browse"],
              createdAt: 1,
              updatedAt: 1,
            },
            {
              recordId: "tt-1",
              platform: "toutiao",
              accountLabel: "tt",
              authMode: "storage_state",
              source: "browser_popup",
              status: "relogin_needed",
              capabilities: ["publish", "browse"],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          updatedAt: 1,
        },
        null,
        2,
      ),
    );
    await fs.writeFile(path.join(genesisDir, "proactive-work-log.jsonl"), "");
    await fs.writeFile(
      path.join(genesisDir, "user-intent-summary.json"),
      JSON.stringify({ recentKeywords: [], strongestTopicCluster: "coordination" }, null, 2),
    );
    vi.spyOn(lineageSummaryModule, "readGenesisLineageSummarySync").mockReturnValue({
      vitalitySummary: {} as never,
      ecologyCounts: {} as never,
      topLineages: [],
    } as never);

    const prompt = resolveGenesisStrategicMemoryPromptSync({
      assignment: {
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1,
        lane: "workflow",
        dispatchMode: "immediate",
        updatedAt: 1,
        assignment: {
          agentId: "negotiator",
          sessionKey: "agent:negotiator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
      },
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir },
    });

    expect(prompt).toContain("Platform readiness: ready=1");
    expect(prompt).toContain("relogin=1");
    expect(prompt).toContain("best=weibo");
    expect(prompt).toContain("gap=toutiao");
  });
});
