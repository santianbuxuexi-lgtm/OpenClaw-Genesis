import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { readJsonFileSync, resolveGenesisLoginStatePoolPath, type GenesisPlatformAccountRecord } from "../src/genesis/kernel/state.js";

type Args = {
  stateDir?: string;
  platforms: string[];
  outputDir: string;
  recordIds: string[];
};

type ExportedRecord = {
  recordId: string;
  platform: string;
  accountId?: string;
  accountLabel?: string;
  loginUrl: string;
  capabilities: string[];
  source: string;
  browserKind?: string;
  browserProfileName?: string;
  authMode: "storage_state";
  storageStateFile: string;
  cookieCount: number;
  originCount: number;
};

type ExportManifest = {
  exportedAt: number;
  sourceStateDir: string;
  records: ExportedRecord[];
};

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
      continue;
    }
    values.set(key, "true");
  }
  const outputDir = values.get("output-dir")?.trim();
  if (!outputDir) {
    throw new Error("Missing --output-dir");
  }
  return {
    stateDir: values.get("state-dir")?.trim(),
    outputDir,
    platforms:
      values
        .get("platforms")
        ?.split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean) ?? [],
    recordIds:
      values
        .get("record-ids")
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? [],
  };
}

function resolveBrowserLaunchOptions(): {
  channel?: "chrome" | "msedge";
  executablePath?: string;
} {
  const systemPaths: Record<"chrome" | "msedge", string[]> = {
    chrome: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    msedge: [
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
  };
  for (const channel of ["chrome", "msedge"] as const) {
    for (const executablePath of systemPaths[channel]) {
      if (fs.existsSync(executablePath)) {
        return { executablePath };
      }
    }
  }
  return { channel: "chrome" };
}

function shouldExportRecord(record: GenesisPlatformAccountRecord, args: Args): boolean {
  if (args.recordIds.length > 0 && !args.recordIds.includes(record.recordId)) {
    return false;
  }
  if (args.platforms.length > 0 && !args.platforms.includes(record.platform)) {
    return false;
  }
  if (record.status !== "ready" && record.status !== "busy") {
    return false;
  }
  return Boolean(record.profileDirPath || record.storageStatePath);
}

async function exportRecord(params: {
  record: GenesisPlatformAccountRecord;
  outputDir: string;
}): Promise<ExportedRecord> {
  const launchOptions = resolveBrowserLaunchOptions();
  const storageStateFile = `${encodeURIComponent(params.record.recordId)}.json`;
  const storageStatePath = path.join(params.outputDir, storageStateFile);

  if (params.record.authMode === "storage_state" && params.record.storageStatePath && fs.existsSync(params.record.storageStatePath)) {
    fs.copyFileSync(params.record.storageStatePath, storageStatePath);
    const storage = JSON.parse(fs.readFileSync(storageStatePath, "utf-8")) as {
      cookies?: unknown[];
      origins?: unknown[];
    };
    return {
      recordId: params.record.recordId,
      platform: params.record.platform,
      accountId: params.record.accountId,
      accountLabel: params.record.accountLabel,
      loginUrl: params.record.loginUrl,
      capabilities: params.record.capabilities,
      source: params.record.source,
      browserKind: params.record.browserKind,
      browserProfileName: params.record.browserProfileName,
      authMode: "storage_state",
      storageStateFile,
      cookieCount: Array.isArray(storage.cookies) ? storage.cookies.length : 0,
      originCount: Array.isArray(storage.origins) ? storage.origins.length : 0,
    };
  }

  if (!params.record.profileDirPath) {
    throw new Error(`Record ${params.record.recordId} has no exportable login artifacts`);
  }

  const context = await chromium.launchPersistentContext(params.record.profileDirPath, {
    headless: true,
    channel: launchOptions.channel,
    executablePath: launchOptions.executablePath,
    ...(params.record.profileDirectoryName ? { args: [`--profile-directory=${params.record.profileDirectoryName}`] } : {}),
  });
  try {
    const storage = await context.storageState({ path: storageStatePath });
    return {
      recordId: params.record.recordId,
      platform: params.record.platform,
      accountId: params.record.accountId,
      accountLabel: params.record.accountLabel,
      loginUrl: params.record.loginUrl,
      capabilities: params.record.capabilities,
      source: params.record.source,
      browserKind: params.record.browserKind,
      browserProfileName: params.record.browserProfileName,
      authMode: "storage_state",
      storageStateFile,
      cookieCount: Array.isArray(storage.cookies) ? storage.cookies.length : 0,
      originCount: Array.isArray(storage.origins) ? storage.origins.length : 0,
    };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }
  const poolPath = resolveGenesisLoginStatePoolPath(process.env);
  const pool = readJsonFileSync<{ records?: GenesisPlatformAccountRecord[] }>(poolPath) ?? { records: [] };
  const records = (pool.records ?? []).filter((record) => shouldExportRecord(record, args));
  if (records.length === 0) {
    throw new Error("No exportable login-state records matched the filters");
  }

  fs.mkdirSync(args.outputDir, { recursive: true });
  const exported: ExportedRecord[] = [];
  for (const record of records) {
    const next = await exportRecord({
      record,
      outputDir: args.outputDir,
    });
    exported.push(next);
  }

  const manifest: ExportManifest = {
    exportedAt: Date.now(),
    sourceStateDir: process.env.OPENCLAW_STATE_DIR ?? "",
    records: exported,
  };
  fs.writeFileSync(path.join(args.outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  console.log(
    JSON.stringify(
      {
        outputDir: args.outputDir,
        recordCount: exported.length,
        platforms: [...new Set(exported.map((entry) => entry.platform))],
      },
      null,
      2,
    ),
  );
}

void main();
