import fs from "node:fs";
import {
  chromium,
  type BrowserContext,
} from "playwright-core";
import {
  completeGenesisPlatformLoginBootstrapSync,
  discoverGenesisBrowserProfilesSync,
  importGenesisBrowserProfileForPlatformSync,
  readGenesisLoginStatePoolSummarySync,
  type GenesisBrowserKind,
} from "../src/genesis/kernel/login-state-pool.js";

type Args = {
  stateDir?: string;
  browsers: GenesisBrowserKind[];
  platforms: string[];
  executablePath?: string;
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
  const browserArg = values.get("browser")?.trim().toLowerCase();
  const browsers =
    browserArg === "chrome" || browserArg === "msedge"
      ? [browserArg]
      : (["chrome", "msedge"] as GenesisBrowserKind[]);
  const platforms =
    values
      .get("platforms")
      ?.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean) ?? ["weibo", "toutiao", "github"];
  return {
    stateDir: values.get("state-dir")?.trim(),
    browsers,
    platforms,
    executablePath: values.get("executable-path")?.trim(),
  };
}

function resolveBrowserExecutable(browserKind: GenesisBrowserKind, explicitPath?: string): string | undefined {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }
  const systemPaths: Record<GenesisBrowserKind, string[]> = {
    chrome: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    msedge: [
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
  };
  return systemPaths[browserKind].find((candidate) => fs.existsSync(candidate));
}

function isAuthRedirect(platform: string, url: string): boolean {
  const normalized = url.toLowerCase();
  switch (platform) {
    case "weibo":
      return /login|newlogin/.test(normalized);
    case "toutiao":
      return /login|passport|auth|mp\.toutiao\.com\/auth/.test(normalized);
    case "github":
      return /github\.com\/login/.test(normalized);
    case "x":
      return /x\.com\/i\/flow\/login|twitter\.com\/i\/flow\/login/.test(normalized);
    case "tiktok":
    case "douyin":
      return /login|passport|sign[_-]?in|signup/.test(normalized);
    default:
      return /login|signin|sign-in|sign_in/.test(normalized);
  }
}

async function probeAccountRecord(params: {
  recordId: string;
  platform: string;
  profileDirPath: string;
  profileDirectoryName?: string;
  browserKind: GenesisBrowserKind;
  loginUrl: string;
  env: NodeJS.ProcessEnv;
  executablePath?: string;
}): Promise<{
  status: "ready" | "relogin_needed" | "blocked";
  accountLabel?: string;
  cookieCount?: number;
  originCount?: number;
  lastOutcome: string;
}> {
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(params.profileDirPath, {
      headless: true,
      executablePath: params.executablePath,
      ...(params.profileDirectoryName ? { args: [`--profile-directory=${params.profileDirectoryName}`] } : {}),
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(params.loginUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const url = page.url();
    const cookies = await context.cookies().catch(() => []);
    const storageState = await context.storageState().catch(() => ({ origins: [] as unknown[] }));
    const originCount = Array.isArray(storageState.origins) ? storageState.origins.length : 0;
    const title = await page.title().catch(() => "");
    if (isAuthRedirect(params.platform, url)) {
      return {
        status: "relogin_needed",
        accountLabel: title || `${params.browserKind}:${params.profileDirectoryName ?? "profile"}`,
        cookieCount: cookies.length,
        originCount,
        lastOutcome: `browser_scan_relogin:${url}`,
      };
    }
    return {
      status: "ready",
      accountLabel: title || `${params.browserKind}:${params.profileDirectoryName ?? "profile"}`,
      cookieCount: cookies.length,
      originCount,
      lastOutcome: `browser_scan_ready:${url}`,
    };
  } catch (error) {
    return {
      status: "blocked",
      lastOutcome: `browser_scan_failed:${String(error).slice(0, 200)}`,
    };
  } finally {
    await context?.close().catch(() => {});
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }
  const discovered = discoverGenesisBrowserProfilesSync({ browsers: args.browsers });
  const results: Array<Record<string, unknown>> = [];
  for (const candidate of discovered) {
    const executablePath = resolveBrowserExecutable(candidate.browserKind, args.executablePath);
    for (const platform of args.platforms) {
      const imported = importGenesisBrowserProfileForPlatformSync({
        platform,
        browserKind: candidate.browserKind,
        userDataDir: candidate.userDataDir,
        profileName: candidate.profileName,
        accountLabel: `${candidate.browserKind}:${candidate.displayName}`,
        status: "pending",
        env: process.env,
      });
      const probe = await probeAccountRecord({
        recordId: imported.recordId,
        platform,
        profileDirPath: imported.profileDirPath!,
        profileDirectoryName: imported.profileDirectoryName,
        browserKind: candidate.browserKind,
        loginUrl: imported.loginUrl,
        env: process.env,
        executablePath,
      });
      completeGenesisPlatformLoginBootstrapSync({
        recordId: imported.recordId,
        platform,
        accountLabel: probe.accountLabel ?? imported.accountLabel,
        authMode: "profile_dir",
        status: probe.status,
        cookieCount: probe.cookieCount,
        originCount: probe.originCount,
        lastOutcome: probe.lastOutcome,
        env: process.env,
      });
      results.push({
        browser: candidate.browserKind,
        profile: candidate.displayName,
        platform,
        status: probe.status,
        lastOutcome: probe.lastOutcome,
      });
    }
  }
  const summary = readGenesisLoginStatePoolSummarySync(process.env);
  process.stdout.write(
    JSON.stringify(
      {
        discoveredProfiles: discovered.length,
        imported: results.length,
        results,
        summary: {
          ready: summary.readyAccountCount,
          busy: summary.busyAccountCount,
          pending: summary.pendingAccountCount,
          relogin: summary.reloginNeededCount,
          blocked: summary.blockedAccountCount,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

void main();
