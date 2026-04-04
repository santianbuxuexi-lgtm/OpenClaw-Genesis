import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright-core";
import {
  beginGenesisPlatformLoginBootstrapSync,
  completeGenesisPlatformLoginBootstrapSync,
  prepareGenesisLoginStateStoragePath,
  resolveGenesisPlatformPreset,
} from "../src/genesis/kernel/login-state-pool.js";

type Args = {
  platform: string;
  loginUrl?: string;
  stateDir?: string;
  accountLabel?: string;
  browserChannel?: string;
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
  const platform = values.get("platform")?.trim() ?? "";
  if (!platform) {
    throw new Error("Missing --platform");
  }
  return {
    platform,
    loginUrl: values.get("login-url")?.trim(),
    stateDir: values.get("state-dir")?.trim(),
    accountLabel: values.get("account-label")?.trim(),
    browserChannel: values.get("channel")?.trim(),
    executablePath: values.get("executable-path")?.trim(),
  };
}

function resolveBrowserLaunchOptions(args: Args): {
  channel?: "chrome" | "msedge";
  executablePath?: string;
  displayName: string;
} {
  if (args.executablePath && fs.existsSync(args.executablePath)) {
    return {
      executablePath: args.executablePath,
      displayName: args.executablePath,
    };
  }

  const systemPaths: Record<"chrome" | "msedge", string[]> = {
    chrome: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
    msedge: [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ],
  };

  const requestedChannel =
    args.browserChannel === "chrome" || args.browserChannel === "msedge"
      ? args.browserChannel
      : undefined;
  const channelOrder: ("chrome" | "msedge")[] = requestedChannel
    ? [requestedChannel, ...(requestedChannel === "chrome" ? ["msedge"] : ["chrome"])]
    : ["chrome", "msedge"];

  for (const channel of channelOrder) {
    for (const executablePath of systemPaths[channel]) {
      if (fs.existsSync(executablePath)) {
        return {
          executablePath,
          displayName: `${channel}:${executablePath}`,
        };
      }
    }
  }

  if (requestedChannel) {
    return {
      channel: requestedChannel,
      displayName: `playwright-${requestedChannel}`,
    };
  }

  return {
    displayName: "playwright-default",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.stateDir) {
    process.env.OPENCLAW_STATE_DIR = args.stateDir;
  }
  const preset = resolveGenesisPlatformPreset(args.platform);
  const record = beginGenesisPlatformLoginBootstrapSync({
    platform: preset.platform,
    loginUrl: args.loginUrl ?? preset.loginUrl,
    accountLabel: args.accountLabel,
    source: "browser_popup",
    env: process.env,
  });
  const storageStatePath = prepareGenesisLoginStateStoragePath({
    platform: preset.platform,
    recordId: record.recordId,
    env: process.env,
  });
  const userDataDir = storageStatePath.replace(/\.json$/i, "");
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserOptions = resolveBrowserLaunchOptions(args);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: browserOptions.channel,
    executablePath: browserOptions.executablePath,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(record.loginUrl, { waitUntil: "domcontentloaded" });

  output.write(
    [
      `Genesis login bootstrap started for ${preset.platform}`,
      `Login URL: ${record.loginUrl}`,
      `Browser: ${browserOptions.displayName}`,
      "请在弹出的浏览器里完成登录；登录完成后回车保存登录态，输入 q 取消。",
    ].join("\n") + "\n",
  );

  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question("> ")).trim().toLowerCase();
  await rl.close();

  if (answer === "q" || answer === "quit" || answer === "cancel") {
    await context.close();
    output.write("Genesis login bootstrap cancelled.\n");
    return;
  }

  await context.storageState({ path: storageStatePath });
  const cookies = await context.cookies();
  const storageState = JSON.parse(fs.readFileSync(storageStatePath, "utf-8")) as {
    origins?: unknown[];
  };
  const originCount = Array.isArray(storageState.origins) ? storageState.origins.length : 0;
  const finalUrl = page.url();
  const title = await page.title();
  const status = cookies.length > 0 || originCount > 0 ? "ready" : "relogin_needed";

  completeGenesisPlatformLoginBootstrapSync({
    recordId: record.recordId,
    platform: preset.platform,
    loginUrl: record.loginUrl,
    accountLabel: args.accountLabel || title || preset.platform,
    authMode: "storage_state",
    storageStatePath,
    cookieCount: cookies.length,
    originCount,
    status,
    lastOutcome: `url=${finalUrl}`,
    env: process.env,
  });

  await context.close();
  output.write(
    JSON.stringify(
      {
        platform: preset.platform,
        status,
        storageStatePath,
        cookieCount: cookies.length,
        originCount,
        url: finalUrl,
      },
      null,
      2,
    ) + "\n",
  );
}

void main();
