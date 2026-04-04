import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGenesisFounderQualificationSync, readGenesisSocietySummarySync } from "./society-query.js";
import * as lineageSummaryModule from "./lineage-summary.js";
import { DEFAULT_GENESIS_EVENT_LOG_SUMMARY, reduceGenesisEventLogSummary } from "./event-log.js";
import {
  resolveGenesisDispatchPlanPath,
  resolveGenesisLedgerPath,
  resolveGenesisLineageRecordPath,
  resolveGenesisMetaClawStatePath,
  resolveGenesisSkillEvolutionSummaryPath,
  resolveGenesisTrajectorySummaryPath,
  resolveGenesisUserIntentSummaryPath,
  resolveGenesisWorldStatePath,
} from "./state.js";
import { readNextGenesisSocietyPlanSync } from "./society-query.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-society-query-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis society query", () => {
  it("reduces event-log entries into a stable summary", async () => {
    const summary = [
      {
        kind: "environment_event" as const,
        ts: 90,
        payload: {
          trigger: "workflow" as const,
          summary: "Genesis workflow storm",
          intensity: 1.1,
        },
      },
      {
        kind: "run_completion" as const,
        ts: 95,
        payload: {
          sessionKey: "agent:main:main",
          reason: "complete",
          ts: 95,
        },
      },
      {
        kind: "workflow_dispatch" as const,
        ts: 100,
        payload: {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 1.1,
          lane: "workflow" as const,
          dispatchMode: "immediate" as const,
          assignments: [],
          supportSessionKeys: [],
          reviveSessionKeys: [],
          deferredAgentIds: [],
          updatedAt: 100,
        },
      },
    ].reduce(
      (acc, entry) =>
        reduceGenesisEventLogSummary(
          {
            ...acc,
            recentEnvironmentTriggers: { ...acc.recentEnvironmentTriggers },
          },
          entry,
        ),
      {
        ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY,
        recentEnvironmentTriggers: { ...DEFAULT_GENESIS_EVENT_LOG_SUMMARY.recentEnvironmentTriggers },
      },
    );

    expect(summary).toMatchObject({
      recentEntryCount: 3,
      environmentEventCount: 1,
      runCompletionCount: 1,
      workflowDispatchCount: 1,
      recentEnvironmentTriggers: {
        workflow: 1,
      },
      lastEnvironmentSummary: "Genesis workflow storm",
    });
  });

  it("surfaces recent event log summary alongside society summary", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.dirname(resolveGenesisDispatchPlanPath("agent:main:main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 2,
          totalRunCompletions: 5,
          cumulativeIntensity: 3.2,
          currentPressure: 0.4,
          stormMomentum: 0.7,
          replicationBoost: 0.3,
          triggerCounts: {
            cron: 1,
            heartbeat: 0,
            workflow: 1,
          },
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("main"),
      `${JSON.stringify(
        {
          lineageId: "main",
          latestSessionKey: "agent:main:main",
          completionCount: 2,
          lastCompletionTs: 95,
          accumulatedPrivilegeTax: 0,
          publicValue: 2,
          privateValue: 1,
          survivalCredit: 1.5,
          expansionCredit: 0.5,
          updatedAt: 100,
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
          intensity: 1.1,
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
      resolveGenesisLedgerPath(),
      [
        JSON.stringify({
          kind: "environment_event",
          ts: 90,
          payload: {
            trigger: "workflow",
            summary: "Genesis workflow storm",
            intensity: 1.1,
          },
        }),
        JSON.stringify({
          kind: "workflow_dispatch",
          ts: 100,
          payload: {
            primaryAgentId: "main",
            primarySessionKey: "agent:main:main",
            intensity: 1.1,
            lane: "workflow",
            dispatchMode: "immediate",
            assignments: [],
            supportSessionKeys: [],
            reviveSessionKeys: [],
            deferredAgentIds: [],
            updatedAt: 100,
          },
        }),
      ].join("\n") + "\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "skill-evolution-summary.json"),
      `${JSON.stringify(
        {
          recentEventCount: 2,
          modeCounts: {
            fix: 0,
            derived: 1,
            captured: 1,
          },
          topLineages: [
            {
              lineageId: "main",
              eventCount: 2,
              fixCount: 0,
              derivedCount: 1,
              capturedCount: 1,
              lastMode: "captured",
              lastReason: "complete",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisSocietySummarySync(process.env);

    expect(summary.world?.currentPressure).toBe(0.4);
    expect(summary.eventLogSummary).toMatchObject({
      recentEntryCount: 2,
      environmentEventCount: 1,
      workflowDispatchCount: 1,
      recentEnvironmentTriggers: {
        workflow: 1,
      },
      lastEnvironmentSummary: "Genesis workflow storm",
    });
    expect(summary.collaborationSummary).toMatchObject({
      activePlanCount: 1,
      collaborativePlanCount: 0,
      mobilizedAgentCount: 0,
    });
    expect(summary.vitalitySummary).toMatchObject({
      lineageCount: 1,
      childLineageCount: 0,
      recentCapturedSkillCount: 1,
      recentDerivedSkillCount: 1,
      proactiveReadyLineageCount: 1,
    });
    expect(summary.skillEvolutionSummary).toMatchObject({
      recentEventCount: 2,
      modeCounts: {
        fix: 0,
        derived: 1,
        captured: 1,
      },
    });
    expect(summary.experimentSignals).toMatchObject({
      defaultMinIntervalMs: 0,
      defaultMaxTicks: 3,
      defaultMaxActions: 3,
      defaultMaxRounds: 3,
      defaultMaxFailureRounds: 2,
      defaultMaxStableRounds: 2,
      nextPlanSkillEvolutionBias: 1.75,
      amplificationScore: 1.75,
      phaseState: "amplifying",
    });
    expect(summary.experimentSignals?.runawayRiskScore).toBeCloseTo(3.45, 6);
    expect(summary.activeDispatchCount).toBe(1);
    expect(summary.topLineages[0]).toMatchObject({
      lineageId: "main",
    });
  });

  it("builds a learning chain from trajectory, MetaClaw, and founder signals", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    vi.spyOn(lineageSummaryModule, "readGenesisLineageSummarySync").mockReturnValue({
      ecologyCounts: {
        active: 3,
        stressed: 1,
        dormant: 0,
        extinct: 0,
      },
      topLineages: [
        {
          lineageId: "builder_founder",
          ecologyState: "active",
          survivalCredit: 2.5,
          expansionCredit: 2,
          accumulatedPrivilegeTax: 0.5,
          latestSessionKey: "agent:builder:main",
        },
      ],
      vitalitySummary: {
        lineageCount: 4,
        childLineageCount: 2,
        workingLineageCount: 4,
        proactiveWorkingLineageCount: 3,
        totalPublicValue: 8,
        totalSurvivalCredit: 6,
        recoveryStageMap: {
          stages: [
            {
              stage: "stressed",
              founderOrigin: "auditor",
              score: 4.2,
              runnerUpFounderOrigin: "builder",
              runnerUpScore: 2.4,
              basis: "transient_recovery",
            },
            {
              stage: "dormant",
              founderOrigin: "creator",
              score: 3.6,
              runnerUpFounderOrigin: "builder",
              runnerUpScore: 2.1,
              basis: "revive_cooperation",
            },
          ],
        },
        founderRoleBreakdown: [
          {
            founderOrigin: "builder",
            lineageCount: 1,
            workingLineageCount: 1,
            proactiveWorkingLineageCount: 1,
            roleAlignedLineageCount: 1,
            roleAlignedProactiveLineageCount: 1,
            activeFocusCount: 2,
            activeTriggerCount: 2,
            publicValue: 3.5,
            survivalCredit: 2.5,
            proactivePublicValue: 2.5,
            proactiveSurvivalCredit: 1.75,
            alignedProactiveYieldScore: 2.5,
            proactiveYieldEfficiency: 1.8,
            replicationValueScore: 2.4,
            climateReplicationValueScore: 1.8,
            survivalReplicationValueScore: 0.9,
            childCount: 2,
            workingChildCount: 2,
            proactiveChildCount: 1,
            superpowerChildCount: 1,
            childDegradationScore: 2.4,
            cooperativeYieldScore: 1.4,
            collaborationInfluenceScore: 1.2,
            stableRecoveryScore: 0.8,
            durableRecoveryScore: 0.5,
            recoveryChainScore: 0.6,
            dormantLineageCount: 1,
            extinctLineageCount: 1,
            backslidingLineageCount: 2,
            survivalClosureScore: 0.3,
            terminalMortalityScore: 0.8,
          },
          {
            founderOrigin: "negotiator",
            lineageCount: 1,
            workingLineageCount: 1,
            proactiveWorkingLineageCount: 1,
            roleAlignedLineageCount: 1,
            roleAlignedProactiveLineageCount: 1,
            activeFocusCount: 2,
            activeTriggerCount: 1,
            publicValue: 2,
            survivalCredit: 2.5,
            proactivePublicValue: 1.2,
            proactiveSurvivalCredit: 1.8,
            alignedProactiveYieldScore: 1.2,
            proactiveYieldEfficiency: 0.9,
            replicationValueScore: 0.7,
            climateReplicationValueScore: 0.3,
            survivalReplicationValueScore: 0.5,
            childCount: 1,
            workingChildCount: 1,
            proactiveChildCount: 1,
            superpowerChildCount: 0,
            childDegradationScore: 0.2,
            cooperativeYieldScore: 0.9,
            collaborationInfluenceScore: 0.8,
            stableRecoveryScore: 2.1,
            durableRecoveryScore: 2.4,
            recoveryChainScore: 2.7,
          },
          {
            founderOrigin: "scout",
            lineageCount: 1,
            workingLineageCount: 1,
            proactiveWorkingLineageCount: 1,
            roleAlignedLineageCount: 1,
            roleAlignedProactiveLineageCount: 1,
            activeFocusCount: 1,
            activeTriggerCount: 1,
            publicValue: 1.5,
            survivalCredit: 1,
            proactivePublicValue: 1,
            proactiveSurvivalCredit: 0.8,
            alignedProactiveYieldScore: 1.1,
            proactiveYieldEfficiency: 1.1,
            replicationValueScore: 1,
            climateReplicationValueScore: 0.8,
            survivalReplicationValueScore: 0.4,
            childCount: 1,
            workingChildCount: 0,
            proactiveChildCount: 0,
            superpowerChildCount: 0,
            childDegradationScore: 0.9,
            cooperativeYieldScore: 0.7,
            collaborationInfluenceScore: 0.75,
            stableRecoveryScore: 0.4,
            durableRecoveryScore: 0.2,
            recoveryChainScore: 0.3,
            dormantLineageCount: 0,
            extinctLineageCount: 0,
            backslidingLineageCount: 0,
            survivalClosureScore: 0.1,
            terminalMortalityScore: 0,
          },
        ],
        topParentLineages: [],
      } as never,
    } as never);
    await fs.writeFile(
      resolveGenesisTrajectorySummaryPath(),
      `${JSON.stringify(
        {
          recentTrajectoryCount: 4,
          climateTrajectoryCount: 1,
          survivalTrajectoryCount: 1,
          recoveryTrajectoryCount: 1,
          replicationTrajectoryCount: 1,
          idleTrajectoryCount: 0,
          averageProcessReward: 1.6,
          averageOutcomeReward: 0.8,
          averageTotalReward: 1.36,
          latestMode: "replication",
          lastTrajectoryTs: 150,
          highestRewardFounderOrigin: "builder",
          highestRewardFounderScore: 2.4,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisMetaClawStatePath(),
      `${JSON.stringify(
        {
          idleEligible: true,
          idleOptimizationCount: 2,
          lastOptimizedAt: 160,
          lastTargetFounderOrigin: "builder",
          lastTargetLineageId: "builder_founder",
          lastAction: "boost_focus",
          lastProcessReward: 2.2,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisSocietySummarySync(process.env);

    expect(summary.learningSummary).toMatchObject({
      learningFounderCount: 3,
      trajectoryRewardLeaderOrigin: "builder",
      metaClawTargetFounderOrigin: "builder",
      metaClawOptimizationActive: true,
      highestLearningVelocityFounderOrigin: "builder",
      highestLearningConversionFounderOrigin: "builder",
      highestLearningInheritanceFounderOrigin: "builder",
      highestLearningMomentumFounderOrigin: "builder",
      highestReplicationQualificationFounderOrigin: "builder",
      highestRecoveryQualificationFounderOrigin: "negotiator",
      nicheBalancedFounderCount: 3,
    });
    expect(summary.learningSummary?.learningVelocityLeaders?.map((entry) => entry.founderOrigin)).toEqual([
      "builder",
      "negotiator",
      "scout",
    ]);
    expect(
      summary.learningSummary?.learningConversionLeaders?.map((entry) => entry.founderOrigin),
    ).toEqual(["builder", "negotiator", "scout"]);
    expect(
      summary.learningSummary?.learningConversionLeaders?.[1]?.learningConversionScore ?? 0,
    ).toBeGreaterThan(summary.learningSummary?.learningConversionLeaders?.[2]?.learningConversionScore ?? 0);
    expect(
      summary.learningSummary?.learningInheritanceLeaders?.map((entry) => entry.founderOrigin),
    ).toEqual(["builder", "negotiator", "scout"]);
    expect(summary.learningSummary?.learningInheritanceLeaders?.[0]).toMatchObject({
      founderOrigin: "builder",
      childCount: 2,
      workingChildCount: 2,
      superpowerChildCount: 1,
      childDegradationScore: 2.4,
      superpowerChildDurabilityPenaltyScore: expect.any(Number),
    });
    expect(summary.learningSummary?.learningMomentumLeaders?.[0]).toMatchObject({
      founderOrigin: "builder",
      learningMomentumScore: expect.any(Number),
    });
    expect(summary.learningSummary?.replicationQualificationLeaders?.[0]?.founderOrigin).toBe(
      "builder",
    );
    expect(
      summary.learningSummary?.replicationQualificationLeaders?.map((entry) => entry.founderOrigin),
    ).toEqual(expect.arrayContaining(["builder", "negotiator", "scout"]));
    expect(summary.learningSummary?.replicationQualificationLeaders?.[0]).toMatchObject({
      nicheDistinctivenessScore: expect.any(Number),
      nicheResilienceScore: expect.any(Number),
      nicheIrreplaceabilityScore: expect.any(Number),
    });
    expect(
      summary.learningSummary?.recoveryQualificationLeaders?.map((entry) => entry.founderOrigin),
    ).toEqual(["negotiator", "builder", "scout"]);
    expect(summary.learningSummary?.recoveryQualificationLeaders?.[0]).toMatchObject({
      nicheDistinctivenessScore: expect.any(Number),
      nicheResilienceScore: expect.any(Number),
      nicheIrreplaceabilityScore: expect.any(Number),
    });
    expect(summary.learningSummary?.nicheBalanceLeaders?.map((entry) => entry.founderOrigin)).toEqual(
      expect.arrayContaining(["scout", "negotiator"]),
    );
    expect(summary.learningSummary?.highestNicheBalanceFounderOrigin).not.toBe("builder");
    expect(["scout", "negotiator"]).toContain(
      summary.learningSummary?.highestNicheBalanceFounderOrigin ?? "",
    );
    expect(summary.learningSummary?.nicheBalanceLeaders?.[0]).toMatchObject({
      nicheDistinctivenessScore: expect.any(Number),
      nicheResilienceScore: expect.any(Number),
      nicheIrreplaceabilityScore: expect.any(Number),
    });
    expect(
      (summary.learningSummary?.nicheBalanceLeaders?.[0]?.nicheIrreplaceabilityScore ?? 0) > 0,
    ).toBe(true);
    expect(readGenesisFounderQualificationSync("builder_founder", process.env)).toMatchObject({
      founderOrigin: "builder",
      trajectoryRewardLeader: true,
      metaClawTargeted: true,
    });
    expect(
      readGenesisFounderQualificationSync("builder_founder", process.env).recoveryStageResponsibilities.stressed,
    ).toMatchObject({
      role: "runner-up",
      basis: "transient_recovery",
    });
    expect(
      readGenesisFounderQualificationSync("auditor_founder", process.env).recoveryStageResponsibilities.stressed,
    ).toMatchObject({
      role: "leader",
      basis: "transient_recovery",
    });
    expect(
      readGenesisFounderQualificationSync("builder_founder", process.env).mortalityDebtScore,
    ).toBeGreaterThan(
      readGenesisFounderQualificationSync("scout_founder", process.env).mortalityDebtScore,
    );
    expect(
      readGenesisFounderQualificationSync("builder_founder", process.env).childDegradationScore,
    ).toBeGreaterThan(
      readGenesisFounderQualificationSync("scout_founder", process.env).childDegradationScore,
    );
    expect(
      readGenesisFounderQualificationSync("builder_founder", process.env)
        .superpowerChildDurabilityPenaltyScore,
    ).toBeGreaterThan(
      readGenesisFounderQualificationSync("scout_founder", process.env)
        .superpowerChildDurabilityPenaltyScore,
    );
    expect(
      readGenesisFounderQualificationSync("builder_founder", process.env).longTermDegradationScore,
    ).toBeGreaterThanOrEqual(0);
    expect(
      readGenesisFounderQualificationSync("scout_founder", process.env).longTermDegradationScore,
    ).toBeGreaterThanOrEqual(0);
    expect(
      readGenesisFounderQualificationSync("negotiator_founder", process.env).longTermRecoveryScore,
    ).toBeGreaterThanOrEqual(0);
    expect(
      summary.learningSummary?.replicationQualificationLeaders?.[0]?.longTermDegradationScore,
    ).toBeDefined();
    expect(
      summary.learningSummary?.recoveryQualificationLeaders?.[0]?.longTermRecoveryScore,
    ).toBeDefined();
    expect(readGenesisFounderQualificationSync("builder_founder", process.env).dominancePressure).toBeGreaterThan(0);
    expect(readGenesisFounderQualificationSync("scout_founder", process.env).nicheBalanceScore).toBeGreaterThan(0);
    expect(
      readGenesisFounderQualificationSync("negotiator_founder", process.env).survivalClosureScore,
    ).toBeGreaterThanOrEqual(0);
    expect(
      readGenesisFounderQualificationSync("builder_founder", process.env).terminalMortalityScore,
    ).toBeGreaterThanOrEqual(0);
  });

  it("biases next-plan selection toward lineages with richer skill evolution", async () => {
    await fs.mkdir(path.dirname(resolveGenesisDispatchPlanPath("agent:builder:main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisDispatchPlanPath("agent:builder:main"),
      `${JSON.stringify(
        {
          primaryAgentId: "builder",
          primarySessionKey: "agent:builder:main",
          intensity: 1,
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
      resolveGenesisDispatchPlanPath("agent:auditor:main"),
      `${JSON.stringify(
        {
          primaryAgentId: "auditor",
          primarySessionKey: "agent:auditor:main",
          intensity: 1,
          lane: "workflow",
          dispatchMode: "immediate",
          assignments: [],
          supportSessionKeys: [],
          reviveSessionKeys: [],
          deferredAgentIds: [],
          updatedAt: 99,
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
              lineageId: "builder",
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

    const nextPlan = readNextGenesisSocietyPlanSync(process.env);
    expect(nextPlan.plan).toMatchObject({
      primaryAgentId: "builder",
      primarySessionKey: "agent:builder:main",
    });
  });

  it("surfaces user intent signals and history-driven proactive activity", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    vi.spyOn(lineageSummaryModule, "readGenesisLineageSummarySync").mockReturnValue({
      ecologyCounts: {
        active: 2,
        stressed: 0,
        dormant: 0,
        extinct: 0,
      },
      topLineages: [],
      vitalitySummary: {
        lineageCount: 2,
        childLineageCount: 0,
        workingLineageCount: 2,
        proactiveWorkingLineageCount: 2,
        totalPublicValue: 4,
        totalSurvivalCredit: 3,
        historyDrivenProactiveLineageCount: 2,
        userProfileDrivenProactiveLineageCount: 1,
        userIntentDrivenProactiveYieldScore: 3.2,
        highestUserIntentFounderOrigin: "builder",
        highestUserIntentFounderScore: 2.8,
        userIntentLeaders: [
          {
            founderOrigin: "builder",
            historyIntentScore: 2,
            profileIntentScore: 1,
            userIntentAlignmentScore: 2.8,
            proactiveWorkingLineageCount: 1,
            alignedProactiveYieldScore: 2.5,
          },
          {
            founderOrigin: "negotiator",
            historyIntentScore: 0.8,
            profileIntentScore: 0.6,
            userIntentAlignmentScore: 1.2,
            proactiveWorkingLineageCount: 1,
            alignedProactiveYieldScore: 0.8,
          },
        ],
        founderRoleBreakdown: [
          {
            founderOrigin: "builder",
            lineageCount: 1,
            workingLineageCount: 1,
            proactiveWorkingLineageCount: 1,
            roleAlignedLineageCount: 1,
            roleAlignedProactiveLineageCount: 1,
            activeFocusCount: 2,
            activeTriggerCount: 2,
            historyIntentScore: 2,
            profileIntentScore: 1,
            userIntentAlignmentScore: 2.8,
            publicValue: 2,
            survivalCredit: 1.5,
            proactivePublicValue: 2,
            proactiveSurvivalCredit: 1.5,
            alignedProactiveYieldScore: 2.5,
            proactiveYieldEfficiency: 2.5,
          },
        ],
        topParentLineages: [],
      } as never,
    } as never);
    await fs.writeFile(
      resolveGenesisUserIntentSummaryPath(),
      `${JSON.stringify(
        {
          historyEntryCount: 3,
          searchHistoryCount: 1,
          queryHistoryCount: 1,
          consultationHistoryCount: 1,
          dominantHistoryKind: "query",
          profileVisible: true,
          profileKeywordCount: 9,
          timeWeightedHistorySignalScore: 2.35,
          workProfileSignalScore: 1.9,
          interestProfileSignalScore: 1.15,
          strongestTopicCluster: "workflow_capability",
          strongestTopicSignalScore: 2.6,
          historyDrivenFounderCount: 2,
          profileDrivenFounderCount: 2,
          proactiveIntentFounderCount: 2,
          longTermIntentFounderCount: 2,
          highestIntentFounderOrigin: "builder",
          highestIntentFounderScore: 2.8,
          highestLongTermIntentFounderOrigin: "builder",
          highestLongTermIntentFounderScore: 3.4,
          historySignalScore: 2.8,
          profileSignalScore: 1.6,
          combinedSignalScore: 4.4,
          topicClusters: [
            {
              cluster: "workflow_capability",
              weightedSignalScore: 2.6,
              historySignalScore: 1.8,
              profileSignalScore: 0.8,
            },
            {
              cluster: "coordination_recovery",
              weightedSignalScore: 1.7,
              historySignalScore: 0.9,
              profileSignalScore: 0.8,
            },
          ],
          recentKeywords: ["workflow", "automation", "coordination"],
          founderIntentLeaders: [
            {
              founderOrigin: "builder",
              historyIntentScore: 2,
              timeWeightedHistoryIntentScore: 1.7,
              profileIntentScore: 1,
              workProfileIntentScore: 1.1,
              interestProfileIntentScore: 0.4,
              userIntentAlignmentScore: 2.8,
              longTermIntentAlignmentScore: 3.4,
              matchedTopicClusters: ["workflow_capability", "coordination_recovery"],
              matchedHistoryCount: 2,
              matchedProfileKeywordCount: 2,
            },
            {
              founderOrigin: "negotiator",
              historyIntentScore: 0.8,
              timeWeightedHistoryIntentScore: 0.65,
              profileIntentScore: 0.6,
              workProfileIntentScore: 0.25,
              interestProfileIntentScore: 0.7,
              userIntentAlignmentScore: 1.2,
              longTermIntentAlignmentScore: 1.55,
              matchedTopicClusters: ["coordination_recovery"],
              matchedHistoryCount: 1,
              matchedProfileKeywordCount: 1,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisSocietySummarySync(process.env);

    expect(summary.userIntentSummary).toMatchObject({
      historyEntryCount: 3,
      profileVisible: true,
      highestIntentFounderOrigin: "builder",
      combinedSignalScore: 4.4,
      strongestTopicCluster: "workflow_capability",
      highestLongTermIntentFounderOrigin: "builder",
    });
    expect(summary.vitalitySummary).toMatchObject({
      historyDrivenProactiveLineageCount: 2,
      userProfileDrivenProactiveLineageCount: 1,
      highestUserIntentFounderOrigin: "builder",
    });
  });
});
