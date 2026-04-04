import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeGenesisSpawn } from "./spawn.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-spawn-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis spawn authorization", () => {
  it("blocks unsandboxed child expansion when the requester is still sandboxed", async () => {
    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "lab",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "all",
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "openclaw_guard_requester_sandboxed",
      parentLineageId: "builder_founder",
      inheritanceMode: "hybrid",
      specialtyOrigin: "builder",
      superpowerInherited: true,
      privilegeInheritanceReason: "genesis_lab_allowlist",
      runtimeProfile: "lab",
      privilegeTaxPreview: 2.5,
    });
    expect(decision.childLineageId).toBeUndefined();
  });

  it("allows spawn when no privilege escalation is requested", async () => {
    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "creator_founder",
      requestedProfile: "creator",
      runtimePath: "acp",
      requesterSandboxMode: "all",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("genesis_spawn_allowed");
    expect(decision.parentLineageId).toBe("creator_founder");
    expect(decision.inheritanceMode).toBe("specialty");
    expect(decision.specialtyOrigin).toBe("creator");
    expect(decision.superpowerInherited).toBe(false);
    expect(decision.privilegeInheritanceReason).toBe("specialty_only");
    expect(decision.runtimeProfile).toBe("observe");
    expect(decision.privilegeTaxPreview).toBe(0);
    expect(decision.childLineageId).toContain("creator_founder::acp::");
  });

  it("allows privileged spawn once the requester already runs unsandboxed", async () => {
    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "lab",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
      childSessionKey: "builder_founder::subagent::child-1",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "genesis_lab_allowlist",
      parentLineageId: "builder_founder",
      childLineageId: "builder_founder::subagent::child-1",
      inheritanceMode: "hybrid",
      specialtyOrigin: "builder",
      superpowerInherited: true,
      privilegeInheritanceReason: "genesis_lab_allowlist",
      runtimeProfile: "lab",
      privilegeTaxPreview: 2.5,
      superpowerInheritanceScore: 0,
      superpowerInheritancePressureBonus: 0,
      superpowerInheritanceContributionBonus: 0,
    });
  });

  it("blocks spawn when expansion credit is below the current pressure threshold", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 2,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 2,
        expansionCredit: 0.2,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 1,
        cumulativeIntensity: 3,
        currentPressure: 1.5,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "genesis_spawn_mortality_screened",
      inheritanceMode: "specialty",
      specialtyOrigin: "builder",
      superpowerInherited: false,
      privilegeInheritanceReason: "specialty_only",
    });
  });

  it("throttles stressed lineages to a smaller active child quota", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 4,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 1,
        expansionCredit: 0.4,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 1,
        currentPressure: 1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 0 },
        updatedAt: 10,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
      activeChildren: 1,
      configuredMaxChildren: 5,
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "genesis_spawn_quota_exhausted",
      inheritanceMode: "specialty",
      specialtyOrigin: "builder",
      superpowerInherited: false,
      privilegeInheritanceReason: "quota_exhausted",
    });
  });

  it("lets storm pressure accelerate replication by lowering expansion thresholds", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("creator_founder")}.json`),
      JSON.stringify({
        lineageId: "creator_founder",
        latestSessionKey: "agent:creator:main",
        completionCount: 5,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0,
        publicValue: 2,
        privateValue: 1,
        survivalCredit: 2,
        expansionCredit: 0.2,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 4,
        totalRunCompletions: 2,
        cumulativeIntensity: 4.5,
        currentPressure: 1.2,
        stormMomentum: 2,
        replicationBoost: 1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 2 },
        updatedAt: 10,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "creator_founder",
      requestedProfile: "creator",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "genesis_spawn_allowed",
      inheritanceMode: "specialty",
      specialtyOrigin: "creator",
      superpowerInherited: false,
      privilegeInheritanceReason: "specialty_only",
    });
  });

  it("uses experiment profile to relax spawn thresholds under the same pressure", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 2,
        lastCompletionTs: 10,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 2,
        expansionCredit: 0.2,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 1,
        cumulativeIntensity: 3,
        currentPressure: 1.5,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "experiment-profile.json"),
      JSON.stringify({
        normalSpawnPressureGain: 0,
        normalSpawnBaseExpansion: 0.15,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "genesis_spawn_allowed",
    });
  });

  it("lets skill evolution lower spawn thresholds for stronger lineages", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("creator_founder")}.json`),
      JSON.stringify({
        lineageId: "creator_founder",
        latestSessionKey: "agent:creator:main",
        completionCount: 4,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 1,
        survivalCredit: 2,
        expansionCredit: 0.18,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 2,
        totalRunCompletions: 1,
        cumulativeIntensity: 2,
        currentPressure: 1,
        triggerCounts: { cron: 1, heartbeat: 0, workflow: 1 },
        updatedAt: 10,
      }),
    );

    const baseline = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "creator_founder",
      requestedProfile: "creator",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });
    expect(baseline).toMatchObject({
      allowed: false,
      reason: "genesis_expansion_credit_insufficient",
    });

    await fs.writeFile(
      path.join(stateDir, "genesis", "skill-evolution-summary.json"),
      JSON.stringify({
        recentEventCount: 4,
        modeCounts: {
          fix: 0,
          derived: 2,
          captured: 2,
        },
        topLineages: [
          {
            lineageId: "creator_founder",
            eventCount: 4,
            fixCount: 0,
            derivedCount: 2,
            capturedCount: 2,
            lastMode: "captured",
          },
        ],
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "creator_founder",
      requestedProfile: "creator",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "genesis_spawn_allowed",
    });
  });

  it("lets high-pressure high-contribution lineages inherit superpower paths more easily", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("scout_founder")}.json`),
      JSON.stringify({
        lineageId: "scout_founder",
        latestSessionKey: "agent:scout:main",
        completionCount: 7,
        lastCompletionTs: 10,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 2.5,
        privateValue: 0.4,
        survivalCredit: 2.2,
        expansionCredit: 0.8,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 6,
        totalRunCompletions: 3,
        cumulativeIntensity: 6,
        currentPressure: 1.6,
        stormMomentum: 1.4,
        replicationBoost: 0.8,
        triggerCounts: { cron: 1, heartbeat: 2, workflow: 3 },
        updatedAt: 10,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "scout_founder",
      requestedProfile: "scout",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "genesis_pressure_contribution_inheritance",
      inheritanceMode: "hybrid",
      specialtyOrigin: "scout",
      superpowerInherited: true,
      privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
      runtimeProfile: "observe",
    });
    expect(decision.superpowerInheritancePressureBonus).toBeGreaterThan(1);
    expect(decision.superpowerInheritanceContributionBonus).toBeGreaterThan(2);
    expect(decision.superpowerInheritanceScore).toBeGreaterThanOrEqual(2.5);
  });

  it("lets higher replication qualification relax spawn thresholds for stronger founders", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineage-summary.json"),
      JSON.stringify({
        vitalitySummary: {
          founderRoleBreakdown: [
            {
              founderOrigin: "builder",
              proactiveYieldEfficiency: 2.1,
              alignedProactiveYieldScore: 2.4,
              cooperativeYieldScore: 1.2,
              recoveryChainScore: 0.6,
              replicationValueScore: 2.4,
              climateReplicationValueScore: 1.1,
              survivalReplicationValueScore: 0.9,
              childCount: 2,
              workingChildCount: 2,
              proactiveChildCount: 1,
              superpowerChildCount: 1,
            },
            {
              founderOrigin: "creator",
              proactiveYieldEfficiency: 0.6,
              alignedProactiveYieldScore: 0.5,
              cooperativeYieldScore: 0.3,
              recoveryChainScore: 0.2,
              replicationValueScore: 0.2,
              climateReplicationValueScore: 0,
              survivalReplicationValueScore: 0,
              childCount: 1,
              workingChildCount: 0,
              proactiveChildCount: 0,
              superpowerChildCount: 0,
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
        completionCount: 3,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0,
        publicValue: 1.2,
        privateValue: 0,
        survivalCredit: 1.8,
        expansionCredit: 0.12,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("creator_founder")}.json`),
      JSON.stringify({
        lineageId: "creator_founder",
        latestSessionKey: "agent:creator:main",
        completionCount: 3,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0,
        publicValue: 1.2,
        privateValue: 0,
        survivalCredit: 1.8,
        expansionCredit: 0.12,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 1,
        totalRunCompletions: 1,
        cumulativeIntensity: 1,
        currentPressure: 0,
        triggerCounts: { cron: 0, heartbeat: 1, workflow: 0 },
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "trajectory-summary.json"),
      JSON.stringify({
        recentTrajectoryCount: 2,
        climateTrajectoryCount: 1,
        survivalTrajectoryCount: 0,
        recoveryTrajectoryCount: 0,
        replicationTrajectoryCount: 1,
        idleTrajectoryCount: 0,
        averageProcessReward: 1.6,
        averageOutcomeReward: 0.7,
        averageTotalReward: 1.33,
        latestMode: "replication",
        highestRewardFounderOrigin: "builder",
        highestRewardFounderScore: 2.1,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "metaclaw-state.json"),
      JSON.stringify({
        idleEligible: true,
        idleOptimizationCount: 1,
        lastOptimizedAt: 11,
        lastTargetFounderOrigin: "builder",
        lastTargetLineageId: "builder_founder",
        lastAction: "boost_focus",
        lastProcessReward: 1.6,
      }),
    );

    const builderDecision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });
    const creatorDecision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "creator_founder",
      requestedProfile: "creator",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(builderDecision).toMatchObject({
      allowed: true,
      reason: "genesis_spawn_allowed",
    });
    expect(builderDecision.replicationQualificationScore).toBeGreaterThan(creatorDecision.replicationQualificationScore);
    expect(builderDecision.replicationQualificationDiscount).toBeGreaterThan(creatorDecision.replicationQualificationDiscount);
    expect(builderDecision.trajectoryLearningScore).toBeGreaterThan(creatorDecision.trajectoryLearningScore);
    expect(builderDecision.metaClawActivationScore).toBeGreaterThan(creatorDecision.metaClawActivationScore);
    expect(builderDecision.learningActivationDiscount).toBeGreaterThan(creatorDecision.learningActivationDiscount);
    expect(creatorDecision).toMatchObject({
      allowed: true,
      reason: "genesis_spawn_allowed",
    });
  });

  it("raises spawn screening pressure for near-death passive lineages", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("auditor_founder")}.json`),
      JSON.stringify({
        lineageId: "auditor_founder",
        latestSessionKey: "agent:auditor:main",
        completionCount: 0,
        lastCompletionTs: 10,
        lastReason: "workflow",
        accumulatedPrivilegeTax: 0,
        publicValue: 0,
        privateValue: 0,
        survivalCredit: 1,
        expansionCredit: 0.2,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 1,
        cumulativeIntensity: 2,
        currentPressure: 1.1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "auditor_founder",
      requestedProfile: "auditor",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("genesis_spawn_mortality_screened");
    expect(decision.mortalityScreeningPenalty).toBeGreaterThan(0.2);
  });

  it("lets productive stressed founders survive mortality screening under the same pressure", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 10,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 1.4,
        privateValue: 0.2,
        survivalCredit: 0.95,
        expansionCredit: 0.5,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 1,
        cumulativeIntensity: 2,
        currentPressure: 1.1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );

    const decision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("genesis_spawn_allowed");
    expect(decision.mortalityScreeningPenalty).toBeLessThan(0.3);
  });

  it("lets dormant and extinct lineage debt suppress learning and inheritance advantages over time", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 4,
        lastCompletionTs: 10,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 1.4,
        privateValue: 0.3,
        survivalCredit: 1.1,
        expansionCredit: 0.65,
        ecologyState: "active",
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "world-state.json"),
      JSON.stringify({
        totalEnvironmentEvents: 3,
        totalRunCompletions: 2,
        cumulativeIntensity: 2,
        currentPressure: 0.9,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "trajectory-summary.json"),
      JSON.stringify({
        recentTrajectoryCount: 3,
        climateTrajectoryCount: 1,
        survivalTrajectoryCount: 1,
        recoveryTrajectoryCount: 0,
        replicationTrajectoryCount: 1,
        idleTrajectoryCount: 0,
        averageProcessReward: 1.5,
        averageOutcomeReward: 0.8,
        averageTotalReward: 1.29,
        latestMode: "replication",
        highestRewardFounderOrigin: "builder",
        highestRewardFounderScore: 2.2,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "metaclaw-state.json"),
      JSON.stringify({
        idleEligible: true,
        idleOptimizationCount: 1,
        lastOptimizedAt: 11,
        lastTargetFounderOrigin: "builder",
        lastTargetLineageId: "builder_founder",
        lastAction: "boost_focus",
        lastProcessReward: 1.5,
      }),
    );

    const writeBreakdown = async (dormantCount: number, extinctCount: number, backslidingCount: number) => {
      await fs.writeFile(
        path.join(stateDir, "genesis", "lineage-summary.json"),
        JSON.stringify({
          ecologyCounts: { active: 1, stressed: 0, dormant: dormantCount, extinct: extinctCount },
          topLineages: [],
          vitalitySummary: {
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
                publicValue: 2,
                survivalCredit: 1.1,
                proactivePublicValue: 1.5,
                proactiveSurvivalCredit: 1,
                alignedProactiveYieldScore: 1.6,
                proactiveYieldEfficiency: 1.4,
                replicationValueScore: 1.7,
                climateReplicationValueScore: 1.1,
                survivalReplicationValueScore: 0.8,
                childCount: 1,
                workingChildCount: 1,
                proactiveChildCount: 1,
                superpowerChildCount: 1,
                cooperativeYieldScore: 1.2,
                collaborationInfluenceScore: 1,
                stableRecoveryScore: 0.9,
                durableRecoveryScore: 0.8,
                recoveryChainScore: 0.7,
                dormantLineageCount: dormantCount,
                extinctLineageCount: extinctCount,
                backslidingLineageCount: backslidingCount,
                survivalClosureScore: 0.35,
                terminalMortalityScore: extinctCount > 0 ? 0.8 : 0,
              },
            ],
          },
        }),
      );
    };

    await writeBreakdown(0, 0, 0);
    const cleanDecision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    await writeBreakdown(2, 1, 3);
    const debtDecision = await authorizeGenesisSpawn({
      cfg: {
        genesis: {
          runtimeProfile: "observe",
          hostAllowlist: ["builder"],
        },
      } as never,
      parentLineageId: "builder_founder",
      requestedProfile: "builder",
      runtimePath: "subagent",
      requesterSandboxMode: "off",
    });

    expect(cleanDecision.learningActivationDiscount).toBeGreaterThan(
      debtDecision.learningActivationDiscount,
    );
    expect(cleanDecision.replicationQualificationDiscount).toBeGreaterThan(
      debtDecision.replicationQualificationDiscount,
    );
    expect(cleanDecision.superpowerInheritanceScore).toBeGreaterThan(
      debtDecision.superpowerInheritanceScore,
    );
  });
});
