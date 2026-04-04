import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGenesisSocietyExecutionDefaultsSync } from "./society-defaults.js";
import {
  resolveGenesisDispatchPlanPath,
  resolveGenesisSkillEvolutionSummaryPath,
  resolveGenesisWorldStatePath,
} from "./state.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-society-defaults-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis society execution defaults", () => {
  it("lets skill evolution raise action and stability defaults for the current primary lineage", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.mkdir(path.dirname(resolveGenesisDispatchPlanPath("agent:main:main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 4,
          totalRunCompletions: 2,
          cumulativeIntensity: 3,
          currentPressure: 0.8,
          stormMomentum: 1.6,
          replicationBoost: 0.2,
          triggerCounts: { cron: 1, heartbeat: 1, workflow: 2 },
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "experiment-profile.json"),
      `${JSON.stringify(
        {
          societyDefaultMaxActions: 1,
          societyDefaultMaxStableRounds: 1,
          societySkillEvolutionActionWeight: 0.3,
          societySkillEvolutionStableRoundWeight: 0.2,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisDispatchPlanPath("agent:main:main"),
      `${JSON.stringify(
        {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 1.4,
          lane: "workflow",
          dispatchMode: "immediate",
          assignments: [],
          supportSessionKeys: [],
          reviveSessionKeys: [],
          deferredAgentIds: [],
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisSkillEvolutionSummaryPath(),
      `${JSON.stringify(
        {
          recentEventCount: 4,
          modeCounts: {
            fix: 0,
            derived: 1,
            captured: 3,
          },
          topLineages: [
            {
              lineageId: "main",
              eventCount: 4,
              fixCount: 0,
              derivedCount: 1,
              capturedCount: 3,
              lastMode: "captured",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const defaults = resolveGenesisSocietyExecutionDefaultsSync(process.env);

    expect(defaults.maxActions).toBe(2);
    expect(defaults.maxStableRounds).toBe(2);
  });

  it("lets skill evolution increase default failure tolerance for the current primary lineage", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.mkdir(path.dirname(resolveGenesisDispatchPlanPath("agent:main:main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 3,
          totalRunCompletions: 1,
          cumulativeIntensity: 2,
          currentPressure: 1,
          stormMomentum: 1,
          replicationBoost: 0.3,
          triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "experiment-profile.json"),
      `${JSON.stringify(
        {
          societyDefaultMaxFailureRounds: 1,
          societySkillEvolutionFailureWeight: 0.3,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisDispatchPlanPath("agent:main:main"),
      `${JSON.stringify(
        {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 1.2,
          lane: "workflow",
          dispatchMode: "immediate",
          assignments: [],
          supportSessionKeys: [],
          reviveSessionKeys: [],
          deferredAgentIds: [],
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisSkillEvolutionSummaryPath(),
      `${JSON.stringify(
        {
          recentEventCount: 4,
          modeCounts: {
            fix: 0,
            derived: 2,
            captured: 2,
          },
          topLineages: [
            {
              lineageId: "main",
              eventCount: 4,
              fixCount: 0,
              derivedCount: 2,
              capturedCount: 2,
              lastMode: "captured",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const defaults = resolveGenesisSocietyExecutionDefaultsSync(process.env);

    expect(defaults.maxFailureRounds).toBe(2);
  });
});
