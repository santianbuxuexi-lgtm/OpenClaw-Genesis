import fs from "node:fs";
import path from "node:path";
import {
  beginGenesisPlatformLoginBootstrapSync,
  completeGenesisPlatformLoginBootstrapSync,
  prepareGenesisLoginStateStoragePath,
} from "../src/genesis/kernel/login-state-pool.js";

type Args = {
  importDir: string;
  stateDir?: string;
};

type ImportManifest = {
  exportedAt: number;
  sourceStateDir?: string;
  records: Array<{
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
  }>;
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
  const importDir = values.get("import-dir")?.trim();
  if (!importDir) {
    throw new Error("Missing --import-dir");
  }
  return {
    importDir,
    stateDir: values.get("state-dir")?.trim(),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }

  const manifestPath = path.join(args.importDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ImportManifest;
  const imported: string[] = [];
  for (const record of manifest.records ?? []) {
    const bootstrap = beginGenesisPlatformLoginBootstrapSync({
      platform: record.platform,
      accountLabel: record.accountLabel,
      loginUrl: record.loginUrl,
      capabilities: record.capabilities as never,
      source: "manual_bootstrap",
      env: process.env,
    });
    const storageStateSourcePath = path.join(args.importDir, record.storageStateFile);
    if (!fs.existsSync(storageStateSourcePath)) {
      throw new Error(`Missing storage state file: ${storageStateSourcePath}`);
    }
    const targetStorageStatePath = prepareGenesisLoginStateStoragePath({
      platform: record.platform,
      recordId: bootstrap.recordId,
      env: process.env,
    });
    fs.mkdirSync(path.dirname(targetStorageStatePath), { recursive: true });
    fs.copyFileSync(storageStateSourcePath, targetStorageStatePath);
    completeGenesisPlatformLoginBootstrapSync({
      recordId: bootstrap.recordId,
      platform: record.platform,
      loginUrl: record.loginUrl,
      accountId: record.accountId,
      accountLabel: record.accountLabel,
      authMode: "storage_state",
      capabilities: record.capabilities as never,
      storageStatePath: targetStorageStatePath,
      cookieCount: record.cookieCount,
      originCount: record.originCount,
      status: record.cookieCount > 0 || record.originCount > 0 ? "ready" : "relogin_needed",
      lastOutcome: `imported_storage_state:${record.platform}:${record.recordId}`,
      env: process.env,
    });
    imported.push(record.platform);
  }

  console.log(
    JSON.stringify(
      {
        importDir: args.importDir,
        recordCount: manifest.records?.length ?? 0,
        importedPlatforms: [...new Set(imported)],
      },
      null,
      2,
    ),
  );
}

void main();
