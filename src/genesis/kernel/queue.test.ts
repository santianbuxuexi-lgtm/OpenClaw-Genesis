import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueSystemEvent, resetSystemEventsForTest } from "../../infra/system-events.js";
import { resolveGenesisQueuePriority } from "./queue.js";
import { resolveGenesisLineageSummaryPath } from "./state.js";
import * as societyQuery from "./society-query.js";
import * as stateKernel from "./state.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-queue-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  resetSystemEventsForTest();
});

afterEach(async () => {
  resetSystemEventsForTest();
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis queue priority", () => {
  it("raises dormant lineages when a reactivation shock is pending", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("main")}.json`),
      JSON.stringify({
        lineageId: "main",
        latestSessionKey: "agent:main:main",
        completionCount: 1,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 1,
        publicValue: 0,
        privateValue: 0,
        survivalCredit: 0.4,
        expansionCredit: 0.2,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 1,
        totalRunCompletions: 0,
        cumulativeIntensity: 0.6,
        currentPressure: 0.6,
        triggerCounts: { cron: 0, heartbeat: 1, workflow: 0 },
        updatedAt: 1,
      }),
    );

    const baseline = resolveGenesisQueuePriority({ sessionKey: "agent:main:main", lane: "main" });
    enqueueSystemEvent("Exec finished (gateway id=abc, code 1)", {
      sessionKey: "agent:main:main",
      contextKey: "exec:abc",
    });
    await vi.waitFor(async () => {
      const worldState = JSON.parse(
        await fs.readFile(path.join(stateDir, "genesis", "world-state.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect((worldState.totalEnvironmentEvents as number | undefined) ?? 0).toBeGreaterThan(1);
    });
    const boosted = resolveGenesisQueuePriority({ sessionKey: "agent:main:main", lane: "main" });

    expect(baseline.ecologyState).toBe("dormant");
    expect(boosted.reactivationPending).toBe(true);
    expect(boosted.priority).toBeGreaterThan(baseline.priority);
  });

  it("deprioritizes stressed lineages with no pending shock", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder")}.json`),
      JSON.stringify({
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 1.2,
        expansionCredit: 0.5,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 1.5,
        currentPressure: 1.1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 0 },
        updatedAt: 1,
      }),
    );

    const decision = resolveGenesisQueuePriority({ sessionKey: "agent:builder:main", lane: "main" });
    expect(decision.ecologyState).toBe("stressed");
    expect(decision.priority).toBeLessThan(0);
  });

  it("boosts queue priority for sessions carrying Genesis society assignments", async () => {
    const now = Date.now();
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis", "dispatch-assignments"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder")}.json`),
      JSON.stringify({
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 5,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 2,
        privateValue: 1,
        survivalCredit: 2.5,
        expansionCredit: 1,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 2,
        cumulativeIntensity: 2,
        currentPressure: 0.4,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(
        stateDir,
        "genesis",
        "dispatch-assignments",
        `${encodeURIComponent("agent:builder:main")}.json`,
      ),
      JSON.stringify({
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1.2,
        lane: "workflow",
        dispatchMode: "emergency",
        updatedAt: now,
        assignment: {
          agentId: "builder",
          sessionKey: "agent:builder:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
      }),
    );

    const decision = resolveGenesisQueuePriority({
      sessionKey: "agent:builder:main",
      lane: "workflow",
    });

    expect(decision.assignmentBias).toBe(3);
    expect(decision.priority).toBeGreaterThanOrEqual(5);
  });

  it("ignores stale Genesis society assignments when calculating queue priority", async () => {
    const now = Date.now();
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis", "dispatch-assignments"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder")}.json`),
      JSON.stringify({
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 5,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 2,
        privateValue: 1,
        survivalCredit: 2.5,
        expansionCredit: 1,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 2,
        cumulativeIntensity: 2,
        currentPressure: 0.4,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(
        stateDir,
        "genesis",
        "dispatch-assignments",
        `${encodeURIComponent("agent:builder:main")}.json`,
      ),
      JSON.stringify({
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1.2,
        lane: "workflow",
        dispatchMode: "emergency",
        updatedAt: now - 30 * 60_000,
        assignment: {
          agentId: "builder",
          sessionKey: "agent:builder:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
      }),
    );

    const decision = resolveGenesisQueuePriority({
      sessionKey: "agent:builder:main",
      lane: "workflow",
    });

    expect(decision.assignmentBias).toBe(0);
  });

  it("uses experiment profile to soften stressed queue penalties", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder")}.json`),
      JSON.stringify({
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 1.2,
        expansionCredit: 0.5,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 1.5,
        currentPressure: 1.1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 0 },
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "experiment-profile.json"),
      JSON.stringify({
        queueStressedEcologyPenalty: -1,
      }),
    );

    const decision = resolveGenesisQueuePriority({ sessionKey: "agent:builder:main", lane: "main" });
    expect(decision.ecologyState).toBe("stressed");
    expect(decision.priority).toBeLessThan(0);
    expect(decision.recoveryQualificationBias).toBeGreaterThan(0);
    expect(decision.mortalityBackslidePenalty).toBeGreaterThan(0);
  });

  it("lets skill evolution increase queue priority for stronger evolving lineages", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder")}.json`),
      JSON.stringify({
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 2,
        expansionCredit: 1,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 1.5,
        currentPressure: 0.25,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 0 },
        updatedAt: 1,
      }),
    );
    const baseline = resolveGenesisQueuePriority({ sessionKey: "agent:builder:main", lane: "main" });
    await fs.writeFile(
      path.join(stateDir, "genesis", "skill-evolution-summary.json"),
      JSON.stringify({
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
      }),
    );

    const decision = resolveGenesisQueuePriority({ sessionKey: "agent:builder:main", lane: "main" });

    expect(decision.skillEvolutionBias).toBeGreaterThan(1.5);
    expect(decision.priority).toBeGreaterThan(baseline.priority);
  });

  it("lets higher recovery qualification bias reactivate priority toward stronger recovery founders", async () => {
    const now = Date.now();
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis", "dispatch-assignments"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineage-summary.json"),
      JSON.stringify({
        vitalitySummary: {
          founderRoleBreakdown: [
            {
              founderOrigin: "negotiator",
              proactiveYieldEfficiency: 1,
              alignedProactiveYieldScore: 1,
              cooperativeYieldScore: 1.1,
              recoveryChainScore: 2.4,
              stableRecoveryScore: 2,
              durableRecoveryScore: 2.2,
            },
            {
              founderOrigin: "creator",
              proactiveYieldEfficiency: 1,
              alignedProactiveYieldScore: 1,
              cooperativeYieldScore: 0.8,
              recoveryChainScore: 0.5,
              stableRecoveryScore: 0.4,
              durableRecoveryScore: 0.2,
            },
          ],
        },
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "trajectory-summary.json"),
      JSON.stringify({
        recentTrajectoryCount: 3,
        climateTrajectoryCount: 1,
        survivalTrajectoryCount: 1,
        recoveryTrajectoryCount: 1,
        replicationTrajectoryCount: 0,
        idleTrajectoryCount: 1,
        averageProcessReward: 1.8,
        averageOutcomeReward: 0.9,
        averageTotalReward: 1.53,
        latestMode: "idle",
        highestRewardFounderOrigin: "negotiator",
        highestRewardFounderScore: 2.2,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "metaclaw-state.json"),
      JSON.stringify({
        idleEligible: true,
        idleOptimizationCount: 1,
        lastOptimizedAt: now,
        lastTargetFounderOrigin: "negotiator",
        lastTargetLineageId: "negotiator_founder",
        lastAction: "stabilize_recovery",
        lastProcessReward: 1.8,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("negotiator_founder")}.json`),
      JSON.stringify({
        lineageId: "negotiator_founder",
        latestSessionKey: "agent:negotiator:main",
        completionCount: 2,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 0.5,
        privateValue: 0,
        survivalCredit: 0.4,
        expansionCredit: 0.2,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("creator_founder")}.json`),
      JSON.stringify({
        lineageId: "creator_founder",
        latestSessionKey: "agent:creator:main",
        completionCount: 2,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 0.5,
        privateValue: 0,
        survivalCredit: 0.4,
        expansionCredit: 0.2,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 1.5,
        currentPressure: 1.2,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 0 },
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(
        stateDir,
        "genesis",
        "dispatch-assignments",
        `${encodeURIComponent("agent:negotiator:main")}.json`,
      ),
      JSON.stringify({
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1.1,
        lane: "workflow",
        dispatchMode: "emergency",
        updatedAt: now,
        assignment: {
          agentId: "negotiator",
          sessionKey: "agent:negotiator:main",
          mode: "revive",
          action: "reactivate",
          ecologyState: "dormant",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 0,
        },
      }),
    );
    await fs.writeFile(
      path.join(
        stateDir,
        "genesis",
        "dispatch-assignments",
        `${encodeURIComponent("agent:creator:main")}.json`,
      ),
      JSON.stringify({
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1.1,
        lane: "workflow",
        dispatchMode: "emergency",
        updatedAt: now,
        assignment: {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "revive",
          action: "reactivate",
          ecologyState: "dormant",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 0,
        },
      }),
    );

    const negotiatorDecision = resolveGenesisQueuePriority({
      sessionKey: "agent:negotiator:main",
      lane: "workflow",
    });
    const creatorDecision = resolveGenesisQueuePriority({
      sessionKey: "agent:creator:main",
      lane: "workflow",
    });

    expect(negotiatorDecision.recoveryQualificationBias).toBeGreaterThan(
      creatorDecision.recoveryQualificationBias,
    );
    expect(negotiatorDecision.durableRecoveryBias).toBeGreaterThan(
      creatorDecision.durableRecoveryBias,
    );
    expect(negotiatorDecision.trajectoryLearningBias).toBeGreaterThan(
      creatorDecision.trajectoryLearningBias,
    );
    expect(negotiatorDecision.metaClawActivationBias).toBeGreaterThan(
      creatorDecision.metaClawActivationBias,
    );
    expect(negotiatorDecision.priority).toBeGreaterThan(creatorDecision.priority);
  });

  it("applies stage responsibility bias so the current recovery-stage owner gets the real queue edge", async () => {
    const qualificationSpy = vi
      .spyOn(societyQuery, "readGenesisFounderQualificationSync")
      .mockImplementation((lineageId: string) => {
        const founderOrigin = lineageId.startsWith("auditor")
          ? "auditor"
          : lineageId.startsWith("creator")
            ? "creator"
            : "builder";
        const stageResponsibilities = {
          stressed:
            founderOrigin === "auditor"
              ? { score: 4.2, role: "leader" as const, basis: "transient_recovery" as const }
              : founderOrigin === "creator"
                ? { score: 2.1, role: "runner-up" as const, basis: "transient_recovery" as const }
                : { score: 0, role: null, basis: null },
          dormant: { score: 0, role: null, basis: null },
          extinct: { score: 0, role: null, basis: null },
          recoverable: { score: 0, role: null, basis: null },
          stable: { score: 0, role: null, basis: null },
        };
        return {
          founderOrigin,
          replicationQualificationScore: 0,
          replicationQualificationLeader: false,
          recoveryQualificationScore: founderOrigin === "auditor" ? 2.4 : 1.8,
          recoveryQualificationLeader: founderOrigin === "auditor",
          nicheBalanceScore: 0,
          nicheBalanceLeader: false,
          dominancePressure: 0,
          trajectoryRewardScore: 0,
          trajectoryRewardLeader: false,
          metaClawActivationScore: 0,
          metaClawTargeted: false,
          learningMomentumScore: 0,
          replicationLearningMomentumScore: 0,
          recoveryLearningMomentumScore: 0,
          learningActivationScore: 0,
          mortalityScore: 0.2,
          mortalityDebtScore: 0,
          childDegradationScore: 0,
          superpowerChildDurabilityPenaltyScore: 0,
          superpowerChildDurabilityScore: 0,
          longTermDegradationScore: 0,
          longTermRecoveryScore: 0,
          multiGenerationEffectiveScore: 0,
          terminalMortalityScore: 0,
          stableRecoveryScore: founderOrigin === "auditor" ? 1.2 : 1.1,
          durableRecoveryScore: founderOrigin === "auditor" ? 1.1 : 1,
          recoveryChainScore: founderOrigin === "auditor" ? 0.9 : 0.7,
          survivalClosureScore: 0.3,
          supportCooperationScore: 0.2,
          reviveCooperationScore: 0.25,
          transientRecoveryRate: founderOrigin === "auditor" ? 1.4 : 0.8,
          stableRecoveryRate: 0.6,
          durableRecoveryRate: 0.5,
          recoveryStageResponsibilities: stageResponsibilities,
        };
      });
    const lineageSpy = vi
      .spyOn(stateKernel, "readGenesisLineageRecordSync")
      .mockImplementation((lineageId: string) => ({
        lineageId,
        latestSessionKey: `agent:${lineageId}:main`,
        completionCount: 1,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 0.3,
        privateValue: 0,
        survivalCredit: 0.25,
        expansionCredit: 0.1,
        updatedAt: 1,
      }));
    const dispatchSpy = vi
      .spyOn(stateKernel, "resolveGenesisLineageDispatchDecision")
      .mockReturnValue({
        ecologyState: "stressed",
        revivePending: false,
        reactivationPending: false,
        shockPriority: 0,
      } as never);

    const auditorDecision = resolveGenesisQueuePriority({ lineageId: "auditor_founder", lane: "main" });
    const creatorDecision = resolveGenesisQueuePriority({ lineageId: "creator_founder", lane: "main" });

    expect(auditorDecision.recoveryStage).toBe("stressed");
    expect(auditorDecision.recoveryStageResponsibilityRole).toBe("leader");
    expect(creatorDecision.recoveryStageResponsibilityRole).toBe("runner-up");
    expect(auditorDecision.recoveryStageResponsibilityBias).toBeGreaterThan(
      creatorDecision.recoveryStageResponsibilityBias,
    );
    expect(auditorDecision.priority).toBeGreaterThan(creatorDecision.priority);

    qualificationSpy.mockRestore();
    lineageSpy.mockRestore();
    dispatchSpy.mockRestore();
  });

  it("pushes low-quality stressed founders further back in the recovery queue", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineage-summary.json"),
      JSON.stringify({
        vitalitySummary: {
          founderRoleBreakdown: [
            {
              founderOrigin: "builder",
              mortalityScore: 0.8,
              terminalMortalityScore: 0.1,
              stableRecoveryScore: 1.2,
              durableRecoveryScore: 1.1,
              recoveryChainScore: 1.4,
              survivalClosureScore: 0.9,
              supportCooperationScore: 1.1,
              reviveCooperationScore: 0.5,
              transientRecoveryRate: 0.7,
              stableRecoveryRate: 0.8,
              durableRecoveryRate: 0.75,
            },
            {
              founderOrigin: "auditor",
              mortalityScore: 2.1,
              terminalMortalityScore: 0.8,
              stableRecoveryScore: 0.15,
              durableRecoveryScore: 0.1,
              recoveryChainScore: 0.2,
              survivalClosureScore: 0.1,
              supportCooperationScore: 0.05,
              reviveCooperationScore: 0.05,
              transientRecoveryRate: 0.1,
              stableRecoveryRate: 0.08,
              durableRecoveryRate: 0.05,
            },
          ],
        },
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 2,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 0.4,
        privateValue: 0,
        survivalCredit: 0.1,
        expansionCredit: 0.2,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("auditor_founder")}.json`),
      JSON.stringify({
        lineageId: "auditor_founder",
        latestSessionKey: "agent:auditor:main",
        completionCount: 0,
        lastCompletionTs: 1,
        accumulatedPrivilegeTax: 0,
        publicValue: 0,
        privateValue: 0,
        survivalCredit: 0.02,
        expansionCredit: 0.1,
        updatedAt: 1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 1.5,
        currentPressure: 1.2,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 0 },
        updatedAt: 1,
      }),
    );

    const builderDecision = resolveGenesisQueuePriority({
      lineageId: "builder_founder",
      lane: "main",
    });
    const auditorDecision = resolveGenesisQueuePriority({
      lineageId: "auditor_founder",
      lane: "main",
    });

    expect(builderDecision.ecologyState).not.toBe("active");
    expect(auditorDecision.ecologyState).not.toBe("active");
    expect(auditorDecision.mortalityEligibilityPenalty).toBeGreaterThan(
      builderDecision.mortalityEligibilityPenalty,
    );
    expect(auditorDecision.priority).toBeLessThan(builderDecision.priority);
  });

  it("erodes sustained queue advantage for superpower children under high founder mortality debt", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 2,
        cumulativeIntensity: 1.8,
        currentPressure: 0.7,
        stormMomentum: 0.8,
        replicationBoost: 0.5,
        triggerCounts: { cron: 0, heartbeat: 1, workflow: 1 },
        updatedAt: 3,
      }),
    );
    const qualificationSpy = vi
      .spyOn(societyQuery, "readGenesisFounderQualificationSync")
      .mockReturnValue({
        founderOrigin: "builder",
        replicationQualificationScore: 4,
        replicationQualificationLeader: true,
        recoveryQualificationScore: 1,
        recoveryQualificationLeader: false,
        nicheBalanceScore: 0.5,
        nicheBalanceLeader: false,
        dominancePressure: 0.2,
        trajectoryRewardScore: 0,
        trajectoryRewardLeader: false,
        metaClawActivationScore: 0,
        metaClawTargeted: false,
        learningActivationScore: 0,
        mortalityScore: 3.2,
        mortalityDebtScore: 2.4,
        childDegradationScore: 3.4,
        terminalMortalityScore: 0.8,
        stableRecoveryScore: 0.7,
        durableRecoveryScore: 0.2,
        recoveryChainScore: 0.25,
        survivalClosureScore: 0.1,
        supportCooperationScore: 0.2,
        reviveCooperationScore: 0.1,
        transientRecoveryRate: 0.15,
        stableRecoveryRate: 0.2,
        durableRecoveryRate: 0.05,
        recoveryStageResponsibilities: {
          stressed: { score: 0, role: null, basis: null },
          dormant: { score: 0, role: null, basis: null },
          extinct: { score: 0, role: null, basis: null },
          recoverable: { score: 0, role: null, basis: null },
          stable: { score: 0, role: null, basis: null },
        },
      });
    const recordSpy = vi
      .spyOn(stateKernel, "readGenesisLineageRecordSync")
      .mockImplementation((lineageId: string) => {
        if (lineageId === "builder::subagent::elite") {
          return {
            lineageId,
            parentLineageId: "builder",
            inheritanceMode: "hybrid",
            specialtyOrigin: "builder",
            superpowerInherited: true,
            latestSessionKey: "agent:builder:subagent:elite",
            completionCount: 1,
            lastCompletionTs: 3,
            lastReason: "heartbeat",
            accumulatedPrivilegeTax: 0,
            publicValue: 0.8,
            privateValue: 0.2,
            survivalCredit: 0.7,
            expansionCredit: 0.25,
            updatedAt: 3,
          };
        }
        if (lineageId === "builder::subagent::specialist") {
          return {
            lineageId,
            parentLineageId: "builder",
            inheritanceMode: "specialty",
            specialtyOrigin: "builder",
            superpowerInherited: false,
            latestSessionKey: "agent:builder:subagent:specialist",
            completionCount: 1,
            lastCompletionTs: 3,
            lastReason: "heartbeat",
            accumulatedPrivilegeTax: 0,
            publicValue: 0.8,
            privateValue: 0.2,
            survivalCredit: 0.7,
            expansionCredit: 0.25,
            updatedAt: 3,
          };
        }
        return null;
      });

    const superpowerDecision = resolveGenesisQueuePriority({
      lineageId: "builder::subagent::elite",
      lane: "main",
    });
    const specialtyDecision = resolveGenesisQueuePriority({
      lineageId: "builder::subagent::specialist",
      lane: "main",
    });

    expect(superpowerDecision.superpowerSustainPenalty).toBeGreaterThan(0);
    expect(specialtyDecision.superpowerSustainPenalty).toBe(0);
    expect(superpowerDecision.priority).toBeLessThan(specialtyDecision.priority);
    qualificationSpy.mockRestore();
    recordSpy.mockRestore();
  });
});
