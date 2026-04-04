import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendGenesisProactiveWorkEntrySync,
  appendGenesisFounderDigestEntriesSync,
  appendGenesisRunCompletionOutcomeSync,
  ensureGenesisDailyLearningEntriesSync,
  ensureGenesisExternalExecutionEntriesSync,
  ensureGenesisSkillCapabilityEntriesSync,
  readGenesisProactiveWorkSummarySync,
  syncGenesisProactiveWorkOutcomesSync,
} from "./proactive-work.js";
import {
  beginGenesisPlatformLoginBootstrapSync,
  completeGenesisPlatformLoginBootstrapSync,
  reconcileGenesisLoginStatePoolSync,
} from "./login-state-pool.js";
import { appendGenesisDailyTrafficLogEntrySync } from "./daily-traffic-log.js";
import { writeGenesisEventLogSummarySnapshotSync } from "./event-log.js";

let stateDir: string;

describe("proactive work ledger", () => {
  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-proactive-work-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  it("converts founder digest results into concrete outcomes with evidence", () => {
    appendGenesisFounderDigestEntriesSync({
      runId: "run-1",
      climateKind: "search",
      ts: Date.now(),
      intentSummary: {
        strongestTopicCluster: "workflow_capability",
      } as never,
      digest: {
        entries: [
          {
            agentId: "builder",
            sessionKey: "agent:builder:main",
            action: "assist",
            mode: "support",
            preview:
              "Built a skill tool draft and published details at https://example.com/tool while opening a registration path.",
          },
          {
            agentId: "scout",
            sessionKey: "agent:scout:main",
            action: "assist",
            mode: "support",
            preview:
              "Found a new market opportunity and a bounty task on HackerOne for model compression.",
          },
        ],
      },
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.inProgressCount).toBe(0);
    expect(summary.completedCount).toBe(4);
    expect(summary.learningInProgressCount).toBe(0);
    expect(summary.concreteOutcomeCount).toBe(4);
    expect(summary.learningCompletedCount).toBe(2);
    expect(summary.recentConcreteOutcomes[0]?.effectType).toBeTruthy();
    expect(
      summary.recentConcreteOutcomes.some(
        (entry) =>
          entry.founderOrigin === "builder" &&
          entry.effectType === "skill_tool" &&
          (entry.effectEvidence ?? "").includes("https://example.com/tool"),
      ),
    ).toBe(true);
    expect(
      summary.recentConcreteOutcomes.some(
        (entry) => entry.founderOrigin === "scout" && entry.effectType === "bounty",
      ),
    ).toBe(true);
  });

  it("seeds one daily learning task per founder", () => {
    ensureGenesisDailyLearningEntriesSync({
      ts: new Date("2026-03-29T08:00:00Z").getTime(),
      intentSummary: {
        strongestTopicCluster: "coordination_recovery",
      } as never,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.learningPlannedCount).toBe(5);
    expect(summary.learningInProgressCount).toBe(0);
    expect(summary.activeLearningFounderCount).toBe(5);
    expect(summary.recentLearningEntries).toHaveLength(5);
    expect(summary.recentLearningEntries.every((entry) => entry.workType === "learning")).toBe(true);
  });

  it("seeds founder skill capability work when degraded skills exist", () => {
    ensureGenesisSkillCapabilityEntriesSync({
      ts: new Date("2026-03-29T08:00:00Z").getTime(),
      skillSummary: {
        workspaceDir: "/tmp/workspace",
        totalSkillCount: 5,
        readySkillCount: 2,
        degradedSkillCount: 2,
        blockedSkillCount: 1,
        installableSkillCount: 2,
        alwaysOnSkillCount: 0,
        publishCapableSkillCount: 0,
        researchCapableSkillCount: 1,
        automationCapableSkillCount: 1,
        highestSkillCapabilityFounderOrigin: "builder",
        highestSkillGapFounderOrigin: "scout",
        readySkillNames: ["tool-builder"],
        degradedSkillNames: ["publish-creator", "signal-scout"],
        installableSkillNames: ["publish-creator", "signal-scout"],
        founderSkillLeaders: [],
      },
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.inProgressCount).toBe(5);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workType === "skill_build" &&
          entry.status === "in_progress" &&
          entry.founderOrigin === "builder" &&
          entry.executionStage === "skill_build" &&
          entry.skillTarget === "publish-creator, signal-scout",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workType === "skill_check" &&
          entry.status === "in_progress" &&
          entry.founderOrigin === "scout" &&
          entry.executionStage === "skill_check" &&
          entry.skillTarget === "publish-creator, signal-scout",
      ),
    ).toBe(true);
  });

  it("promotes planned learning work into in_progress and then completed from founder output", () => {
    ensureGenesisDailyLearningEntriesSync({
      ts: new Date("2026-03-29T08:00:00Z").getTime(),
      intentSummary: {
        strongestTopicCluster: "workflow_capability",
      } as never,
    });

    appendGenesisFounderDigestEntriesSync({
      runId: "run-2",
      climateKind: "search",
      ts: new Date("2026-03-29T09:00:00Z").getTime(),
      intentSummary: {
        strongestTopicCluster: "workflow_capability",
      } as never,
      digest: {
        entries: [
          {
            agentId: "builder",
            sessionKey: "agent:builder:main",
            action: "assist",
            mode: "support",
            preview: "Built a reusable skill prototype for workflow automation.",
          },
        ],
      },
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.learningCompletedCount).toBeGreaterThanOrEqual(1);
    expect(summary.recentLearningOutcomes.some((entry) => entry.founderOrigin === "builder")).toBe(true);
  });

  it("reconciles in-progress founder work into completed evidence from later founder results", () => {
    const ts = new Date("2026-03-29T10:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:builder:tooling",
      founderOrigin: "builder",
      agentId: "builder",
      lineageId: "builder",
      sessionKey: "agent:builder:main",
      action: "assist",
      climateKind: "search",
      workType: "tooling",
      task: "Build a reusable workflow capability tool.",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisFounderDigestEntriesSync({
      runId: "run-3",
      climateKind: "search",
      ts: ts + 1000,
      intentSummary: {
        strongestTopicCluster: "workflow_capability",
      } as never,
      digest: {
        entries: [
          {
            agentId: "builder",
            sessionKey: "agent:builder:main",
            action: "assist",
            mode: "support",
            preview: "Built a reusable workflow skill tool and documented it at https://example.com/skill",
          },
        ],
      },
    });

    syncGenesisProactiveWorkOutcomesSync({
      ts: ts + 2000,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "dispatch:builder:tooling" &&
          entry.status === "completed" &&
          (entry.effectEvidence ?? "").includes("https://example.com/skill"),
      ),
    ).toBe(true);
  });

  it("writes direct run completion results into completed evidence without waiting for transcript previews", () => {
    const ts = new Date("2026-03-29T11:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:scout:intelligence",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "search",
      workType: "intelligence",
      task: "Proactively search for new opportunities and organize executable leads",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-direct-1",
      agentId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "search",
      ts: ts + 1000,
      env: process.env,
      result: {
        payloads: [
          {
            text: "鍙戠幇鏂扮殑 market opportunity锛屽苟鏁寸悊鍒?https://example.com/opportunity-report",
          },
        ],
      },
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "dispatch:scout:intelligence" &&
          entry.status === "completed" &&
          entry.effectType === "opportunity" &&
          (entry.effectEvidence ?? "").includes("https://example.com/opportunity-report"),
      ),
    ).toBe(true);
  });

  it("does not treat legacy toutiao publish-page evidence as a concrete completed outcome", () => {
    const ts = new Date("2026-03-29T13:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:legacy:creator:toutiao",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao:legacy",
      accountLabel: "toutiao:legacy",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao account to publish outward-facing content",
      status: "completed",
      source: "run_completion",
      ts,
      updatedAt: ts,
      resultPreview:
        "Published using skill toutiao.publish at https://mp.toutiao.com/profile_v4/graphic/publish?from=toutiao_pc",
      effectType: "skill_tool",
      effectEvidence: "https://mp.toutiao.com/profile_v4/graphic/publish?from=toutiao_pc",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:legacy:creator:toutiao" &&
          entry.status === "in_progress" &&
          !entry.effectType,
      ),
    ).toBe(true);
    expect(
      summary.recentConcreteOutcomes.some((entry) => entry.workId === "account:legacy:creator:toutiao"),
    ).toBe(false);
  });

  it("does not treat legacy weibo homepage evidence as a concrete completed outcome", () => {
    const ts = new Date("2026-03-29T13:05:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:legacy:creator:weibo",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: "weibo:legacy",
      accountLabel: "weibo:legacy",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo account to publish outward-facing content",
      status: "completed",
      source: "run_completion",
      ts,
      updatedAt: ts,
      resultPreview: "Published using skill weibo.publish at https://weibo.com/",
      effectType: "publication",
      effectEvidence: "https://weibo.com/",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:legacy:creator:weibo" &&
          entry.status === "in_progress" &&
          !entry.effectType,
      ),
    ).toBe(true);
    expect(
      summary.recentConcreteOutcomes.some((entry) => entry.workId === "account:legacy:creator:weibo"),
    ).toBe(false);
  });

  it("hides stale external in-progress entries when a newer completed result exists for the same founder and platform", () => {
    const baseTs = new Date("2026-03-29T13:10:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:old:creator:weibo",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: "weibo:main",
      accountLabel: "weibo:main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo account to publish outward-facing content",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: baseTs,
      updatedAt: baseTs,
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "account:new:creator:weibo",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: "weibo:main",
      accountLabel: "weibo:main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo account to publish outward-facing content",
      status: "completed",
      source: "run_completion",
      ts: baseTs + 2000,
      updatedAt: baseTs + 2000,
      externalCapability: "publish",
      externalStatus: "executed",
      externalEvidenceType: "post_id",
      externalEvidenceValue: "https://weibo.com/4025893740/QyvknufvP",
      externalId: "QyvknufvP",
      resultPreview: "Published using skill weibo.publish at https://weibo.com/4025893740/QyvknufvP",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.recentEntries.some((entry) => entry.workId === "account:old:creator:weibo")).toBe(false);
    expect(summary.recentEntries.some((entry) => entry.workId === "account:new:creator:weibo")).toBe(true);
  });

  it("hides older generic external in-progress work when a newer hotspot-driven task exists", () => {
    const baseTs = new Date("2026-03-30T16:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:generic:creator:toutiao",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao:main",
      accountLabel: "toutiao:main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao:toutiao-main to publish a concise outward-facing update about the current ecosystem focus",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: baseTs,
      updatedAt: baseTs,
      driverKind: "fallback",
      driverSummary: "source:fallback | objective:the current ecosystem focus",
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "account:hotspot:creator:toutiao",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao:main",
      accountLabel: "toutiao:main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao:toutiao-main to publish a concise outward-facing update about Israel Iran tensions spike https://example.com/hot | shape this hotspot into a <=500-char image-backed micro-headline commentary about toutiao,weibo",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: baseTs + 1000,
      updatedAt: baseTs + 1000,
      driverKind: "history",
      driverHistoryKind: "search",
      driverTopicCluster: "research_signal",
      driverKeywords: ["iran", "israel", "toutiao", "weibo"],
      driverSummary: "history:search | topic:research_signal | keywords:iran,israel,toutiao,weibo",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.recentEntries.some((entry) => entry.workId === "account:generic:creator:toutiao")).toBe(false);
    expect(summary.recentEntries.some((entry) => entry.workId === "account:hotspot:creator:toutiao")).toBe(true);
  });

  it("prefers normalized external outcome schema for executed publication evidence", () => {
    const ts = new Date("2026-03-29T13:30:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:schema:creator:toutiao",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao:schema",
      accountLabel: "toutiao:schema",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao account to publish outward-facing content",
      status: "completed",
      source: "run_completion",
      ts,
      updatedAt: ts,
      resultPreview: "Published using skill toutiao.publish at https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=1861075891533955",
      externalCapability: "publish",
      externalStatus: "executed",
      externalEvidenceType: "thread_id",
      externalEvidenceValue: "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=1861075891533955",
      externalId: "1861075891533955",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentConcreteOutcomes.some(
        (entry) =>
          entry.workId === "account:schema:creator:toutiao" &&
          entry.effectType === "publication" &&
          entry.effectEvidence === "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=1861075891533955" &&
          entry.externalEvidenceType === "thread_id" &&
          entry.externalId === "1861075891533955",
      ),
    ).toBe(true);
  });

  it("maps founder-specific completed work into concrete visible outcomes", () => {
    const ts = new Date("2026-03-29T12:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:creator:synthesis",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "query",
      workType: "synthesis",
      task: "Draft a content plan for the current opportunity",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:auditor:audit",
      founderOrigin: "auditor",
      agentId: "auditor",
      lineageId: "auditor",
      sessionKey: "agent:auditor:main",
      action: "assist",
      climateKind: "query",
      workType: "audit",
      task: "Audit the current rollout risk and findings",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:negotiator:coordination",
      founderOrigin: "negotiator",
      agentId: "negotiator",
      lineageId: "negotiator",
      sessionKey: "agent:negotiator:main",
      action: "assist",
      climateKind: "consultation",
      workType: "coordination",
      task: "Coordinate resource allocation and rollout order",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-direct-creator",
      agentId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "query",
      ts: ts + 1000,
      env: process.env,
      result: {
        payloads: [{ text: "Prepared a content draft and rollout plan for the new opportunity." }],
      },
    });
    appendGenesisRunCompletionOutcomeSync({
      runId: "run-direct-auditor",
      agentId: "auditor",
      sessionKey: "agent:auditor:main",
      action: "assist",
      climateKind: "query",
      ts: ts + 2000,
      env: process.env,
      result: {
        payloads: [{ text: "Identified a vulnerability finding and patch priority for the rollout." }],
      },
    });
    appendGenesisRunCompletionOutcomeSync({
      runId: "run-direct-negotiator",
      agentId: "negotiator",
      sessionKey: "agent:negotiator:main",
      action: "assist",
      climateKind: "consultation",
      ts: ts + 3000,
      env: process.env,
      result: {
        payloads: [{ text: "Completed channel allocation and coordination schedule for the launch." }],
      },
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.status === "completed" &&
          entry.artifactLabel === "content/plan",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "auditor" &&
          entry.status === "completed" &&
          entry.artifactLabel === "finding/audit",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "negotiator" &&
          entry.status === "completed" &&
          entry.artifactLabel === "coordination",
      ),
    ).toBe(true);
  });

  it("does not complete skill capability work from incompatible founder previews", () => {
    const ts = new Date("2026-03-29T13:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "skillcap:2026-03-29:scout",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "reactivate",
      climateKind: "skill-capability",
      workType: "skill_check",
      task: "Scan current skill readiness and external alternatives",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:scout:intelligence",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "search",
      workType: "intelligence",
      task: "Search for signals",
      status: "completed",
      resultPreview: "Identified a vulnerability finding and patch priority for the rollout.",
      artifactLabel: "finding/audit",
      source: "run_completion",
      ts: ts + 1000,
      updatedAt: ts + 1000,
    });

    syncGenesisProactiveWorkOutcomesSync({
      ts: ts + 2000,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "skillcap:2026-03-29:scout" &&
          entry.status === "in_progress",
      ),
    ).toBe(true);
  });

  it("captures used and built skill metadata from founder outcomes", () => {
    const ts = new Date("2026-03-29T14:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:builder:tooling-meta",
      founderOrigin: "builder",
      agentId: "builder",
      lineageId: "builder",
      sessionKey: "agent:builder:main",
      action: "assist",
      climateKind: "requirement",
      workType: "tooling",
      task: "Build a reusable skill/tool for external publishing",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-direct-builder-skill",
      agentId: "builder",
      sessionKey: "agent:builder:main",
      action: "assist",
      climateKind: "requirement",
      ts: ts + 1000,
      env: process.env,
      result: {
        payloads: [
          {
            text: "Built skill founder-publish-skill and used tool browser.publish to validate the workflow.",
          },
        ],
      },
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:creator:external",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo:test-account to draft and publish outward-facing content",
      status: "in_progress",
      platform: "weibo",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-direct-creator-external",
      agentId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "external-execution",
      ts: ts + 2000,
      env: process.env,
      result: {
        payloads: [{ text: "Published a launch thread using skill weibo.publish at https://example.com/post/1" }],
      },
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "dispatch:builder:tooling-meta" &&
          entry.status === "completed" &&
          entry.executionStage === "skill_build" &&
          entry.builtSkillName === "founder-publish-skill",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "dispatch:creator:external" &&
          entry.status === "completed" &&
          entry.executionStage === "execute" &&
          entry.usedSkillName === "weibo.publish",
      ),
    ).toBe(true);
  });

  it.skip("routes external execution dynamically to toutiao for micro-headline style intent", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 2,
      originCount: 1,
      status: "ready",
      env: process.env,
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T10:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["israel", "iran", "us", "tensions", "weitoutiao", "toutiao"],
        strongestTopicCluster: "research_signal",
        searchHistoryCount: 2,
      } as never,
      loginSummary: reconcileGenesisLoginStatePoolSync(process.env) as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "toutiao" &&
          entry.workType === "external_publish" &&
          entry.founderOrigin === "creator" &&
          entry.task.toLowerCase().includes("israel"),
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "toutiao" &&
          entry.workType === "external_signal" &&
          entry.founderOrigin === "scout",
      ),
    ).toBe(true);
  });

  it("allows multiple external execution tasks in one day when platform or capability changes", () => {
    const weiboPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: weiboPending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    const toutiaoPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: toutiaoPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T09:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["weibo", "publish"],
        strongestTopicCluster: "ideation_strategy",
      } as never,
      loginSummary: reconcileGenesisLoginStatePoolSync(process.env) as never,
      env: process.env,
    });
    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T11:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["toutiao", "weitoutiao", "publish"],
        strongestTopicCluster: "ideation_strategy",
      } as never,
      loginSummary: reconcileGenesisLoginStatePoolSync(process.env) as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.filter(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.workType === "external_publish" &&
          entry.status !== "completed",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("completes skill capability work from compatible founder previews", () => {
    const ts = new Date("2026-03-29T14:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "skillcap:2026-03-29:builder",
      founderOrigin: "builder",
      agentId: "builder",
      lineageId: "builder",
      sessionKey: "agent:builder:main",
      action: "assist",
      climateKind: "skill-capability",
      workType: "skill_build",
      task: "Close installable skill gaps and build missing tool coverage",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:builder:tooling",
      founderOrigin: "builder",
      agentId: "builder",
      lineageId: "builder",
      sessionKey: "agent:builder:main",
      action: "assist",
      climateKind: "search",
      workType: "tooling",
      task: "Build tool coverage",
      status: "completed",
      resultPreview: "Built a reusable workflow skill tool and documented the automation path.",
      artifactLabel: "skill/tool",
      source: "run_completion",
      ts: ts + 1000,
      updatedAt: ts + 1000,
    });

    syncGenesisProactiveWorkOutcomesSync({
      ts: ts + 2000,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "skillcap:2026-03-29:builder" &&
          entry.status === "completed" &&
          entry.artifactLabel === "skill/tool",
      ),
    ).toBe(true);
  });

  it("creates account-linked external execution work and releases the account on completion", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "寰崥涓诲彿",
      env: process.env,
    });
    const profileDir = path.join(
      stateDir,
      "genesis",
      "login-storage",
      "weibo",
      encodeURIComponent(pending.recordId),
      "Default",
      "Network",
    );
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, "Cookies"), "cookie-db");
    reconcileGenesisLoginStatePoolSync(process.env);

    const ts = new Date("2026-03-29T15:00:00Z").getTime();
    ensureGenesisExternalExecutionEntriesSync({
      ts,
      intentSummary: {
        recentKeywords: ["寰崥", "鍙戝竷", "鏇存柊"],
        strongestTopicCluster: "ideation_strategy",
        searchHistoryCount: 1,
        timeWeightedHistorySignalScore: 0.8,
        workProfileSignalScore: 0.6,
        interestProfileSignalScore: 0.2,
        combinedSignalScore: 1.6,
      } as never,
      env: process.env,
    });

    let summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workType === "external_publish" &&
          entry.platform === "weibo" &&
          entry.status === "planned",
      ),
    ).toBe(true);

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-external-creator",
      agentId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "external-execution",
      ts: ts + 1000,
      env: process.env,
      result: {
        payloads: [{ text: "Published a weibo draft for the ecosystem launch update." }],
      },
    });

    summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workType === "external_publish" &&
          entry.status === "completed" &&
          entry.platform === "weibo",
      ),
    ).toBe(true);
  });

  it("stores history-driven execution metadata on proactive external work", async () => {
    for (const [index, label] of ["weibo-main", "weibo-scout"].entries()) {
      const pending = beginGenesisPlatformLoginBootstrapSync({
        platform: "weibo",
        accountLabel: label,
        ts: Date.now() + index,
        env: process.env,
      });
      const profileDir = path.join(
        stateDir,
        "genesis",
        "login-storage",
        "weibo",
        encodeURIComponent(pending.recordId),
        "Default",
        "Network",
      );
      await fs.mkdir(profileDir, { recursive: true });
      await fs.writeFile(path.join(profileDir, "Cookies"), "cookie-db");
    }
    reconcileGenesisLoginStatePoolSync(process.env);

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T21:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["israel", "iran", "us", "weibo", "headline", "hotspot"],
        strongestTopicCluster: "research_signal",
        dominantHistoryKind: "search",
        searchHistoryCount: 2,
        timeWeightedHistorySignalScore: 0.9,
        workProfileSignalScore: 0.6,
        interestProfileSignalScore: 0.3,
        combinedSignalScore: 2.1,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workType === "external_publish" &&
          entry.founderOrigin === "creator" &&
          entry.driverKind === "history" &&
          entry.driverHistoryKind === "search" &&
          entry.driverTopicCluster === "research_signal" &&
          (entry.driverKeywords ?? []).includes("israel") &&
          (entry.driverSummary ?? "").includes("history:search") &&
          (entry.driverSummary ?? "").includes("topic:research_signal"),
      ),
    ).toBe(true);
  });

  it("lets creator consume the latest scout opencli hotspot when creating publish work", async () => {
    for (const [index, label] of ["weibo-main", "weibo-scout"].entries()) {
      const pending = beginGenesisPlatformLoginBootstrapSync({
        platform: "weibo",
        accountLabel: label,
        ts: Date.now() + index,
        env: process.env,
      });
      completeGenesisPlatformLoginBootstrapSync({
        recordId: pending.recordId,
        platform: "weibo",
        accountLabel: label,
        cookieCount: 1,
        originCount: 1,
        status: "ready",
        env: process.env,
      });
    }

    appendGenesisProactiveWorkEntrySync({
      workId: "opencli:weibo_hot:2026-03-30T09:scout",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "opencli-hotspot",
      workType: "intelligence",
      task: "Use opencli weibo/hot to gather live hotspot signals",
      status: "completed",
      executionStage: "skill_use",
      usedSkillName: "opencli.weibo/hot",
      driverKind: "history",
      driverHistoryKind: "search",
      driverTopicCluster: "research_signal",
      driverKeywords: ["israel", "iran", "weibo"],
      driverSummary: "history:search | topic:research_signal | keywords:israel,iran,weibo",
      resultPreview:
        "Scout used opencli weibo/hot and found hotspots: 1. Israel Iran US tensions spike on Weibo https://weibo.com/hot/123",
      artifactLabel: "signal/opportunity",
      effectType: "opportunity",
      effectEvidence: "https://weibo.com/hot/123",
      source: "run_completion",
      ts: new Date("2026-03-30T09:00:00Z").getTime(),
      updatedAt: new Date("2026-03-30T09:00:00Z").getTime(),
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T09:15:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["israel", "iran", "weibo", "publish"],
        strongestTopicCluster: "research_signal",
        dominantHistoryKind: "search",
        searchHistoryCount: 2,
        timeWeightedHistorySignalScore: 0.9,
        workProfileSignalScore: 0.4,
        interestProfileSignalScore: 0.2,
        combinedSignalScore: 1.8,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.workType === "external_publish" &&
          entry.status === "planned" &&
          entry.usedSkillName === "weibo.publish" &&
          entry.task.includes("Israel Iran US tensions spike on Weibo") &&
          entry.task.includes("https://weibo.com/hot/123") &&
          entry.task.includes("<=500-char image-backed weibo commentary post"),
      ),
    ).toBe(true);
  });

  it("replaces a weaker generic creator publish task with a newer hotspot-driven publish task", () => {
    const baseTs = new Date("2026-04-01T10:00:00Z").getTime();
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      ts: baseTs,
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "account:2026-04-01T10:creator:toutiao:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: pending.recordId,
      accountLabel: "toutiao-main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao:toutiao-main to publish a concise outward-facing update about the current ecosystem focus",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: baseTs,
      updatedAt: baseTs,
      driverKind: "fallback",
      driverSummary: "source:fallback | objective:the current ecosystem focus",
    });

    appendGenesisProactiveWorkEntrySync({
      workId: "opencli:36kr_news:2026-04-01T10:scout",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "opencli-hotspot",
      workType: "intelligence",
      task: "Use opencli 36kr/news to gather live hotspot signals around israel iran tensions",
      status: "completed",
      executionStage: "skill_use",
      usedSkillName: "opencli.36kr/news",
      driverKind: "history",
      driverHistoryKind: "search",
      driverTopicCluster: "research_signal",
      driverKeywords: ["israel", "iran", "toutiao", "weibo"],
      driverSummary: "history:search | topic:research_signal | keywords:israel,iran,toutiao,weibo",
      resultPreview: "Scout used opencli 36kr/news and found hotspots: 1. Israel Iran tensions spike https://36kr.com/p/hotspot-1",
      artifactLabel: "signal/opportunity",
      effectType: "opportunity",
      effectEvidence: "https://36kr.com/p/hotspot-1",
      source: "run_completion",
      ts: baseTs + 1000,
      updatedAt: baseTs + 1000,
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: baseTs + 2000,
      intentSummary: {
        recentKeywords: ["israel", "iran", "toutiao", "weibo"],
        strongestTopicCluster: "research_signal",
        dominantHistoryKind: "search",
        searchHistoryCount: 2,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:2026-04-01T10:creator:toutiao:publish" &&
          entry.status === "completed" &&
          entry.externalEvidenceValue === "superseded_by:account:2026-04-01T10:creator:toutiao:publish",
      ),
    ).toBe(false);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:2026-04-01T10:creator:toutiao:publish" &&
          entry.status === "completed" &&
          entry.effectEvidence === "superseded_by:account:2026-04-01T10:creator:toutiao:publish",
      ),
    ).toBe(false);
    const creatorPublish = summary.recentEntries.find(
      (entry) =>
        entry.founderOrigin === "creator" &&
        entry.platform === "toutiao" &&
        entry.workType === "external_publish" &&
        entry.status === "planned",
    );
    expect(creatorPublish?.task).toContain("shape this hotspot into a <=500-char image-backed micro-headline commentary");
    expect(creatorPublish?.hotspotTitle).toContain("Israel Iran tensions spike");
    expect(creatorPublish?.trafficFingerprint).toContain("toutiao:");
  });

  it("normalizes older hotspot-driven publish wording into short-form social wording", () => {
    const ts = new Date("2026-03-31T08:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:legacy-hotspot:creator:toutiao",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao:legacy-hotspot",
      accountLabel: "toutiao-main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao:toutiao-main to publish a concise outward-facing update about Israel Iran tensions spike https://example.com/hot | turn this hotspot into a concise social update about toutiao weibo iran israel states tensions",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
      driverKind: "history",
      driverHistoryKind: "search",
      driverTopicCluster: "research_signal",
      driverKeywords: ["iran", "israel", "toutiao", "weibo"],
      driverSummary: "history:search | topic:research_signal | keywords:iran,israel,toutiao,weibo",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:legacy-hotspot:creator:toutiao" &&
          entry.task.includes("shape this hotspot into a <=500-char image-backed micro-headline commentary"),
      ),
    ).toBe(true);
  });

  it.skip("does not force audit and coordination lanes during autonomous publish cycles without explicit need", () => {
    const toutiaoPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: toutiaoPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    const weiboPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: weiboPending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-31T12:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["israel", "iran", "weibo", "toutiao", "publish"],
        dominantHistoryKind: "search",
        strongestTopicCluster: "research_signal",
        combinedSignalScore: 1.8,
        searchHistoryCount: 2,
      } as never,
      loginSummary: reconcileGenesisLoginStatePoolSync(process.env) as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(summary.recentEntries.some((entry) => entry.workId.includes(":creator:"))).toBe(true);
    expect(summary.recentEntries.some((entry) => entry.workId.includes(":scout:"))).toBe(true);
    expect(summary.recentEntries.some((entry) => entry.workId.includes(":auditor:"))).toBe(false);
    expect(summary.recentEntries.some((entry) => entry.workId.includes(":negotiator:"))).toBe(false);
  });

  it("creates dynamic toutiao publish and scout browse work when intent asks for a micro headline", () => {
    for (const [index, label] of ["toutiao-main", "toutiao-scout"].entries()) {
      const pending = beginGenesisPlatformLoginBootstrapSync({
        platform: "toutiao",
        accountLabel: label,
        ts: Date.now() + index,
        env: process.env,
      });
      completeGenesisPlatformLoginBootstrapSync({
        recordId: pending.recordId,
        platform: "toutiao",
        accountLabel: label,
        cookieCount: 2,
        originCount: 1,
        status: "ready",
        env: process.env,
      });
    }

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T16:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["israel", "iran", "us", "headline", "toutiao", "publish", "research"],
        strongestTopicCluster: "research_signal",
        searchHistoryCount: 2,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "toutiao" &&
          entry.founderOrigin === "creator" &&
          entry.workType === "external_publish" &&
          entry.status === "planned",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "toutiao" &&
          entry.founderOrigin === "scout" &&
          entry.workType === "external_signal" &&
          entry.status === "planned",
      ),
    ).toBe(true);
  });

  it("can create multiple creator external publish entries in one day when platform changes", () => {
    for (const [index, [platform, label]] of [
      ["weibo", "weibo-main"],
      ["toutiao", "toutiao-main"],
    ].entries() as IterableIterator<[number, readonly [string, string]]>) {
      const pending = beginGenesisPlatformLoginBootstrapSync({
        platform,
        accountLabel: label,
        ts: Date.now() + index,
        env: process.env,
      });
      completeGenesisPlatformLoginBootstrapSync({
        recordId: pending.recordId,
        platform,
        accountLabel: label,
        cookieCount: 1,
        originCount: 1,
        status: "ready",
        env: process.env,
      });
    }

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T09:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["weibo", "publish"],
        strongestTopicCluster: "ideation_strategy",
      } as never,
      env: process.env,
    });
    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T11:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["toutiao", "micro", "headline", "publish"],
        strongestTopicCluster: "ideation_strategy",
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.filter(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.workType === "external_publish" &&
          entry.status !== "completed",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("can create another same-platform publish cycle after the earlier one completes", () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      ts: Date.now(),
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });

    const firstTs = new Date("2026-03-30T09:00:00Z").getTime();
    ensureGenesisExternalExecutionEntriesSync({
      ts: firstTs,
      intentSummary: {
        recentKeywords: ["weibo", "publish", "鐑偣"],
        strongestTopicCluster: "research_signal",
      } as never,
      env: process.env,
    });

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-external-cycle-1",
      agentId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "external-execution",
      ts: firstTs + 5_000,
      env: process.env,
      externalOutcome: {
        capability: "publish",
        status: "executed",
        evidenceType: "post_id",
        evidenceValue: "https://weibo.com/123/abc",
        externalId: "abc",
      },
      result: {
        payloads: [{ text: "Published using skill weibo.publish at https://weibo.com/123/abc post_id=abc" }],
      },
    });

    const secondTs = new Date("2026-03-30T12:00:00Z").getTime();
    ensureGenesisExternalExecutionEntriesSync({
      ts: secondTs,
      intentSummary: {
        recentKeywords: ["weibo", "publish", "鐑偣"],
        strongestTopicCluster: "research_signal",
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.filter(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.platform === "weibo" &&
          entry.workType === "external_publish",
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.platform === "weibo" &&
          entry.workType === "external_publish" &&
          entry.status === "planned" &&
          entry.workId.startsWith("account:2026-03-30T12:"),
      ),
    ).toBe(true);
  });

  it("matches external completion to the exact work item instead of leaking across platforms", () => {
    const weiboPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      ts: Date.now(),
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: weiboPending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    const toutiaoPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      ts: Date.now() + 1,
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: toutiaoPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });

    const ts = new Date("2026-03-31T09:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:creator:weibo:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: weiboPending.recordId,
      accountLabel: "weibo-main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Publish to weibo",
      status: "in_progress",
      source: "workflow_dispatch",
      ts,
      updatedAt: ts,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "account:creator:toutiao:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: toutiaoPending.recordId,
      accountLabel: "toutiao-main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Publish to toutiao",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: ts + 1,
      updatedAt: ts + 1,
    });

    appendGenesisRunCompletionOutcomeSync({
      runId: "run-external-toutiao",
      agentId: "creator",
      sessionKey: "agent:creator:main",
      workId: "account:creator:toutiao:publish",
      accountRecordId: toutiaoPending.recordId,
      platform: "toutiao",
      action: "assist",
      climateKind: "external-execution",
      ts: ts + 2_000,
      env: process.env,
      externalOutcome: {
        capability: "publish",
        status: "executed",
        evidenceType: "thread_id",
        evidenceValue: "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=123",
        externalId: "123",
        contentPreview: "局势越热，越要警惕情绪把价格推离价值。",
      },
      result: {
        payloads: [{ text: "Published using skill toutiao.publish thread_id=123" }],
      },
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:creator:toutiao:publish" &&
          entry.status === "completed" &&
          entry.platform === "toutiao" &&
          entry.externalId === "123" &&
          entry.contentPreview === "局势越热，越要警惕情绪把价格推离价值。",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:creator:weibo:publish" &&
          entry.status === "in_progress" &&
          entry.platform === "weibo",
      ),
    ).toBe(true);
  });

  it("downgrades cross-platform completed external outcomes during summary reconciliation", () => {
    const ts = new Date("2026-03-31T10:00:00Z").getTime();
    appendGenesisProactiveWorkEntrySync({
      workId: "account:creator:weibo:mismatched",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Publish to weibo",
      status: "completed",
      resultPreview: "Published using skill toutiao.publish thread_id=999",
      effectType: "publication",
      effectEvidence: "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=999",
      externalCapability: "publish",
      externalStatus: "executed",
      externalEvidenceType: "thread_id",
      externalEvidenceValue: "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=999",
      externalId: "999",
      source: "run_completion",
      ts,
      updatedAt: ts,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:creator:weibo:mismatched" &&
          entry.platform === "weibo" &&
          entry.status === "in_progress" &&
          !entry.externalEvidenceType &&
          !entry.externalId,
      ),
    ).toBe(true);
  });

  it("derives autonomous external work objective from recent environment events when user intent is weak", () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      ts: Date.now(),
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    writeGenesisEventLogSummarySnapshotSync(
      {
        recentEntryCount: 4,
        environmentEventCount: 2,
        runCompletionCount: 0,
        workflowDispatchCount: 0,
        recentEnvironmentTriggers: {
          cron: 1,
          heartbeat: 1,
          workflow: 0,
        },
        lastEntryTs: new Date("2026-03-30T17:59:00Z").getTime(),
        lastEnvironmentTs: new Date("2026-03-30T17:58:00Z").getTime(),
        lastEnvironmentSummary: "Track Israel Iran US tensions, oil reaction, and public attention for short-form publishing.",
      },
      process.env,
    );

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T18:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: [],
        strongestTopicCluster: null,
        searchHistoryCount: 0,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "toutiao" &&
          entry.workType === "external_signal" &&
          /Israel Iran US tensions/i.test(entry.task),
      ),
    ).toBe(true);
  });

  it("derives autonomous external work objective from recent completed outcomes before falling back to generic topics", () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      ts: Date.now(),
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "account:2026-03-30T10:creator:weibo:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: pending.recordId,
      accountLabel: "weibo-main",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo to publish a concise outward-facing update",
      status: "completed",
      source: "run_completion",
      ts: new Date("2026-03-30T10:05:00Z").getTime(),
      updatedAt: new Date("2026-03-30T10:05:00Z").getTime(),
      externalCapability: "publish",
      externalStatus: "executed",
      externalEvidenceType: "url",
      externalEvidenceValue: "Israel Iran US tensions oil reaction and market risk summary https://weibo.com/123/abc",
      externalId: "abc",
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-30T20:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: [],
        strongestTopicCluster: null,
        searchHistoryCount: 0,
        timeWeightedHistorySignalScore: 0.7,
        workProfileSignalScore: 0.55,
        interestProfileSignalScore: 0.15,
        combinedSignalScore: 1.5,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "weibo" &&
          entry.workType === "external_publish" &&
          /oil reaction and market risk summary/i.test(entry.task),
      ),
    ).toBe(true);
  });

  it("hides stale in-progress hotspot publish tasks once a newer completed outcome exists for the same hotspot", () => {
    appendGenesisProactiveWorkEntrySync({
      workId: "account:2026-03-31T14:creator:toutiao:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao-old",
      accountLabel: "toutiao-old",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao:toutiao-old to publish a concise outward-facing update about hotspot https://36kr.com/p/hotspot-1 | shape this hotspot into a <=500-char image-backed micro-headline commentary",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: 1_000,
      updatedAt: 1_000,
      driverKind: "history",
      driverHistoryKind: "search",
      driverSummary: "history:search | keywords:toutiao,weibo,iran,israel,states",
      skillTarget: "toutiao",
      usedSkillName: "toutiao.publish",
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "account:2026-03-31T16:creator:toutiao:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "toutiao",
      accountRecordId: "toutiao-new",
      accountLabel: "toutiao-new",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use toutiao:toutiao-new to publish a concise outward-facing update about hotspot https://36kr.com/p/hotspot-1 | shape this hotspot into a <=500-char image-backed micro-headline commentary",
      status: "completed",
      source: "run_completion",
      ts: 2_000,
      updatedAt: 2_000,
      driverKind: "history",
      driverHistoryKind: "search",
      driverSummary: "history:search | keywords:toutiao,weibo,iran,israel,states",
      skillTarget: "toutiao",
      usedSkillName: "toutiao.publish",
      effectType: "publication",
      effectEvidence: "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=1861173233459290",
      externalCapability: "publish",
      externalStatus: "executed",
      externalEvidenceType: "thread_id",
      externalEvidenceValue: "https://mp.toutiao.com/profile_v4/weitoutiao/manage?thread_id=1861173233459290",
      externalId: "1861173233459290",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:2026-03-31T14:creator:toutiao:publish" &&
          entry.status === "in_progress",
      ),
    ).toBe(false);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:2026-03-31T16:creator:toutiao:publish" &&
          entry.status === "completed" &&
          entry.externalId === "1861173233459290",
      ),
    ).toBe(true);
  });

  it("records hotspot-driven publish entries with hotspot metadata", () => {
    appendGenesisProactiveWorkEntrySync({
      workId: "account:hotspot:creator:weibo",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: "weibo-hotspot",
      accountLabel: "weibo-hotspot",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo:weibo-hotspot to publish a concise outward-facing update about Israel Iran tensions spike https://example.com/hot | shape this hotspot into a <=500-char image-backed weibo commentary post",
      status: "planned",
      source: "workflow_dispatch",
      ts: 5_000,
      updatedAt: 5_000,
      driverKind: "hotspot",
      hotspotTitle: "Israel Iran tensions spike",
      hotspotUrl: "https://example.com/hot",
      driverSummary: "hotspot:Israel Iran tensions spike | hotspotUrl:https://example.com/hot",
      trafficFingerprint: "weibo:israel iran tensions spike",
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:hotspot:creator:weibo" &&
          entry.driverKind === "hotspot" &&
          entry.hotspotTitle === "Israel Iran tensions spike" &&
          entry.hotspotUrl === "https://example.com/hot" &&
          entry.trafficFingerprint === "weibo:israel iran tensions spike",
      ),
    ).toBe(true);
  });

  it("reclaims stale generic founder backlog when a newer cycle already exists", () => {
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:creator:synthesis:old",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "command",
      workType: "synthesis",
      task: "主动整理方案、内容、策略和可交付表达",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: 1_000,
      updatedAt: 1_000,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "dispatch:creator:synthesis:new",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      action: "assist",
      climateKind: "command",
      workType: "synthesis",
      task: "主动整理方案、内容、策略和可交付表达",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: 8 * 60 * 60 * 1000,
      updatedAt: 8 * 60 * 60 * 1000,
    });

    syncGenesisProactiveWorkOutcomesSync({
      ts: 9 * 60 * 60 * 1000,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "dispatch:creator:synthesis:old" &&
          entry.status === "completed" &&
          (entry.resultPreview ?? "").includes("Reclaimed stale synthesis cycle"),
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "dispatch:creator:synthesis:new" &&
          entry.status === "in_progress",
      ),
    ).toBe(true);
  });

  it("creates creator publish work for both weibo and toutiao when hotspot and both platforms are ready", () => {
    const pendingWeibo = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      ts: Date.now(),
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pendingWeibo.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    const pendingToutiao = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-main",
      ts: Date.now(),
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pendingToutiao.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "digest:run-scout:agent:scout:main",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "search",
      workType: "intelligence",
      task: "Track hotspot signals",
      status: "completed",
      source: "run_completion",
      ts: new Date("2026-04-01T02:00:00Z").getTime(),
      updatedAt: new Date("2026-04-01T02:00:00Z").getTime(),
      resultPreview: "Found hotspots: Israel Iran tensions rise https://example.com/hotspot-1",
      effectType: "opportunity",
      effectEvidence: "https://example.com/hotspot-1",
      usedSkillName: "opencli.36kr/news",
      hotspotTitle: "Israel Iran tensions rise",
      hotspotUrl: "https://example.com/hotspot-1",
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-04-01T03:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["weibo", "toutiao", "israel", "iran", "commentary"],
        strongestTopicCluster: "research_signal",
        dominantHistoryKind: "search",
        searchHistoryCount: 2,
        timeWeightedHistorySignalScore: 0.8,
        combinedSignalScore: 1.4,
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.platform === "weibo" &&
          entry.workType === "external_publish" &&
          entry.hotspotTitle === "Israel Iran tensions rise",
      ),
    ).toBe(true);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.founderOrigin === "creator" &&
          entry.platform === "toutiao" &&
          entry.workType === "external_publish" &&
          entry.hotspotTitle === "Israel Iran tensions rise",
      ),
    ).toBe(true);
  });

  it("skips creating duplicate publish work when the hotspot fingerprint was already published recently", () => {
    appendGenesisDailyTrafficLogEntrySync(
      {
        logId: "published:weibo:hotspot-1",
        platform: "weibo",
        capability: "publish",
        fingerprint: "weibo:israel iran tensions spike",
        founderOrigin: "creator",
        workId: "account:done:creator:weibo",
        driverSummary: "history:search | topic:research_signal",
        hotspotTitle: "Israel Iran tensions spike",
        hotspotUrl: "https://example.com/hot",
        contentPreview: "Israel Iran tensions spike short post",
        evidenceValue: "https://weibo.com/123/abc",
        externalId: "abc",
        publishedAt: Date.now(),
      },
      process.env,
    );

    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      env: process.env,
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "digest:run-scout:agent:scout:main",
      founderOrigin: "scout",
      agentId: "scout",
      lineageId: "scout",
      sessionKey: "agent:scout:main",
      action: "assist",
      climateKind: "search",
      workType: "intelligence",
      task: "Track hotspot signals",
      status: "completed",
      source: "run_completion",
      ts: new Date("2026-03-31T08:30:00Z").getTime(),
      updatedAt: new Date("2026-03-31T08:30:00Z").getTime(),
      resultPreview: "Signal: Israel Iran tensions spike https://example.com/hot",
      effectType: "opportunity",
      effectEvidence: "https://example.com/hot",
      usedSkillName: "opencli.36kr/news",
      hotspotTitle: "Israel Iran tensions spike",
      hotspotUrl: "https://example.com/hot",
    });

    ensureGenesisExternalExecutionEntriesSync({
      ts: new Date("2026-03-31T09:00:00Z").getTime(),
      intentSummary: {
        recentKeywords: ["israel", "iran", "weibo", "headline"],
        strongestTopicCluster: "research_signal",
        dominantHistoryKind: "search",
      } as never,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "weibo" &&
          entry.workType === "external_publish" &&
          entry.hotspotTitle === "Israel Iran tensions spike",
      ),
    ).toBe(false);
  });

  it("does not let an older external publish task consume a newer completed preview from a different hotspot", () => {
    appendGenesisProactiveWorkEntrySync({
      workId: "account:2026-04-01T08:creator:weibo:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: "weibo-old",
      accountLabel: "weibo-old",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo:weibo-old to publish about hotspot A https://example.com/hot-a",
      status: "in_progress",
      source: "workflow_dispatch",
      ts: 10_000,
      updatedAt: 10_000,
      hotspotTitle: "Hotspot A",
      hotspotUrl: "https://example.com/hot-a",
      trafficFingerprint: "weibo:hotspot-a",
    });
    appendGenesisProactiveWorkEntrySync({
      workId: "account:2026-04-01T12:creator:weibo:publish",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      accountRecordId: "weibo-new",
      accountLabel: "weibo-new",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo:weibo-new to publish about hotspot B https://example.com/hot-b",
      status: "completed",
      source: "run_completion",
      ts: 12_000,
      updatedAt: 12_000,
      hotspotTitle: "Hotspot B",
      hotspotUrl: "https://example.com/hot-b",
      trafficFingerprint: "weibo:hotspot-b",
      resultPreview: "Published using skill weibo.publish at https://weibo.com/123/Qabc post_id=Qabc",
      externalCapability: "publish",
      externalStatus: "executed",
      externalEvidenceType: "post_id",
      externalEvidenceValue: "https://weibo.com/123/Qabc",
      externalId: "Qabc",
    });

    syncGenesisProactiveWorkOutcomesSync({
      ts: 13_000,
      env: process.env,
    });

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:2026-04-01T08:creator:weibo:publish" &&
          entry.status === "completed",
      ),
    ).toBe(false);
  });
});

