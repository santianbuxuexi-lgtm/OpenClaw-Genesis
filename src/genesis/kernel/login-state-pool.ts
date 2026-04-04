import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readJsonFileSync,
  resolveGenesisLoginStatePoolPath,
  resolveGenesisLoginStateStorageDir,
  type GenesisLoginStatePoolSummary,
  type GenesisPlatformAccountRecord,
  type GenesisPlatformCapability,
  type GenesisPlatformAccountStatus,
  type GenesisPlatformAuthMode,
} from "./state.js";

const GENESIS_ACCOUNT_BUSY_STALE_MS = 90 * 60 * 1000;

export type GenesisBrowserKind = "chrome" | "msedge";

export type GenesisBrowserProfileCandidate = {
  browserKind: GenesisBrowserKind;
  userDataDir: string;
  profileName: string;
  profileDirPath: string;
  displayName: string;
};

const PLATFORM_PRESETS: Record<
  string,
  { loginUrl: string; capabilities: GenesisPlatformCapability[] }
> = {
  weibo: {
    loginUrl: "https://weibo.com/login.php",
    capabilities: ["publish", "browse", "comment"],
  },
  douyin: {
    loginUrl: "https://www.douyin.com/",
    capabilities: ["publish", "browse", "comment"],
  },
  tiktok: {
    loginUrl: "https://www.tiktok.com/login",
    capabilities: ["publish", "browse", "comment"],
  },
  toutiao: {
    loginUrl: "https://www.toutiao.com/",
    capabilities: ["publish", "browse", "comment"],
  },
  x: {
    loginUrl: "https://x.com/i/flow/login",
    capabilities: ["publish", "browse", "comment", "message"],
  },
  github: {
    loginUrl: "https://github.com/login",
    capabilities: ["publish", "browse", "comment", "submit_report"],
  },
  telegram: {
    loginUrl: "https://web.telegram.org/",
    capabilities: ["publish", "browse", "message"],
  },
  bugcrowd: {
    loginUrl: "https://bugcrowd.com/user/sign_in",
    capabilities: ["browse", "claim_bounty", "submit_report"],
  },
  hackerone: {
    loginUrl: "https://hackerone.com/users/sign_in",
    capabilities: ["browse", "claim_bounty", "submit_report"],
  },
};

type GenesisLoginStatePool = {
  records: GenesisPlatformAccountRecord[];
  updatedAt: number;
};

const DEFAULT_POOL: GenesisLoginStatePool = {
  records: [],
  updatedAt: 0,
};

const BROWSER_USER_DATA_DIRS: Record<GenesisBrowserKind, string[]> = {
  chrome: [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Google", "Chrome", "User Data"),
  ],
  msedge: [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Microsoft", "Edge", "User Data"),
  ],
};

function normalizePlatform(platform: string): string {
  return platform.trim().toLowerCase();
}

function normalizeBrowserKind(browserKind: string): GenesisBrowserKind | null {
  if (browserKind === "chrome" || browserKind === "msedge") {
    return browserKind;
  }
  return null;
}

function readGenesisLoginStatePoolSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisLoginStatePool {
  return (
    readJsonFileSync<GenesisLoginStatePool>(resolveGenesisLoginStatePoolPath(env)) ?? {
      ...DEFAULT_POOL,
    }
  );
}

export function readGenesisPlatformAccountRecordSync(params: {
  recordId: string;
  env?: NodeJS.ProcessEnv;
}): GenesisPlatformAccountRecord | null {
  const env = params.env ?? process.env;
  const pool = readGenesisLoginStatePoolSync(env);
  return pool.records.find((entry) => entry.recordId === params.recordId) ?? null;
}

function writeGenesisLoginStatePoolSync(
  pool: GenesisLoginStatePool,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisLoginStatePoolPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(pool, null, 2)}\n`, "utf-8");
}

export function resolveGenesisPlatformPreset(platform: string): {
  platform: string;
  loginUrl: string;
  capabilities: GenesisPlatformCapability[];
} {
  const normalized = normalizePlatform(platform);
  const preset = PLATFORM_PRESETS[normalized];
  return {
    platform: normalized,
    loginUrl: preset?.loginUrl ?? `https://${normalized}.com/`,
    capabilities: preset?.capabilities ?? ["browse"],
  };
}

