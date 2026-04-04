import fs from "node:fs/promises";
import path from "node:path";
import { resolveGenesisExperimentProfilePath } from "../src/genesis/kernel/state.ts";
import { resolveGenesisServerSmokeProfilePatch } from "../src/genesis/kernel/server-smoke-profile.ts";

function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode?.trim().toLowerCase();
  const backupFile = args["backup-file"];
  if (!backupFile) {
    throw new Error("missing --backup-file");
  }

  const targetFile = resolveGenesisExperimentProfilePath(process.env);
  if (mode === "apply") {
    const { preset, patch } = resolveGenesisServerSmokeProfilePatch({
      preset: process.env.OPENCLAW_GENESIS_SMOKE_PROFILE_PRESET,
      overrideJson: process.env.OPENCLAW_GENESIS_SMOKE_EXPERIMENT_PROFILE,
    });
    if (!patch) {
      process.stdout.write(
        `${JSON.stringify({ applied: false, preset: preset ?? null, targetFile, backupFile })}\n`,
      );
      return;
    }

    await fs.mkdir(path.dirname(backupFile), { recursive: true });
    let previousRaw: string | null = null;
    try {
      previousRaw = await fs.readFile(targetFile, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fs.writeFile(
      backupFile,
      `${JSON.stringify(
        {
          existed: previousRaw !== null,
          content: previousRaw,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const previousJson =
      previousRaw && previousRaw.trim()
        ? (JSON.parse(previousRaw) as Record<string, unknown>)
        : {};
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(
      targetFile,
      `${JSON.stringify(
        {
          ...previousJson,
          ...patch,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    process.stdout.write(
      `${JSON.stringify({
        applied: true,
        preset: preset ?? null,
        patch,
        targetFile,
        backupFile,
      })}\n`,
    );
    return;
  }

  if (mode === "restore") {
    let backupRaw: string | null = null;
    try {
      backupRaw = await fs.readFile(backupFile, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    if (!backupRaw) {
      process.stdout.write(
        `${JSON.stringify({ restored: false, reason: "missing_backup", targetFile, backupFile })}\n`,
      );
      return;
    }
    const backup = JSON.parse(backupRaw) as { existed?: boolean; content?: string | null };
    if (backup.existed && typeof backup.content === "string") {
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, backup.content, "utf-8");
    } else {
      await fs.rm(targetFile, { force: true });
    }
    await fs.rm(backupFile, { force: true });
    process.stdout.write(
      `${JSON.stringify({ restored: true, targetFile, backupFile, existed: Boolean(backup.existed) })}\n`,
    );
    return;
  }

  throw new Error(`unsupported mode: ${mode ?? "missing"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
