import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGenesisSkillEvolutionEvent,
  DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY,
  resolveGenesisSkillEvolutionBias,
  readGenesisSkillEvolutionSummarySnapshotSync,
  readGenesisSkillEvolutionSummarySync,
  reduceGenesisSkillEvolutionSummary,
  writeGenesisSkillEvolutionSummarySnapshotSync,
} from "./skill-evolution.js";
import { resolveGenesisSkillEvolutionLogPath } from "./state.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-skill-evolution-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis skill evolution", () => {
  it("maps completion reasons into FIX / DERIVED / CAPTURED events", () => {
    expect(
      buildGenesisSkillEvolutionEvent({
        ts: 1,
        sessionKey: "agent:builder:main",
        lineageId: "builder",
        reason: "create",
      }),
    ).toMatchObject({
      mode: "derived",
    });
    expect(
      buildGenesisSkillEvolutionEvent({
        ts: 2,
        sessionKey: "agent:builder:main",
        lineageId: "builder",
        reason: "complete",
      }),
    ).toMatchObject({
      mode: "captured",
    });
    expect(
      buildGenesisSkillEvolutionEvent({
        ts: 3,
        sessionKey: "agent:builder:main",
        lineageId: "builder",
        reason: "failed",
      }),
    ).toMatchObject({
      mode: "fix",
    });
  });

  it("reduces skill evolution events into a lineage-aware summary", async () => {
    const logPath = resolveGenesisSkillEvolutionLogPath(process.env);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(
      logPath,
      [
        JSON.stringify({
          ts: 1,
          sessionKey: "agent:builder:main",
          lineageId: "builder",
          mode: "derived",
          reason: "create",
        }),
        JSON.stringify({
          ts: 2,
          sessionKey: "agent:builder:main",
          lineageId: "builder",
          mode: "captured",
          reason: "complete",
        }),
        JSON.stringify({
          ts: 3,
          sessionKey: "agent:auditor:main",
          lineageId: "auditor",
          mode: "fix",
          reason: "failed",
        }),
      ].join("\n") + "\n",
      "utf-8",
    );

    const summary = readGenesisSkillEvolutionSummarySync(process.env);
    expect(summary).toMatchObject({
      recentEventCount: 3,
      modeCounts: {
        fix: 1,
        derived: 1,
        captured: 1,
      },
    });
    expect(summary.topLineages[0]).toMatchObject({
      lineageId: "builder",
      eventCount: 2,
      derivedCount: 1,
      capturedCount: 1,
    });
  });

  it("persists skill evolution summary snapshots", () => {
    const summary = reduceGenesisSkillEvolutionSummary(
      {
        ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY,
        modeCounts: { ...DEFAULT_GENESIS_SKILL_EVOLUTION_SUMMARY.modeCounts },
        topLineages: [],
      },
      {
        ts: 1,
        sessionKey: "agent:builder:main",
        lineageId: "builder",
        mode: "captured",
        reason: "complete",
      },
    );

    writeGenesisSkillEvolutionSummarySnapshotSync(summary, process.env);

    expect(readGenesisSkillEvolutionSummarySnapshotSync(process.env)).toMatchObject({
      recentEventCount: 1,
      modeCounts: {
        fix: 0,
        derived: 0,
        captured: 1,
      },
    });
  });

  it("turns skill evolution lineage stats into a planning bias", () => {
    writeGenesisSkillEvolutionSummarySnapshotSync(
      {
        recentEventCount: 3,
        modeCounts: {
          fix: 1,
          derived: 1,
          captured: 1,
        },
        topLineages: [
          {
            lineageId: "builder",
            eventCount: 3,
            fixCount: 1,
            derivedCount: 1,
            capturedCount: 1,
            lastMode: "captured",
          },
        ],
      },
      process.env,
    );

    expect(resolveGenesisSkillEvolutionBias("builder", process.env)).toBeCloseTo(1.25, 5);
    expect(resolveGenesisSkillEvolutionBias("auditor", process.env)).toBe(0);
  });
});
