import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireGenesisPlatformAccountSync,
  beginGenesisPlatformLoginBootstrapSync,
  completeGenesisPlatformLoginBootstrapSync,
  discoverGenesisBrowserProfilesSync,
  importGenesisBrowserProfileForPlatformSync,
  prepareGenesisLoginStateStoragePath,
  reconcileGenesisLoginStatePoolSync,
  releaseGenesisPlatformAccountSync,
  readGenesisLoginStatePoolSummarySync,
  resolveGenesisPlatformPreset,
} from "./login-state-pool.js";

let stateDir: string;

describe("login state pool", () => {
  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-login-pool-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  it("creates pending bootstrap records and finalizes ready login state", async () => {
    const preset = resolveGenesisPlatformPreset("weibo");
    const pending = beginGenesisPlatformLoginBootstrapSync({
      platform: "weibo",
      accountLabel: "微博主号",
      env: process.env,
    });
    const storageStatePath = prepareGenesisLoginStateStoragePath({
      platform: "weibo",
      recordId: pending.recordId,
      env: process.env,
    });
    await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
    await fs.writeFile(storageStatePath, JSON.stringify({ cookies: [], origins: [{ origin: "https://weibo.com" }] }));

    completeGenesisPlatformLoginBootstrapSync({
      recordId: pending.recordId,
      platform: "weibo",
      accountLabel: "微博主号",
      loginUrl: preset.loginUrl,
      storageStatePath,
      cookieCount: 2,
      originCount: 1,
      env: process.env,
    });

    const summary = readGenesisLoginStatePoolSummarySync(process.env);
    expect(summary.totalAccountCount).toBe(1);
    expect(summary.readyAccountCount).toBe(1);
    expect(summary.highestReadyPlatform).toBe("weibo");
    expect(summary.recentAccounts[0]?.status).toBe("ready");
    expect(summary.recentAccounts[0]?.storageStatePath).toBe(storageStatePath);
  });

  it("reconciles pending browser profiles into ready accounts and supports acquire/release", async () => {
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

    const reconciled = reconcileGenesisLoginStatePoolSync(process.env);
    expect(reconciled.readyAccountCount).toBe(1);
    expect(reconciled.busyAccountCount).toBe(0);
    expect(reconciled.recentAccounts[0]?.status).toBe("ready");
    expect(reconciled.recentAccounts[0]?.authMode).toBe("profile_dir");

    const acquired = acquireGenesisPlatformAccountSync({
      capability: "publish",
      platform: "weibo",
      requestedBy: "creator",
      currentTask: "creator:publish",
      env: process.env,
    });
    expect(acquired?.status).toBe("busy");
    expect(acquired?.lastUsedBy).toBe("creator");

    const busySummary = readGenesisLoginStatePoolSummarySync(process.env);
    expect(busySummary.busyAccountCount).toBe(1);
    expect(busySummary.recentAccounts[0]?.status).toBe("busy");

    const released = releaseGenesisPlatformAccountSync({
      recordId: acquired!.recordId,
      lastOutcome: "published weibo draft",
      env: process.env,
    });
    expect(released?.status).toBe("ready");
    expect(released?.lastOutcome).toBe("published weibo draft");
  });

  it("resolves the tiktok preset with publish capabilities", () => {
    const preset = resolveGenesisPlatformPreset("tiktok");
    expect(preset.platform).toBe("tiktok");
    expect(preset.loginUrl).toContain("tiktok.com/login");
    expect(preset.capabilities).toContain("publish");
    expect(preset.capabilities).toContain("browse");
  });

  it("discovers browser profiles from a Chrome user data directory", async () => {
    const userDataDir = path.join(stateDir, "Chrome", "User Data");
    await fs.mkdir(path.join(userDataDir, "Default"), { recursive: true });
    await fs.mkdir(path.join(userDataDir, "Profile 2"), { recursive: true });
    await fs.writeFile(
      path.join(userDataDir, "Local State"),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: { name: "主资料" },
            "Profile 2": { name: "工作资料" },
          },
        },
      }),
    );

    const profiles = discoverGenesisBrowserProfilesSync({
      browsers: ["chrome"],
      userDataDirs: { chrome: [userDataDir] },
    });

    expect(profiles).toHaveLength(2);
    expect(profiles[0]?.browserKind).toBe("chrome");
    expect(profiles.some((entry) => entry.displayName === "主资料")).toBe(true);
    expect(profiles.some((entry) => entry.profileName === "Profile 2")).toBe(true);
  });

  it("imports a discovered browser profile into the login pool", async () => {
    const userDataDir = path.join(stateDir, "Chrome", "User Data");
    const profileDir = path.join(userDataDir, "Default");
    await fs.mkdir(path.join(profileDir, "Network"), { recursive: true });
    await fs.writeFile(path.join(profileDir, "Network", "Cookies"), "cookie-db");
    await fs.writeFile(path.join(userDataDir, "Local State"), JSON.stringify({ profile: { info_cache: { Default: { name: "主资料" } } } }));

    const record = importGenesisBrowserProfileForPlatformSync({
      platform: "weibo",
      browserKind: "chrome",
      userDataDir,
      profileName: "Default",
      accountLabel: "chrome:主资料",
      env: process.env,
    });

    const summary = readGenesisLoginStatePoolSummarySync(process.env);
    expect(record.source).toBe("browser_scan");
    expect(record.browserKind).toBe("chrome");
    expect(record.browserProfileName).toBe("Default");
    expect(record.profileDirectoryName).toBe("Default");
    expect(summary.totalAccountCount).toBe(1);
    expect(summary.recentAccounts[0]?.source).toBe("browser_scan");
    expect(summary.recentAccounts[0]?.profileDirPath).toBeTruthy();
  });

  it("prefers ready browser_scan accounts for browse, but popup accounts for publish", async () => {
    const olderPopup = completeGenesisPlatformLoginBootstrapSync({
      recordId: "weibo:popup:older",
      platform: "weibo",
      accountLabel: "popup-weibo",
      authMode: "profile_dir",
      status: "ready",
      capabilities: ["publish", "browse", "comment"],
      cookieCount: 3,
      originCount: 1,
      ts: 1000,
      env: process.env,
    });
    expect(olderPopup.source).toBe("browser_popup");
    const userDataDir = path.join(stateDir, "Chrome", "User Data");
    const sourceProfileDir = path.join(userDataDir, "Default", "Network");
    await fs.mkdir(sourceProfileDir, { recursive: true });
    await fs.writeFile(path.join(sourceProfileDir, "Cookies"), "cookie-db");
    await fs.writeFile(
      path.join(userDataDir, "Local State"),
      JSON.stringify({ profile: { info_cache: { Default: { name: "scan-weibo" } } } }),
    );

    const imported = importGenesisBrowserProfileForPlatformSync({
      platform: "weibo",
      browserKind: "chrome",
      userDataDir,
      profileName: "Default",
      accountLabel: "scan-weibo",
      env: process.env,
    });
    expect(imported.source).toBe("browser_scan");
    completeGenesisPlatformLoginBootstrapSync({
      recordId: imported.recordId,
      platform: "weibo",
      accountLabel: "scan-weibo",
      authMode: "profile_dir",
      status: "ready",
      capabilities: ["publish", "browse", "comment"],
      cookieCount: 5,
      originCount: 2,
      lastOutcome: "browser_scan_ready:https://weibo.com/",
      ts: 3000,
      env: process.env,
    });

    const acquiredBrowse = acquireGenesisPlatformAccountSync({
      capability: "browse",
      platform: "weibo",
      requestedBy: "scout",
      currentTask: "scout:browse",
      env: process.env,
    });

    expect(acquiredBrowse?.source).toBe("browser_scan");
    expect(acquiredBrowse?.accountLabel).toBe("scan-weibo");

    releaseGenesisPlatformAccountSync({
      recordId: acquiredBrowse!.recordId,
      status: "ready",
      env: process.env,
    });

    const acquiredPublish = acquireGenesisPlatformAccountSync({
      capability: "publish",
      platform: "weibo",
      requestedBy: "creator",
      currentTask: "creator:publish",
      env: process.env,
    });

    expect(acquiredPublish?.source).toBe("browser_popup");
    expect(acquiredPublish?.accountLabel).toBe("popup-weibo");
  });

  it("releases stale busy accounts back to ready during reconcile", () => {
    vi.useFakeTimers();
    completeGenesisPlatformLoginBootstrapSync({
      recordId: "toutiao:stale-busy",
      platform: "toutiao",
      accountLabel: "toutiao-stale",
      authMode: "profile_dir",
      status: "ready",
      capabilities: ["publish", "browse", "comment"],
      cookieCount: 3,
      originCount: 1,
      ts: 1_000,
      env: process.env,
    });

    const acquired = acquireGenesisPlatformAccountSync({
      capability: "publish",
      platform: "toutiao",
      requestedBy: "creator",
      currentTask: "creator:publish:stale",
      env: process.env,
    });
    expect(acquired?.status).toBe("busy");

    vi.setSystemTime(new Date(Date.now() + 91 * 60 * 1000));
    const summary = reconcileGenesisLoginStatePoolSync(process.env);

    expect(summary.busyAccountCount).toBe(0);
    expect(summary.readyAccountCount).toBeGreaterThanOrEqual(1);
    expect(summary.recentAccounts[0]?.status).toBe("ready");
    vi.useRealTimers();
  });
});
