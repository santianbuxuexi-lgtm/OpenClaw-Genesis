import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginGenesisPlatformLoginBootstrapSync,
  completeGenesisPlatformLoginBootstrapSync,
  prepareGenesisLoginStateStoragePath,
  readGenesisLoginStatePoolSummarySync,
} from "./login-state-pool.js";
import { appendGenesisDailyTrafficLogEntrySync } from "./daily-traffic-log.js";
import {
  appendGenesisProactiveWorkEntrySync,
  readGenesisProactiveWorkSummarySync,
} from "./proactive-work.js";
import {
  buildPublishContent,
  resolveToutiaoDeclarationPreferencesForContent,
  runGenesisExternalExecutionCycle,
} from "./external-executor.js";

let stateDir: string;

describe("external executor", () => {
  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-external-exec-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  it("completes an external publish entry and releases the account", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-main",
      env: process.env,
    });
    const storageStatePath = prepareGenesisLoginStateStoragePath({
      platform: "weibo",
      recordId: pending.recordId,
      env: process.env,
    });
    await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
    await fs.writeFile(storageStatePath, JSON.stringify({ cookies: [{ name: "sid" }], origins: [] }));
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-main",
      storageStatePath,
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:2026-03-29:creator",
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
        task: "Use weibo:weibo-main to draft and publish outward-facing content",
        status: "in_progress",
        source: "workflow_dispatch",
        ts: 1000,
        updatedAt: 1000,
      },
      process.env,
    );

    const result = await runGenesisExternalExecutionCycle({
      env: process.env,
      runner: async () => ({
        summary: "Published using skill weibo.publish at https://weibo.example/post/1",
        capability: "publish",
        status: "executed",
        evidenceType: "url",
        evidenceValue: "https://weibo.example/post/1",
        contentPreview: "热点越热，越要提防情绪先跑到基本面前面。",
        url: "https://weibo.example/post/1",
      }),
    });

    expect(result.attempted).toBe(1);
    expect(result.completed).toBe(1);
    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.platform === "weibo" &&
          entry.status === "completed" &&
          (entry.effectEvidence ?? "").includes("https://weibo.example/post/1") &&
          entry.externalCapability === "publish" &&
          entry.externalStatus === "executed" &&
          entry.externalEvidenceType === "url" &&
          entry.externalEvidenceValue === "https://weibo.example/post/1",
      ),
    ).toBe(true);

    const accounts = readGenesisLoginStatePoolSummarySync(process.env);
    expect(accounts.readyAccountCount).toBe(1);
    expect(accounts.busyAccountCount).toBe(0);
  });

  it("picks up planned external work and promotes it to in_progress before completion", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-planned",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-planned",
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:2026-03-31T10:creator:weibo:publish",
        founderOrigin: "creator",
        agentId: "creator",
        lineageId: "creator",
        sessionKey: "agent:creator:main",
        platform: "weibo",
        accountRecordId: pending.recordId,
        accountLabel: "weibo-planned",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use weibo:weibo-planned to publish a concise outward-facing update about a hotspot",
        status: "planned",
        source: "workflow_dispatch",
        ts: 1000,
        updatedAt: 1000,
      },
      process.env,
    );

    const seenStatuses: string[] = [];
    const result = await runGenesisExternalExecutionCycle({
      env: process.env,
      runner: async ({ entry }) => {
        seenStatuses.push(entry.status);
        return {
          summary: "Published using skill weibo.publish at https://weibo.example/post/planned",
          capability: "publish",
          status: "executed",
          evidenceType: "url",
          evidenceValue: "https://weibo.example/post/planned",
          url: "https://weibo.example/post/planned",
        };
      },
    });

    expect(result.attempted).toBe(1);
    expect(result.completed).toBe(1);
    expect(seenStatuses).toEqual(["in_progress"]);
    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:2026-03-31T10:creator:weibo:publish" &&
          entry.status === "completed" &&
          entry.externalEvidenceValue === "https://weibo.example/post/planned",
      ),
    ).toBe(true);
  });

  it("releases the account with failure evidence when execution fails", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-scout",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-scout",
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:2026-03-29:scout",
        founderOrigin: "scout",
        agentId: "scout",
        lineageId: "scout",
        sessionKey: "agent:scout:main",
        platform: "weibo",
        accountRecordId: pending.recordId,
        accountLabel: "weibo-scout",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_signal",
        task: "Use weibo:weibo-scout to browse live signals",
        status: "in_progress",
        source: "workflow_dispatch",
        ts: 1000,
        updatedAt: 1000,
      },
      process.env,
    );

    const result = await runGenesisExternalExecutionCycle({
      env: process.env,
      runner: async () => {
        throw new Error("browser failed");
      },
    });

    expect(result.attempted).toBe(1);
    expect(result.failed).toBe(1);
    const accounts = readGenesisLoginStatePoolSummarySync(process.env);
    expect(accounts.readyAccountCount).toBe(1);
    expect(accounts.busyAccountCount).toBe(0);
    expect(accounts.recentAccounts[0]?.lastOutcome).toContain("external_exec_failed");
  });

  it("marks the account as relogin_needed when auth is missing", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-auth",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-auth",
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:2026-03-29:creator-auth",
        founderOrigin: "creator",
        agentId: "creator",
        lineageId: "creator",
        sessionKey: "agent:creator:main",
        platform: "weibo",
        accountRecordId: pending.recordId,
        accountLabel: "weibo-auth",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use weibo:weibo-auth to publish content",
        status: "in_progress",
        source: "workflow_dispatch",
        ts: 1000,
        updatedAt: 1000,
      },
      process.env,
    );

    await runGenesisExternalExecutionCycle({
      env: process.env,
      runner: async () => {
        throw new Error("auth_required:https://weibo.com/newlogin");
      },
    });

    const accounts = readGenesisLoginStatePoolSummarySync(process.env);
    expect(accounts.reloginNeededCount).toBe(1);
    expect(accounts.recentAccounts[0]?.status).toBe("relogin_needed");
  });

  it("prefers network sourcing for geopolitical micro-headline content", () => {
    const labels = resolveToutiaoDeclarationPreferencesForContent(
      "以色列伊朗美国局势持续升级，公开资料显示多方仍在博弈。",
    );
    expect(labels[0]).toBe("取材网络");
    expect(labels).toContain("个人观点，仅供参考");
  });

  it("prefers AI declaration when content mentions AI generation", () => {
    const labels = resolveToutiaoDeclarationPreferencesForContent(
      "这是一段由AI生成并整理的短内容草稿。",
    );
    expect(labels[0]).toBe("引用AI");
  });

  it("builds commentary-style hotspot publish content under 500 chars", () => {
    const content = buildPublishContent({
      workId: "account:creator:weibo:commentary",
      founderOrigin: "creator",
      agentId: "creator",
      lineageId: "creator",
      sessionKey: "agent:creator:main",
      platform: "weibo",
      action: "assist",
      climateKind: "external-execution",
      workType: "external_publish",
      task: "Use weibo:weibo-main to publish a concise outward-facing update about Israel Iran tensions spike https://example.com/hot | shape this hotspot into a <=500-char image-backed weibo commentary post about weibo,toutiao,iran,israel",
      status: "planned",
      source: "workflow_dispatch",
      ts: 1000,
      updatedAt: 1000,
      hotspotTitle: "Israel Iran tensions spike",
      hotspotUrl: "https://example.com/hot",
      driverKeywords: ["weibo", "toutiao", "iran", "israel"],
    } as never);

    expect(content.length).toBeLessThanOrEqual(500);
    expect(content).toContain("Israel Iran tensions spike");
    expect(content).not.toContain("https://example.com/hot");
    expect(content).toMatch(/值得|评论|有价值|镜子/);
    expect(content).not.toMatch(/recovery|reusable|automation|workflow|openclaw/i);
  });
  it("prioritizes creator hotspot publish work ahead of lower-priority external tasks", async () => {
    const creatorPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-creator",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: creatorPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-creator",
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });
    const scoutPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-scout",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: scoutPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-scout",
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:scout:toutiao:browse",
        founderOrigin: "scout",
        agentId: "scout",
        lineageId: "scout",
        sessionKey: "agent:scout:main",
        platform: "toutiao",
        accountRecordId: scoutPending.recordId,
        accountLabel: "toutiao-scout",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_signal",
        task: "Use toutiao:toutiao-scout to gather live signals",
        status: "in_progress",
        source: "workflow_dispatch",
        ts: 1000,
        updatedAt: 1000,
        driverKind: "history",
        driverHistoryKind: "search",
      },
      process.env,
    );
    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:creator:toutiao:publish",
        founderOrigin: "creator",
        agentId: "creator",
        lineageId: "creator",
        sessionKey: "agent:creator:main",
        platform: "toutiao",
        accountRecordId: creatorPending.recordId,
        accountLabel: "toutiao-creator",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use toutiao:toutiao-creator to publish a concise outward-facing update about hotspot https://example.com/hot | shape this hotspot into a ~88-char micro-headline",
        status: "in_progress",
        source: "workflow_dispatch",
        ts: 2000,
        updatedAt: 2000,
        driverKind: "history",
        driverHistoryKind: "search",
        driverKeywords: ["iran", "israel", "toutiao"],
      },
      process.env,
    );

    const seen: string[] = [];
    await runGenesisExternalExecutionCycle({
      env: process.env,
      maxEntries: 1,
      runner: async ({ entry }) => {
        seen.push(entry.workId);
        return {
          summary: `executed ${entry.workId}`,
          capability: entry.workType === "external_publish" ? "publish" : "browse",
          status: "executed",
          evidenceType: "url",
          evidenceValue: `https://example.com/${encodeURIComponent(entry.workId)}`,
        };
      },
    });

    expect(seen[0]).toBe("account:creator:toutiao:publish");
  });

  it("rebinds creator publish work from browser_scan to a steadier popup account before execution", async () => {
    const scanPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-scan",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: scanPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-scan",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      source: "browser_popup",
      env: process.env,
    });
    const poolPath = path.join(stateDir, "genesis", "login-state-pool.json");
    const pool = JSON.parse(await fs.readFile(poolPath, "utf-8")) as {
      records: Array<Record<string, unknown>>;
      updatedAt: number;
    };
    pool.records = pool.records.map((record) =>
      record.recordId === scanPending.recordId ? { ...record, source: "browser_scan" } : record,
    );
    await fs.writeFile(poolPath, `${JSON.stringify(pool, null, 2)}\n`);
    const popupPending = beginGenesisPlatformLoginBootstrapSync({
      platform: "toutiao",
      accountLabel: "toutiao-popup",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: popupPending.recordId,
      platform: "toutiao",
      accountLabel: "toutiao-popup",
      cookieCount: 1,
      originCount: 1,
      status: "ready",
      source: "browser_popup",
      env: process.env,
    });

    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:creator:toutiao:scanpublish",
        founderOrigin: "creator",
        agentId: "creator",
        lineageId: "creator",
        sessionKey: "agent:creator:main",
        platform: "toutiao",
        accountRecordId: scanPending.recordId,
        accountLabel: "toutiao-scan",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use toutiao:toutiao-scan to publish a concise outward-facing update about hotspot https://example.com/hot | shape this hotspot into a ~88-char micro-headline",
        status: "in_progress",
        source: "workflow_dispatch",
        ts: 3000,
        updatedAt: 3000,
        driverKind: "history",
        driverHistoryKind: "search",
      },
      process.env,
    );

    let usedRecordId = "";
    await runGenesisExternalExecutionCycle({
      env: process.env,
      maxEntries: 1,
      runner: async ({ account }) => {
        usedRecordId = account.recordId;
        return {
          summary: "published",
          capability: "publish",
          status: "executed",
          evidenceType: "url",
          evidenceValue: "https://example.com/post/1",
        };
      },
    });

    expect(usedRecordId).toBe(popupPending.recordId);
    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:creator:toutiao:scanpublish" &&
          entry.status === "completed" &&
          entry.accountRecordId === popupPending.recordId,
      ),
    ).toBe(true);
  });

  it("skips duplicate publish work before execution when the same traffic fingerprint already exists", async () => {
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "weibo-dedupe",
      env: process.env,
    });
    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "weibo-dedupe",
      cookieCount: 1,
      originCount: 1,
      status: "busy",
      env: process.env,
    });
    appendGenesisDailyTrafficLogEntrySync(
      {
        logId: "published:weibo:dedupe",
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
    appendGenesisProactiveWorkEntrySync(
      {
        workId: "account:creator:weibo:dedupe",
        founderOrigin: "creator",
        agentId: "creator",
        lineageId: "creator",
        sessionKey: "agent:creator:main",
        platform: "weibo",
        accountRecordId: pending.recordId,
        accountLabel: "weibo-dedupe",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use weibo:weibo-dedupe to publish a concise outward-facing update about hotspot https://example.com/hot | shape this hotspot into a ~88-char weibo short post",
        status: "planned",
        source: "workflow_dispatch",
        ts: 1000,
        updatedAt: 1000,
        driverKind: "hotspot",
        hotspotTitle: "Israel Iran tensions spike",
        hotspotUrl: "https://example.com/hot",
        trafficFingerprint: "weibo:israel iran tensions spike",
      },
      process.env,
    );

    const runner = vi.fn(async () => ({
      summary: "should not run",
      capability: "publish" as const,
      status: "executed" as const,
      evidenceType: "url" as const,
      evidenceValue: "https://weibo.example/post/dupe",
    }));

    const result = await runGenesisExternalExecutionCycle({
      env: process.env,
      maxEntries: 1,
      runner,
    });

    expect(result.attempted).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
    expect(runner).not.toHaveBeenCalled();

    const summary = readGenesisProactiveWorkSummarySync(process.env);
    expect(
      summary.recentEntries.some(
        (entry) =>
          entry.workId === "account:creator:weibo:dedupe" &&
          entry.status === "completed" &&
          entry.externalStatus === "pending" &&
          entry.externalEvidenceValue === "duplicate_fingerprint:weibo:israel iran tensions spike",
      ),
    ).toBe(true);
  });
});
