#!/usr/bin/env node

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { ensureGenesisDistributionBootstrap } from "./openclaw-genesis-bootstrap.mjs";

ensureGenesisDistributionBootstrap({ quiet: true });

// 使用沙箱化的环境变量（与 genesis-qq-router 保持一致）
const stateDir =
  process.env.OPENCLAW_GENESIS_STATE_DIR ||
  process.env.OPENCLAW_STATE_DIR ||
  path.join(os.homedir(), ".openclaw-genesis");

const configPath =
  process.env.OPENCLAW_CONFIG_PATH ||
  path.join(stateDir, "openclaw.json");

// 白名单过滤 + 注入隔离变量
const allowedPrefixes = [
  "OPENCLAW_GENESIS_",
  "OPENCLAW_STATE_DIR",
  "OPENCLAW_CONFIG_PATH",
  "PATH",
  "HOME",
  "NODE_",
  "LANG",
  "LC_",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
];

const sandboxEnv = {};
for (const key of Object.keys(process.env)) {
  if (allowedPrefixes.some((p) => key === p || key.startsWith(p))) {
    sandboxEnv[key] = process.env[key];
  }
}
sandboxEnv.HOME = stateDir;
sandboxEnv.OPENCLAW_STATE_DIR = stateDir;
sandboxEnv.OPENCLAW_GENESIS_STATE_DIR = stateDir;
sandboxEnv.OPENCLAW_CONFIG_PATH = configPath;

const child = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/genesis-heartbeat.ts", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: sandboxEnv,
    stdio: "inherit",
    timeout: 120_000, // 2 分钟超时保护
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
