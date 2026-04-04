import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readGenesisLineageFocusItemsSync, readGenesisLineageTriggersSync } from "./focus.js";
import {
  readGenesisMetaClawStateSync,
  runGenesisMetaClawIdleOptimizationSync,
} from "./meta-claw.js";

describe("Genesis MetaClaw idle optimization", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
  });

  it("optimizes idle founders by boosting focus and triggers", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-metaclaw-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);

    const state = runGenesisMetaClawIdleOptimizationSync({
      summary: {
        world: {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 1,
          cumulativeIntensity: 1,
          currentPressure: 0.1,
          stormMomentum: 0.1,
          replicationBoost: 0.1,
          triggerCounts: { cron: 0, heartbeat: 1, workflow: 0 },
          updatedAt: 1,
        },
        vitalitySummary: {
          lineageCount: 3,
          childLineageCount: 0,
          specialtyOnlyChildCount: 0,
          superpowerChildCount: 0,
          specialtyWorkingChildCount: 0,
          specialtyProactiveChildCount: 0,
          specialtyChildPublicValue: 0,
          superpowerWorkingChildCount: 0,
          superpowerProactiveChildCount: 0,
          superpowerChildPublicValue: 0,
          replicatingParentCount: 0,
          maxChildrenPerParent: 0,
          workingLineageCount: 3,
          childWorkingLineageCount: 0,
          replicatingWorkingParentCount: 0,
          heartbeatLineageCount: 2,
          proactiveReadyLineageCount: 2,
          proactiveWorkingLineageCount: 2,
          activeFocusLineageCount: 0,
          activeTriggerCount: 0,
          recentCapturedSkillCount: 0,
          recentDerivedSkillCount: 0,
          totalPublicValue: 2,
          totalPrivateValue: 0,
          totalSurvivalCredit: 2,
          totalExpansionCredit: 0,
          proactiveSignalScore: 4,
          autonomousExpansionScore: 1,
          founderRoleCoverageCount: 1,
          founderYieldCoverageCount: 1,
          roleAlignedWorkingLineageCount: 1,
          roleAlignedProactiveLineageCount: 1,
          roleAlignedProactiveYieldScore: 1.5,
          proactiveSpecializationScore: 2,
          highestYieldFounderOrigin: "builder",
          highestYieldFounderScore: 1.5,
          highestRecoveryChainFounderOrigin: "negotiator",
          highestRecoveryChainFounderScore: 1.2,
          nearDeathLineageCount: 1,
          founderRoleBreakdown: [],
          topParentLineages: [],
        },
      },
      trajectorySummary: {
        recentTrajectoryCount: 1,
        climateTrajectoryCount: 0,
        survivalTrajectoryCount: 1,
        recoveryTrajectoryCount: 0,
        replicationTrajectoryCount: 0,
        idleTrajectoryCount: 0,
        averageProcessReward: 2,
        averageOutcomeReward: 0.5,
        averageTotalReward: 1.5,
        latestMode: "survival",
        lastTrajectoryTs: 1,
        highestRewardFounderOrigin: "builder",
        highestRewardFounderScore: 1.5,
      },
      env: process.env,
    });

    expect(state.idleEligible).toBe(true);
    expect(state.idleOptimizationCount).toBe(1);
    expect(state.lastTargetFounderOrigin).toBe("negotiator");
    expect(state.lastSecondaryFounderOrigin).toBe("builder");
    expect(state.lastAction).toBe("stabilize_recovery");
    expect(readGenesisMetaClawStateSync(process.env)).toMatchObject({
      idleOptimizationCount: 1,
      lastTargetFounderOrigin: "negotiator",
      lastSecondaryFounderOrigin: "builder",
    });
    expect(readGenesisLineageFocusItemsSync("negotiator", process.env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "metaclaw:negotiator:focus",
          status: "active",
        }),
      ]),
    );
    expect(readGenesisLineageTriggersSync("negotiator", process.env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "metaclaw:negotiator:trigger",
          status: "active",
        }),
      ]),
    );
    expect(readGenesisLineageFocusItemsSync("builder", process.env)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "metaclaw:builder:focus",
          status: "active",
        }),
      ]),
    );
  });
});