function resolveGenesisLoginProfileDirPath(params: {
  platform: string;
  recordId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  const platform = normalizePlatform(params.platform);
  return path.join(resolveGenesisLoginStateStorageDir(env), platform, encodeURIComponent(params.recordId));
}

function resolveGenesisScannedProfileRootDirPath(params: {
  platform: string;
  browserKind: GenesisBrowserKind;
  profileName: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  return path.join(
    resolveGenesisLoginStateStorageDir(env),
    params.platform,
    "browser-scan",
    `${params.browserKind}-${encodeURIComponent(params.profileName)}`,
  );
}

function safeReadJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function resolveAccountPriorityScore(record: GenesisPlatformAccountRecord): number {
  let score = 0;
  if (record.status === "busy") {
    score += 5000;
  } else if (record.status === "ready") {
    score += 4000;
  } else if (record.status === "relogin_needed" || record.status === "expired") {
    score += 2000;
  } else if (record.status === "pending") {
    score += 1000;
  }
  if (record.source === "browser_scan") {
    score += 600;
  } else if (record.source === "browser_popup") {
    score += 300;
  }
  if (record.authMode === "profile_dir") {
    score += 120;
  }
  if (record.lastVerifiedAt) {
    score += Math.min(100, Math.floor(record.lastVerifiedAt / 1_000_000_000_000));
  }
  return score;
}

function compareGenesisAccountPriority(
  left: GenesisPlatformAccountRecord,
  right: GenesisPlatformAccountRecord,
): number {
  return (
    resolveAccountPriorityScore(right) - resolveAccountPriorityScore(left) ||
    (right.lastVerifiedAt ?? 0) - (left.lastVerifiedAt ?? 0) ||
    (right.updatedAt ?? 0) - (left.updatedAt ?? 0) ||
    (right.createdAt ?? 0) - (left.createdAt ?? 0) ||
    left.recordId.localeCompare(right.recordId)
  );
}

function buildGenesisAccountVisibilityKey(record: GenesisPlatformAccountRecord): string {
  if (record.source === "browser_scan") {
    return [
      record.platform,
      record.source,
      record.browserKind ?? "browser",
      record.browserProfileName ?? record.profileDirectoryName ?? record.accountLabel ?? record.recordId,
    ].join("|");
  }
  return [
    record.platform,
    record.source,
    record.accountId ?? record.accountLabel ?? record.recordId,
  ].join("|");
}

function selectVisibleGenesisPlatformAccounts(records: GenesisPlatformAccountRecord[]): GenesisPlatformAccountRecord[] {
  const sorted = [...records].sort(compareGenesisAccountPriority);
  const visible = new Map<string, GenesisPlatformAccountRecord>();
  for (const record of sorted) {
    const key = buildGenesisAccountVisibilityKey(record);
    if (!visible.has(key)) {
      visible.set(key, record);
    }
  }
  return [...visible.values()].sort(compareGenesisAccountPriority);
}

export function discoverGenesisBrowserProfilesSync(params?: {
  browsers?: GenesisBrowserKind[];
  userDataDirs?: Partial<Record<GenesisBrowserKind, string[]>>;
}): GenesisBrowserProfileCandidate[] {
  const requestedBrowsers = params?.browsers?.length ? params.browsers : (["chrome", "msedge"] as GenesisBrowserKind[]);
  const candidates: GenesisBrowserProfileCandidate[] = [];
  for (const browserKind of requestedBrowsers) {
    const roots = params?.userDataDirs?.[browserKind] ?? BROWSER_USER_DATA_DIRS[browserKind] ?? [];
    for (const userDataDir of roots) {
      if (!fs.existsSync(userDataDir)) {
        continue;
      }
      const localState = safeReadJsonFile<{ profile?: { info_cache?: Record<string, { name?: string }> } }>(
        path.join(userDataDir, "Local State"),
      );
      const infoCache = localState?.profile?.info_cache ?? {};
      const profileNames = new Set<string>(
        fs
          .readdirSync(userDataDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && (entry.name === "Default" || /^Profile\s+\d+$/i.test(entry.name)))
          .map((entry) => entry.name),
      );
      for (const profileName of profileNames) {
        const profileDirPath = path.join(userDataDir, profileName);
        const displayName = infoCache[profileName]?.name?.trim() || profileName;
        candidates.push({
          browserKind,
          userDataDir,
          profileName,
          profileDirPath,
          displayName,
        });
      }
    }
  }
  return candidates.sort(
    (left, right) =>
      left.browserKind.localeCompare(right.browserKind) ||
      left.displayName.localeCompare(right.displayName) ||
      left.profileName.localeCompare(right.profileName),
  );
}

function copyDirSync(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(sourcePath, targetPath);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
  }
}

export function importGenesisBrowserProfileForPlatformSync(params: {
  platform: string;
  browserKind: GenesisBrowserKind;
  userDataDir: string;
  profileName: string;
  accountLabel?: string;
  status?: GenesisPlatformAccountStatus;
  env?: NodeJS.ProcessEnv;
}): GenesisPlatformAccountRecord {
  const env = params.env ?? process.env;
  const preset = resolveGenesisPlatformPreset(params.platform);
  const ts = Date.now();
  const pool = readGenesisLoginStatePoolSync(env);
  const existing =
    pool.records.find(
      (entry) =>
        entry.source === "browser_scan" &&
        entry.platform === preset.platform &&
        entry.browserKind === params.browserKind &&
        entry.browserProfileName === params.profileName,
    ) ?? null;
  const recordId = existing?.recordId ?? `${preset.platform}:scan:${params.browserKind}:${params.profileName}:${ts}`;
  const rootDir = resolveGenesisScannedProfileRootDirPath({
    platform: preset.platform,
    browserKind: params.browserKind,
    profileName: params.profileName,
    env,
  });
  fs.mkdirSync(rootDir, { recursive: true });
  const localStateSource = path.join(params.userDataDir, "Local State");
  const localStateTarget = path.join(rootDir, "Local State");
  if (fs.existsSync(localStateSource) && !fs.existsSync(localStateTarget)) {
    fs.copyFileSync(localStateSource, localStateTarget);
  }
  const sourceProfileDir = path.join(params.userDataDir, params.profileName);
  const targetProfileDir = path.join(rootDir, params.profileName);
  if (!fs.existsSync(targetProfileDir)) {
    copyDirSync(sourceProfileDir, targetProfileDir);
  }
  const record: GenesisPlatformAccountRecord = {
    ...existing,
    recordId,
    platform: preset.platform,
    accountLabel: params.accountLabel?.trim() || `${params.browserKind}:${params.profileName}`,
    browserKind: params.browserKind,
    browserProfileName: params.profileName,
    loginUrl: preset.loginUrl,
    status: params.status ?? "ready",
    authMode: "profile_dir",
    profileDirPath: rootDir,
    profileDirectoryName: params.profileName,
    capabilities: preset.capabilities,
    source: "browser_scan",
    lastOutcome: existing?.lastOutcome ?? `browser_scan_imported:${params.browserKind}:${params.profileName}`,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
  };
  pool.records = [record, ...pool.records.filter((entry) => entry.recordId !== recordId)];
  pool.updatedAt = ts;
  writeGenesisLoginStatePoolSync(pool, env);
  return record;
}

function detectGenesisLoginProfileArtifacts(record: GenesisPlatformAccountRecord): {
  profileDirPath: string;
  hasProfileDir: boolean;
  hasCookiesDb: boolean;
  hasSessionArtifacts: boolean;
} {
  const profileDirPath =
    record.profileDirPath || resolveGenesisLoginProfileDirPath({ platform: record.platform, recordId: record.recordId });
  const cookiesDbPath = path.join(profileDirPath, "Default", "Network", "Cookies");
  const sessionPath = path.join(profileDirPath, "Default", "Sessions");
  const hasProfileDir = fs.existsSync(profileDirPath);
  const hasCookiesDb = fs.existsSync(cookiesDbPath);
  const hasSessionArtifacts = fs.existsSync(sessionPath);
  return {
    profileDirPath,
    hasProfileDir,
    hasCookiesDb,
    hasSessionArtifacts,
  };
}

export function beginGenesisPlatformLoginBootstrapSync(params: {
  platform: string;
  accountLabel?: string;
  loginUrl?: string;
  capabilities?: GenesisPlatformCapability[];
  source?: "manual_bootstrap" | "browser_popup";
  ts?: number;
  env?: NodeJS.ProcessEnv;
}): GenesisPlatformAccountRecord {
  const env = params.env ?? process.env;
  const ts = params.ts ?? Date.now();
  const preset = resolveGenesisPlatformPreset(params.platform);
  const pool = readGenesisLoginStatePoolSync(env);
  const recordId = `${preset.platform}:${ts}`;
  const record: GenesisPlatformAccountRecord = {
    recordId,
    platform: preset.platform,
    accountLabel: params.accountLabel?.trim() || `${preset.platform}:${new Date(ts).toISOString()}`,
    loginUrl: params.loginUrl?.trim() || preset.loginUrl,
    status: "pending",
    authMode: "storage_state",
    profileDirPath: resolveGenesisLoginProfileDirPath({
      platform: preset.platform,
      recordId,
      env,
    }),
    capabilities: params.capabilities?.length ? params.capabilities : preset.capabilities,
    source: params.source ?? "browser_popup",
    createdAt: ts,
    updatedAt: ts,
  };
  pool.records = [record, ...pool.records.filter((entry) => entry.recordId !== recordId)];
  pool.updatedAt = ts;
  writeGenesisLoginStatePoolSync(pool, env);
  return record;
}

export function completeGenesisPlatformLoginBootstrapSync(params: {
  recordId: string;
  platform: string;
  loginUrl?: string;
  accountId?: string;
  accountLabel?: string;
  authMode?: GenesisPlatformAuthMode;
  capabilities?: GenesisPlatformCapability[];
  storageStatePath?: string;
  cookieCount?: number;
  originCount?: number;
  lastOutcome?: string;
  status?: GenesisPlatformAccountStatus;
  ts?: number;
  env?: NodeJS.ProcessEnv;
}): GenesisPlatformAccountRecord {
  const env = params.env ?? process.env;
  const ts = params.ts ?? Date.now();
  const preset = resolveGenesisPlatformPreset(params.platform);
  const pool = readGenesisLoginStatePoolSync(env);
  const previous =
    pool.records.find((entry) => entry.recordId === params.recordId) ??
    beginGenesisPlatformLoginBootstrapSync({
      platform: params.platform,
      loginUrl: params.loginUrl,
      accountLabel: params.accountLabel,
      capabilities: params.capabilities,
      ts,
      env,
    });
  const status =
    params.status ??
    ((params.cookieCount ?? 0) > 0 || (params.originCount ?? 0) > 0 ? "ready" : "relogin_needed");
  const record: GenesisPlatformAccountRecord = {
    ...previous,
    platform: preset.platform,
    loginUrl: params.loginUrl?.trim() || previous.loginUrl || preset.loginUrl,
    accountId: params.accountId?.trim() || previous.accountId,
    accountLabel: params.accountLabel?.trim() || previous.accountLabel,
    authMode: params.authMode ?? previous.authMode ?? "storage_state",
    storageStatePath: params.storageStatePath ?? previous.storageStatePath,
    profileDirPath: previous.profileDirPath ?? resolveGenesisLoginProfileDirPath({
      platform: preset.platform,
      recordId: previous.recordId,
      env,
    }),
    cookieCount: params.cookieCount ?? previous.cookieCount,
    originCount: params.originCount ?? previous.originCount,
    capabilities: params.capabilities?.length ? params.capabilities : previous.capabilities,
    lastOutcome: params.lastOutcome?.trim() || previous.lastOutcome,
    status,
    lastVerifiedAt: ts,
    updatedAt: ts,
  };
  pool.records = [record, ...pool.records.filter((entry) => entry.recordId !== record.recordId)];
  pool.updatedAt = ts;
  writeGenesisLoginStatePoolSync(pool, env);
  return record;
}

export function reconcileGenesisLoginStatePoolSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisLoginStatePoolSummary {
  const pool = readGenesisLoginStatePoolSync(env);
  let changed = false;
  pool.records = pool.records.map((record) => {
    if (
      record.status === "busy" &&
      (record.lastUsedAt ?? 0) > 0 &&
      Date.now() - (record.lastUsedAt ?? 0) >= GENESIS_ACCOUNT_BUSY_STALE_MS
    ) {
      changed = true;
      return {
        ...record,
        status: "ready",
        currentTask: undefined,
        updatedAt: Date.now(),
        lastOutcome: record.lastOutcome?.trim() || "stale_busy_released",
      };
    }
    if (record.status !== "pending" && record.status !== "relogin_needed") {
      return record;
    }
    const artifacts = detectGenesisLoginProfileArtifacts(record);
    if (!artifacts.hasProfileDir || (!artifacts.hasCookiesDb && !artifacts.hasSessionArtifacts)) {
      return {
        ...record,
        profileDirPath: artifacts.profileDirPath,
      };
    }
    changed = true;
    return {
      ...record,
      authMode: "profile_dir",
      profileDirPath: artifacts.profileDirPath,
      status: "ready",
      lastVerifiedAt: Date.now(),
      updatedAt: Date.now(),
      lastOutcome: record.lastOutcome?.trim() || `profile_ready:${path.basename(artifacts.profileDirPath)}`,
    };
  });
  if (changed) {
    pool.updatedAt = Date.now();
    writeGenesisLoginStatePoolSync(pool, env);
  }
  return readGenesisLoginStatePoolSummarySync(env);
}

export function acquireGenesisPlatformAccountSync(params: {
  capability: GenesisPlatformCapability;
  platform?: string;
  requestedBy: string;
  currentTask?: string;
  env?: NodeJS.ProcessEnv;
}): GenesisPlatformAccountRecord | null {
  const env = params.env ?? process.env;
  reconcileGenesisLoginStatePoolSync(env);
  const pool = readGenesisLoginStatePoolSync(env);
  const platform = params.platform ? normalizePlatform(params.platform) : undefined;
  const scoreForAcquire = (record: GenesisPlatformAccountRecord): number => {
    let score = resolveAccountPriorityScore(record);
    if (params.capability === "publish") {
      if (record.source === "browser_popup" || record.source === "manual_bootstrap") {
        score += 500;
      }
      if (record.source === "browser_scan") {
        score -= 250;
      }
    } else if (params.capability === "browse" && record.source === "browser_scan") {
      score += 150;
    }
    return score;
  };
  const nextRecord =
    [...pool.records]
      .filter(
        (record) =>
          record.status === "ready" &&
          (!platform || record.platform === platform) &&
          record.capabilities.includes(params.capability),
      )
      .sort(
        (left, right) =>
          scoreForAcquire(right) - scoreForAcquire(left) ||
          compareGenesisAccountPriority(left, right),
      )[0] ?? null;
  if (!nextRecord) {
    return null;
  }
  const updatedRecord: GenesisPlatformAccountRecord = {
    ...nextRecord,
    status: "busy",
    lastUsedBy: params.requestedBy,
    lastUsedAt: Date.now(),
    currentTask: params.currentTask?.trim() || nextRecord.currentTask,
    updatedAt: Date.now(),
  };
  pool.records = [updatedRecord, ...pool.records.filter((record) => record.recordId !== nextRecord.recordId)];
  pool.updatedAt = Date.now();
  writeGenesisLoginStatePoolSync(pool, env);
  return updatedRecord;
}

export function releaseGenesisPlatformAccountSync(params: {
  recordId: string;
  lastOutcome?: string;
  status?: GenesisPlatformAccountStatus;
  env?: NodeJS.ProcessEnv;
}): GenesisPlatformAccountRecord | null {
  const env = params.env ?? process.env;
  const pool = readGenesisLoginStatePoolSync(env);
  const previous = pool.records.find((record) => record.recordId === params.recordId);
  if (!previous) {
    return null;
  }
  const nextRecord: GenesisPlatformAccountRecord = {
    ...previous,
    status: params.status ?? "ready",
    currentTask: undefined,
    updatedAt: Date.now(),
    lastOutcome: params.lastOutcome?.trim() || previous.lastOutcome,
  };
  pool.records = [nextRecord, ...pool.records.filter((record) => record.recordId !== params.recordId)];
  pool.updatedAt = Date.now();
  writeGenesisLoginStatePoolSync(pool, env);
  return nextRecord;
}

export function readGenesisLoginStatePoolSummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisLoginStatePoolSummary {
  const pool = readGenesisLoginStatePoolSync(env);
  const visibleRecords = selectVisibleGenesisPlatformAccounts(pool.records);
  const platformStats = new Map<
    string,
    {
      readyCount: number;
      pendingCount: number;
      reloginNeededCount: number;
      blockedCount: number;
      capabilityCount: number;
    }
  >();
  for (const record of pool.records) {
    const stats = platformStats.get(record.platform) ?? {
      readyCount: 0,
      pendingCount: 0,
      reloginNeededCount: 0,
      blockedCount: 0,
      capabilityCount: 0,
    };
    if (record.status === "ready") {
      stats.readyCount += 1;
    } else if (record.status === "busy") {
      stats.readyCount += 1;
    } else if (record.status === "pending") {
      stats.pendingCount += 1;
    } else if (record.status === "relogin_needed" || record.status === "expired") {
      stats.reloginNeededCount += 1;
    } else if (record.status === "blocked") {
      stats.blockedCount += 1;
    }
    stats.capabilityCount += record.capabilities.length;
    platformStats.set(record.platform, stats);
  }
  const platformLeaders = [...platformStats.entries()]
    .map(([platform, stats]) => ({ platform, ...stats }))
    .sort(
      (left, right) =>
        right.readyCount - left.readyCount ||
        right.capabilityCount - left.capabilityCount ||
        left.platform.localeCompare(right.platform),
    );
  const gapLeaders = [...platformStats.entries()]
    .map(([platform, stats]) => ({ platform, ...stats }))
    .sort(
      (left, right) =>
        right.pendingCount + right.reloginNeededCount - (left.pendingCount + left.reloginNeededCount) ||
        left.platform.localeCompare(right.platform),
    );
  return {
    totalAccountCount: pool.records.length,
    readyAccountCount: pool.records.filter((entry) => entry.status === "ready").length,
    busyAccountCount: pool.records.filter((entry) => entry.status === "busy").length,
    pendingAccountCount: pool.records.filter((entry) => entry.status === "pending").length,
    reloginNeededCount: pool.records.filter(
      (entry) => entry.status === "relogin_needed" || entry.status === "expired",
    ).length,
    blockedAccountCount: pool.records.filter((entry) => entry.status === "blocked").length,
    highestReadyPlatform: platformLeaders[0]?.readyCount ? platformLeaders[0].platform : null,
    highestGapPlatform:
      gapLeaders[0] && gapLeaders[0].pendingCount + gapLeaders[0].reloginNeededCount > 0
        ? gapLeaders[0].platform
        : null,
    recentAccounts: visibleRecords.slice(0, 8),
    platformLeaders,
  };
}

export function prepareGenesisLoginStateStoragePath(params: {
  platform: string;
  recordId: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = params.env ?? process.env;
  const platform = normalizePlatform(params.platform);
  const dir = path.join(resolveGenesisLoginStateStorageDir(env), platform);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${encodeURIComponent(params.recordId)}.json`);
}
