#!/usr/bin/env node

import { spawn } from "node:child_process";

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function parseArgs(argv) {
  const args = [...argv];
  let label = "step";
  let heartbeatMs = Number.parseInt(process.env.GENESIS_VERIFY_HEARTBEAT_MS ?? "30000", 10);

  while (args.length > 0) {
    const current = args.shift();
    if (current === "--") {
      break;
    }
    if (current === "--label") {
      label = args.shift() ?? label;
      continue;
    }
    if (current === "--heartbeat-ms") {
      heartbeatMs = Number.parseInt(args.shift() ?? String(heartbeatMs), 10);
      continue;
    }
    throw new Error(`Unknown argument: ${current}`);
  }

  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    heartbeatMs = 30000;
  }

  return {
    label,
    heartbeatMs,
    command: args[0],
    commandArgs: args.slice(1),
  };
}

const { label, heartbeatMs, command, commandArgs } = parseArgs(process.argv.slice(2));

if (!command) {
  console.error("[genesis-verify] missing command");
  process.exit(1);
}

const startedAt = Date.now();
console.log(`[genesis-verify] START ${label}`);

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  shell: false,
  env: process.env,
});

const heartbeat = setInterval(() => {
  console.log(
    `[genesis-verify] ${label} still running (+${formatDuration(Date.now() - startedAt)})`,
  );
}, heartbeatMs);

child.on("error", (error) => {
  clearInterval(heartbeat);
  console.error(`[genesis-verify] FAIL ${label}: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearInterval(heartbeat);
  const duration = formatDuration(Date.now() - startedAt);
  if (code === 0) {
    console.log(`[genesis-verify] DONE ${label} (${duration})`);
    process.exit(0);
  }
  if (signal) {
    console.error(`[genesis-verify] FAIL ${label}: signal=${signal} (${duration})`);
    process.exit(1);
  }
  console.error(`[genesis-verify] FAIL ${label}: exit=${code ?? 1} (${duration})`);
  process.exit(code ?? 1);
});
