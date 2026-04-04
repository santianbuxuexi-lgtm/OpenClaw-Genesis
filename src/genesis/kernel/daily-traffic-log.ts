import fs from "node:fs";
import path from "node:path";
import {
  resolveGenesisDailyTrafficLogPath,
  type GenesisDailyTrafficLogEntry,
  type GenesisProactiveWorkEntry,
} from "./state.js";

const DAILY_TRAFFIC_DEDUP_WINDOW_MS = 18 * 60 * 60 * 1000;

function readJsonLinesSync<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function normalizeFingerprintText(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTaskFingerprintBase(entry: GenesisProactiveWorkEntry): string {
  const hotspot = [entry.hotspotTitle, entry.hotspotUrl].filter(Boolean).join(" ");
  if (hotspot.trim()) {
    return normalizeFingerprintText(hotspot);
  }
  const task = normalizeFingerprintText(entry.task);
  return task
    .replace(/\buse\s+\S+\s+to\s+/g, "")
    .replace(/\bpublish\b/g, "")
    .replace(/\bshape this hotspot into a\b/g, "")
    .replace(/\b88 char\b/g, "")
    .trim();
}

export function buildGenesisTrafficFingerprint(entry: GenesisProactiveWorkEntry): string | null {
  if (entry.workType !== "external_publish" || !entry.platform) {
    return null;
  }
  const base = buildTaskFingerprintBase(entry);
  if (!base) {
    return null;
  }
  return `${entry.platform}:${base}`.slice(0, 320);
}

export function readGenesisDailyTrafficLogSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisDailyTrafficLogEntry[] {
  return readJsonLinesSync<GenesisDailyTrafficLogEntry>(resolveGenesisDailyTrafficLogPath(env))
    .sort((left, right) => right.publishedAt - left.publishedAt);
}

export function appendGenesisDailyTrafficLogEntrySync(
  entry: GenesisDailyTrafficLogEntry,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = resolveGenesisDailyTrafficLogPath(env);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function wasGenesisTrafficPublishedRecentlySync(params: {
  platform: string;
  fingerprint: string | null | undefined;
  sinceMs?: number;
  env?: NodeJS.ProcessEnv;
}): boolean {
  if (!params.fingerprint?.trim()) {
    return false;
  }
  const env = params.env ?? process.env;
  const sinceMs = params.sinceMs ?? Date.now() - DAILY_TRAFFIC_DEDUP_WINDOW_MS;
  return readGenesisDailyTrafficLogSync(env).some(
    (entry) =>
      entry.platform === params.platform &&
      entry.fingerprint === params.fingerprint &&
      entry.publishedAt >= sinceMs,
  );
}
