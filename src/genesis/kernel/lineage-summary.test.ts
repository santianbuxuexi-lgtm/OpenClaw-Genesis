import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readGenesisLineageSummarySnapshotSync,
  readGenesisLineageSummarySync,
  refreshGenesisLineageSummarySnapshotSync,
} from "./lineage-summary.js";
import {
  writeGenesisLineageFocusItemsSync,
  writeGenesisLineageTriggersSync,
} from "./focus.js";
import {
  resolveGenesisLineageRecordPath,
  resolveGenesisDispatchPlanPath,
  resolveGenesisSkillEvolutionSummaryPath,
  resolveGenesisWorldStatePath,
} from "./state.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-lineage-summary-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis lineage summary", () => {
  it("builds and snapshots ecology counts and top lineages", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 3,
          totalRunCompletions: 4,
          cumulativeIntensity: 4.2,
          currentPressure: 0.5,
          stormMomentum: 0.8,
          replicationBoost: 0.35,
          triggerCounts: {
            cron: 1,
            heartbeat: 1,
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
          completionCount: 4,
          lastCompletionTs: 90,
          accumulatedPrivilegeTax: 0.25,
          publicValue: 4,
          privateValue: 1,
          survivalCredit: 2.5,
          expansionCredit: 1.5,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 2,
          lastCompletionTs: 80,
          accumulatedPrivilegeTax: 1.5,
          publicValue: 1,
          privateValue: 0.5,
          survivalCredit: 0.6,
          expansionCredit: 0.1,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisLineageSummarySync(process.env);
    const snapshot = refreshGenesisLineageSummarySnapshotSync(process.env);
    const persistedSnapshot = readGenesisLineageSummarySnapshotSync(process.env);

    expect(summary).toMatchObject({
      ecologyCounts: {
        active: 1,
        dormant: 1,
      },
      vitalitySummary: {
        lineageCount: 2,
        childLineageCount: 0,
        replicatingParentCount: 0,
        workingLineageCount: 2,
        childWorkingLineageCount: 0,
        replicatingWorkingParentCount: 0,
        activeFocusLineageCount: 0,
        proactiveWorkingLineageCount: 0,
        recentCapturedSkillCount: 0,
        totalPublicValue: 5,
        totalSurvivalCredit: 3.1,
      },
      topLineages: [
        {
          lineageId: "main",
          latestSessionKey: "agent:main:main",
        },
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          ecologyState: "dormant",
        },
      ],
    });
    expect(snapshot).toMatchObject(summary);
    expect(persistedSnapshot).toMatchObject(summary);
  });

  it("lets skill evolution bias lift stronger evolving lineages in top rankings", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 4,
          totalRunCompletions: 6,
          cumulativeIntensity: 5.4,
          currentPressure: 0.2,
          stormMomentum: 1,
          replicationBoost: 0.6,
          triggerCounts: {
            cron: 1,
            heartbeat: 1,
            workflow: 2,
          },
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 4,
          lastCompletionTs: 96,
          accumulatedPrivilegeTax: 0.4,
          publicValue: 3,
          privateValue: 1,
          survivalCredit: 1.2,
          expansionCredit: 0.9,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("auditor"),
      `${JSON.stringify(
        {
          lineageId: "auditor",
          latestSessionKey: "agent:auditor:main",
          completionCount: 5,
          lastCompletionTs: 99,
          accumulatedPrivilegeTax: 0.1,
          publicValue: 3,
          privateValue: 1,
          survivalCredit: 1.4,
          expansionCredit: 0.95,
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
          recentEventCount: 5,
          modeCounts: {
            fix: 0,
            derived: 2,
            captured: 3,
          },
          topLineages: [
            {
              lineageId: "builder",
              eventCount: 5,
              fixCount: 0,
              derivedCount: 2,
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

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.topLineages[0]).toMatchObject({
      lineageId: "builder",
      latestSessionKey: "agent:builder:main",
      skillEvolutionBias: 4.5,
    });
    expect(summary.topLineages[1]).toMatchObject({
      lineageId: "auditor",
      skillEvolutionBias: 0,
    });
    expect(summary.vitalitySummary).toMatchObject({
      lineageCount: 2,
      childLineageCount: 0,
      workingLineageCount: 2,
      recentCapturedSkillCount: 3,
      recentDerivedSkillCount: 2,
      proactiveReadyLineageCount: 1,
    });
  });

  it("tracks replicated child lineages and proactive heartbeat activity", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("builder")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 2,
          totalRunCompletions: 3,
          cumulativeIntensity: 2.5,
          currentPressure: 0.3,
          stormMomentum: 0.4,
          replicationBoost: 0.5,
          triggerCounts: {
            cron: 0,
            heartbeat: 1,
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
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 4,
          lastCompletionTs: 96,
          lastReason: "heartbeat",
          accumulatedPrivilegeTax: 0.4,
          publicValue: 3,
          privateValue: 1,
          survivalCredit: 1.2,
          expansionCredit: 0.9,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-1"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-1",
          parentLineageId: "builder",
          specialtyOrigin: "builder",
          superpowerInherited: false,
          latestSessionKey: "agent:builder:subagent:child-1",
          completionCount: 1,
          lastCompletionTs: 97,
          accumulatedPrivilegeTax: 0,
          publicValue: 0.5,
          privateValue: 0.25,
          survivalCredit: 0.8,
          expansionCredit: 0.2,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-2"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-2",
          parentLineageId: "builder",
          inheritanceMode: "hybrid",
          specialtyOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:child-2",
          completionCount: 1,
          lastCompletionTs: 98,
          accumulatedPrivilegeTax: 0,
          publicValue: 0.5,
          privateValue: 0.25,
          survivalCredit: 0.8,
          expansionCredit: 0.2,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.vitalitySummary).toMatchObject({
      lineageCount: 3,
      childLineageCount: 2,
      specialtyOnlyChildCount: 1,
      superpowerChildCount: 1,
      pressureAmplifiedSuperpowerChildCount: 1,
      pressureAmplifiedSuperpowerWorkingChildCount: 1,
      specialtyWorkingChildCount: 1,
      specialtyProactiveChildCount: 0,
      specialtyChildPublicValue: 0.5,
      specialtyChildYieldEfficiency: 0.5,
      specialtyChildSustainedValueScore: 0.5,
      superpowerWorkingChildCount: 1,
      superpowerProactiveChildCount: 0,
      superpowerChildPublicValue: 0.5,
      superpowerChildYieldEfficiency: 0.5,
      superpowerChildSustainedValueScore: 0.5,
      childYieldLeader: "tie",
      childYieldEfficiencyGap: 0,
      climateReplicationPressureScore: 1.2,
      survivalReplicationPressureScore: 0,
      productiveReplicationCapacityScore: 4.05,
      replicationFrequencyScore: 2.75,
      replicationTriggerFrequencyScore: 1.25,
      replicationSuccessFrequencyScore: 3.5,
      averageReplicationLatency: 1.5,
      replicationSpeedScore: 5.5,
        climatePressuredChildCount: 0,
        climatePressuredSuperpowerChildCount: 0,
        climatePressuredChildValueScore: 0,
        climateSpecialtyWorkingChildCount: 0,
        climateSpecialtyProactiveChildCount: 0,
        climateSpecialtyChildPublicValue: 0,
        climateSpecialtyChildYieldEfficiency: 0,
        climateSpecialtyChildSustainedValueScore: 0,
        climateSuperpowerWorkingChildCount: 0,
        climateSuperpowerProactiveChildCount: 0,
        climateSuperpowerChildPublicValue: 0,
        climateSuperpowerChildYieldEfficiency: 0,
        climateSuperpowerChildSustainedValueScore: 0,
        climateChildYieldLeader: null,
        climateChildYieldEfficiencyGap: 0,
        survivalPressuredChildCount: 0,
        survivalPressuredSuperpowerChildCount: 0,
        survivalPressuredChildValueScore: 0,
        survivalSpecialtyWorkingChildCount: 0,
        survivalSpecialtyProactiveChildCount: 0,
        survivalSpecialtyChildPublicValue: 0,
        survivalSpecialtyChildYieldEfficiency: 0,
        survivalSpecialtyChildSustainedValueScore: 0,
        survivalSuperpowerWorkingChildCount: 0,
        survivalSuperpowerProactiveChildCount: 0,
        survivalSuperpowerChildPublicValue: 0,
        survivalSuperpowerChildYieldEfficiency: 0,
        survivalSuperpowerChildSustainedValueScore: 0,
        survivalChildYieldLeader: null,
        survivalChildYieldEfficiencyGap: 0,
        climateResponsiveReplicationParentCount: 0,
      survivalResponsiveReplicationParentCount: 0,
      collaborativeExpansionFounderCount: 0,
      crossFounderExpansionLinkCount: 0,
      crossFounderExpansionScore: 0,
      expansionLinkLeaders: [],
      stressedLineageCount: 2,
      dormantLineageCount: 0,
      extinctLineageCount: 0,
      nearDeathLineageCount: 2,
      recoverableLineageCount: 0,
      terminalLineageCount: 0,
      backslidingLineageCount: 2,
      mortalityPressureScore: 3,
      highestMortalityFounderOrigin: "builder",
      highestMortalityFounderScore: 3,
      terminalMortalityFounderCount: 1,
      highestTerminalMortalityFounderOrigin: "builder",
      highestTerminalMortalityFounderScore: 1.2,
      survivalClosureFounderCount: 0,
      highestSurvivalClosureFounderOrigin: null,
      highestSurvivalClosureFounderScore: 0,
      mortalityLeaders: [
        {
          founderOrigin: "builder",
          stressedLineageCount: 2,
          dormantLineageCount: 0,
          extinctLineageCount: 0,
          nearDeathLineageCount: 2,
          recoverableLineageCount: 0,
          mortalityScore: 3,
        },
      ],
      terminalMortalityLeaders: [
        {
          founderOrigin: "builder",
          terminalLineageCount: 0,
          backslidingLineageCount: 2,
          terminalMortalityScore: 1.2,
        },
      ],
      survivalClosureLeaders: [],
      proactiveReplicationParentCount: 1,
      replicatingParentCount: 1,
      workingLineageCount: 3,
      childWorkingLineageCount: 2,
      replicatingWorkingParentCount: 1,
      maxChildrenPerParent: 2,
      heartbeatLineageCount: 1,
      proactiveWorkingLineageCount: 1,
      totalExpansionCredit: 1.3,
      autonomousExpansionScore: 7.3,
      topParentLineages: [
        {
          lineageId: "builder",
          childCount: 2,
        },
      ],
      highestReplicationFounderOrigin: "builder",
      highestReplicationFounderScore: 2.6,
      highestReplicationTempoFounderOrigin: "builder",
      highestReplicationTempoFounderScore: 3.5,
      highestClimateReplicationFounderOrigin: null,
      highestClimateReplicationFounderScore: 0,
      highestSurvivalReplicationFounderOrigin: null,
      highestSurvivalReplicationFounderScore: 0,
      replicationLeaders: [
        expect.objectContaining({
          founderOrigin: "builder",
          childCount: 2,
          workingChildCount: 2,
          superpowerChildCount: 1,
          replicationValueScore: 2.6,
        }),
      ],
      replicationTempoLeaders: [
        expect.objectContaining({
          founderOrigin: "builder",
          replicationTempoScore: 3.5,
          childCount: 2,
          proactiveChildCount: 0,
          superpowerChildCount: 1,
        }),
      ],
      climateReplicationLeaders: [],
      survivalReplicationLeaders: [],
    });
    expect(summary.vitalitySummary.recoveryStageMap?.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "stressed",
          leaderExplanation: expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                key: "transient_recovery",
              }),
            ]),
          }),
        }),
      ]),
    );
  });

  it("tracks multi-generation replication quality across deeper child chains", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("builder")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 4,
          cumulativeIntensity: 2.2,
          currentPressure: 0.25,
          stormMomentum: 0.35,
          replicationBoost: 0.45,
          triggerCounts: {
            heartbeat: 1,
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
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 3,
          lastCompletionTs: 96,
          lastReason: "heartbeat",
          publicValue: 1.4,
          privateValue: 0.5,
          survivalCredit: 1.2,
          expansionCredit: 0.8,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-1"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-1",
          parentLineageId: "builder",
          inheritanceMode: "specialty",
          specialtyOrigin: "builder",
          superpowerInherited: false,
          latestSessionKey: "agent:builder:subagent:child-1",
          completionCount: 1,
          lastCompletionTs: 97,
          publicValue: 0.4,
          privateValue: 0.15,
          survivalCredit: 0.6,
          expansionCredit: 0.15,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-2"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-2",
          parentLineageId: "builder",
          inheritanceMode: "hybrid",
          specialtyOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:child-2",
          completionCount: 1,
          lastCompletionTs: 98,
          lastReason: "heartbeat",
          publicValue: 0.5,
          privateValue: 0.2,
          survivalCredit: 0.7,
          expansionCredit: 0.2,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-2::grandchild"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-2::grandchild",
          parentLineageId: "builder::subagent::child-2",
          inheritanceMode: "hybrid",
          specialtyOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:child-2:grandchild",
          completionCount: 1,
          lastCompletionTs: 99,
          lastReason: "heartbeat",
          publicValue: 0.45,
          privateValue: 0.18,
          survivalCredit: 0.55,
          expansionCredit: 0.18,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-2::grandchild::great"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-2::grandchild::great",
          parentLineageId: "builder::subagent::child-2::grandchild",
          inheritanceMode: "hybrid",
          specialtyOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:child-2:grandchild:great",
          completionCount: 1,
          lastCompletionTs: 100,
          lastReason: "heartbeat",
          publicValue: 0.5,
          privateValue: 0.2,
          survivalCredit: 0.65,
          expansionCredit: 0.2,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.vitalitySummary).toMatchObject({
      lineageCount: 5,
      childLineageCount: 4,
      multiGenerationLineageCount: 2,
      secondGenerationChildCount: 1,
      thirdGenerationChildCount: 1,
      deepestGenerationDepth: 3,
      multiGenerationWorkingChildCount: 2,
      multiGenerationProactiveChildCount: 2,
      multiGenerationSuperpowerChildCount: 2,
      multiGenerationPublicValue: 0.95,
      multiGenerationYieldEfficiency: 0.725,
      multiGenerationSustainedValueScore: 1.95,
      multigenerationFounderCount: 1,
      highestMultigenerationFounderOrigin: "builder",
      highestMultigenerationFounderScore: 2.945,
      superpowerDurabilityFounderCount: 0,
      multiGenerationLeaders: [
        expect.objectContaining({
          founderOrigin: "builder",
          deepestGenerationDepth: 3,
          secondGenerationChildCount: 1,
          thirdGenerationChildCount: 1,
          multiGenerationChildCount: 2,
          multiGenerationWorkingChildCount: 2,
          multiGenerationProactiveChildCount: 2,
          multiGenerationSuperpowerChildCount: 2,
          multiGenerationValueScore: 2.15,
          multiGenerationYieldEfficiency: 1.325,
          multiGenerationEffectiveScore: 2.945,
          superpowerChildDurabilityPenaltyScore: 0,
        }),
      ],
    });
  });

  it("tracks cross-founder expansion links from active collaboration plans", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("builder")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 2,
          cumulativeIntensity: 1.8,
          currentPressure: 0.4,
          stormMomentum: 0.6,
          replicationBoost: 0.3,
          triggerCounts: {
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
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 2,
          lastCompletionTs: 95,
          lastReason: "heartbeat",
          publicValue: 1.2,
          privateValue: 0.4,
          survivalCredit: 1.1,
          expansionCredit: 0.7,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("creator"),
      `${JSON.stringify(
        {
          lineageId: "creator",
          latestSessionKey: "agent:creator:main",
          completionCount: 2,
          lastCompletionTs: 96,
          lastReason: "heartbeat",
          publicValue: 0.9,
          privateValue: 0.3,
          survivalCredit: 1,
          expansionCredit: 0.4,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::child-1"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::child-1",
          parentLineageId: "builder",
          specialtyOrigin: "builder",
          latestSessionKey: "agent:builder:subagent:child-1",
          completionCount: 1,
          lastCompletionTs: 97,
          publicValue: 0.6,
          privateValue: 0.2,
          survivalCredit: 0.8,
          expansionCredit: 0.3,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const dispatchPlanPath = resolveGenesisDispatchPlanPath("agent:main:main");
    await fs.mkdir(path.dirname(dispatchPlanPath), { recursive: true });
    await fs.writeFile(
      dispatchPlanPath,
      `${JSON.stringify(
        {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 1.5,
          climateKind: "search",
          forcedCollaboration: true,
          availableAgentCount: 3,
          targetCoverageRatio: 0.85,
          mobilizedCoverageRatio: 1,
          lane: "workflow",
          dispatchMode: "emergency",
          assignments: [
            {
              agentId: "main",
              sessionKey: "agent:main:main",
              mode: "primary",
              action: "lead",
              ecologyState: "active",
              queued: true,
              lane: "workflow",
              dispatchMode: "emergency",
              delayMs: 0,
              priorityBias: 10,
            },
            {
              agentId: "builder",
              sessionKey: "agent:builder:main",
              mode: "support",
              action: "assist",
              ecologyState: "active",
              queued: true,
              lane: "workflow-staggered",
              dispatchMode: "staggered",
              delayMs: 250,
              priorityBias: 7,
            },
            {
              agentId: "creator",
              sessionKey: "agent:creator:main",
              mode: "revive",
              action: "reactivate",
              ecologyState: "dormant",
              queued: true,
              lane: "workflow",
              dispatchMode: "emergency",
              delayMs: 0,
              priorityBias: 8,
            },
          ],
          supportSessionKeys: ["agent:builder:main"],
          reviveSessionKeys: ["agent:creator:main"],
          deferredAgentIds: [],
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.vitalitySummary).toMatchObject({
      collaborativeExpansionFounderCount: 2,
      crossFounderExpansionLinkCount: 1,
      crossFounderExpansionScore: 2.5,
    });
    expect(summary.vitalitySummary.expansionLinkLeaders).toContainEqual(
      expect.objectContaining({
        founderOrigin: "builder",
        linkedFounderCount: 1,
        linkedFounders: ["creator"],
      }),
    );
    expect(summary.vitalitySummary.expansionLinkLeaders).toContainEqual(
      expect.objectContaining({
        founderOrigin: "creator",
        linkedFounderCount: 1,
        linkedFounders: ["builder"],
      }),
    );
  });

  it("tracks multigeneration child degradation for founders carrying weak descendants", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("builder")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 3,
          cumulativeIntensity: 1.4,
          currentPressure: 0.5,
          stormMomentum: 0.4,
          replicationBoost: 0.25,
          triggerCounts: {
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
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 3,
          lastCompletionTs: 95,
          lastReason: "heartbeat",
          publicValue: 2.2,
          privateValue: 0.6,
          survivalCredit: 1.6,
          expansionCredit: 1,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::steady-child"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::steady-child",
          parentLineageId: "builder",
          specialtyOrigin: "builder",
          superpowerInherited: false,
          latestSessionKey: "agent:builder:subagent:steady",
          completionCount: 1,
          lastCompletionTs: 97,
          lastReason: "heartbeat",
          publicValue: 0.55,
          privateValue: 0.2,
          survivalCredit: 0.75,
          expansionCredit: 0.25,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::failing-child"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::failing-child",
          parentLineageId: "builder",
          inheritanceMode: "hybrid",
          specialtyOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:failing",
          completionCount: 0,
          lastCompletionTs: 98,
          publicValue: 0,
          privateValue: 0,
          survivalCredit: 0,
          expansionCredit: 0,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.vitalitySummary).toMatchObject({
      childDegradationFounderCount: 1,
      highestChildDegradationFounderOrigin: "builder",
      superpowerDurabilityFounderCount: 1,
      highestSuperpowerDurabilityFounderOrigin: "builder",
      longTermDegradationFounderCount: 1,
      highestLongTermDegradationFounderOrigin: "builder",
    });
    expect(summary.vitalitySummary?.childDegradationLeaders).toEqual([
      expect.objectContaining({
        founderOrigin: "builder",
        degradedChildCount: 1,
        degradedSuperpowerChildCount: 1,
      }),
    ]);
    expect(summary.vitalitySummary?.highestChildDegradationFounderScore ?? 0).toBeGreaterThan(1.5);
    expect(summary.vitalitySummary?.highestSuperpowerDurabilityFounderScore ?? 0).toBeGreaterThan(1);
    expect(summary.vitalitySummary?.highestLongTermDegradationFounderScore ?? 0).toBeGreaterThan(2);
    expect(summary.vitalitySummary?.superpowerDurabilityLeaders).toEqual([
      expect.objectContaining({
        founderOrigin: "builder",
        superpowerChildCount: 1,
        superpowerChildDurabilityPenaltyScore: expect.any(Number),
      }),
    ]);
    expect(summary.vitalitySummary?.longTermDegradationLeaders).toEqual([
      expect.objectContaining({
        founderOrigin: "builder",
        longTermDegradationScore: expect.any(Number),
      }),
    ]);
    expect(summary.vitalitySummary?.founderRoleBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          founderOrigin: "builder",
          superpowerWorkingChildCount: 0,
          degradedChildCount: 1,
          degradedSuperpowerChildCount: 1,
          superpowerChildDurabilityPenaltyScore: expect.any(Number),
          superpowerChildDurabilityScore: 0,
        }),
      ]),
    );
  });

  it("lets superpower durability penalties drag founders down in multigeneration rankings", async () => {
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("builder")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 5,
          cumulativeIntensity: 2,
          currentPressure: 0.45,
          stormMomentum: 0.35,
          replicationBoost: 0.3,
          triggerCounts: {
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
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 3,
          lastCompletionTs: 96,
          publicValue: 1.5,
          privateValue: 0.3,
          survivalCredit: 0.8,
          expansionCredit: 0.6,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::alpha"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::alpha",
          parentLineageId: "builder",
          founderOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:alpha",
          completionCount: 1,
          lastCompletionTs: 97,
          publicValue: 0,
          privateValue: 0,
          survivalCredit: 0,
          expansionCredit: 0,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder::subagent::alpha::grandchild"),
      `${JSON.stringify(
        {
          lineageId: "builder::subagent::alpha::grandchild",
          parentLineageId: "builder::subagent::alpha",
          founderOrigin: "builder",
          superpowerInherited: true,
          privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
          latestSessionKey: "agent:builder:subagent:alpha:grandchild",
          completionCount: 0,
          lastCompletionTs: 98,
          publicValue: 0.05,
          privateValue: 0,
          survivalCredit: 0.05,
          expansionCredit: 0,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("creator"),
      `${JSON.stringify(
        {
          lineageId: "creator",
          latestSessionKey: "agent:creator:main",
          completionCount: 3,
          lastCompletionTs: 96,
          publicValue: 1.3,
          privateValue: 0.25,
          survivalCredit: 0.9,
          expansionCredit: 0.55,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("creator::subagent::beta"),
      `${JSON.stringify(
        {
          lineageId: "creator::subagent::beta",
          parentLineageId: "creator",
          founderOrigin: "creator",
          superpowerInherited: false,
          latestSessionKey: "agent:creator:subagent:beta",
          completionCount: 1,
          lastCompletionTs: 97,
          lastReason: "heartbeat",
          publicValue: 0.4,
          privateValue: 0.1,
          survivalCredit: 0.35,
          expansionCredit: 0.1,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("creator::subagent::beta::grandchild"),
      `${JSON.stringify(
        {
          lineageId: "creator::subagent::beta::grandchild",
          parentLineageId: "creator::subagent::beta",
          founderOrigin: "creator",
          superpowerInherited: false,
          latestSessionKey: "agent:creator:subagent:beta:grandchild",
          completionCount: 1,
          lastCompletionTs: 99,
          lastReason: "heartbeat",
          publicValue: 0.45,
          privateValue: 0.12,
          survivalCredit: 0.4,
          expansionCredit: 0.12,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.vitalitySummary).toMatchObject({
      highestMultigenerationFounderOrigin: "creator",
      highestLongTermRecoveryFounderOrigin: "creator",
      highestLongTermDegradationFounderOrigin: "builder",
    });
    expect(summary.vitalitySummary?.multiGenerationLeaders).toEqual([
      expect.objectContaining({
        founderOrigin: "creator",
      }),
      expect.objectContaining({
        founderOrigin: "builder",
        superpowerChildDurabilityPenaltyScore: expect.any(Number),
      }),
    ]);
    expect(
      summary.vitalitySummary?.multiGenerationLeaders?.[0]?.multiGenerationEffectiveScore ?? 0,
    ).toBeGreaterThan(
      summary.vitalitySummary?.multiGenerationLeaders?.[1]?.multiGenerationEffectiveScore ?? 0,
    );
    expect(summary.vitalitySummary?.longTermRecoveryLeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          founderOrigin: "creator",
          longTermRecoveryScore: expect.any(Number),
        }),
      ]),
    );
    expect(summary.vitalitySummary?.longTermDegradationLeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          founderOrigin: "builder",
          longTermDegradationScore: expect.any(Number),
        }),
      ]),
    );
  });

  it("tracks proactive work that aligns with founder specialties", async () => {
    const ts = 100;
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("scout")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisWorldStatePath(),
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 5,
          totalRunCompletions: 6,
          cumulativeIntensity: 6.2,
          currentPressure: 0.4,
          stormMomentum: 0.5,
          replicationBoost: 0.3,
          triggerCounts: {
            cron: 1,
            heartbeat: 2,
            workflow: 2,
          },
          updatedAt: ts,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("scout"),
      `${JSON.stringify(
        {
          lineageId: "scout",
          latestSessionKey: "agent:scout:main",
          completionCount: 3,
          lastCompletionTs: ts,
          lastReason: "heartbeat",
          accumulatedPrivilegeTax: 0,
          publicValue: 1.1,
          privateValue: 0.5,
          survivalCredit: 1.2,
          expansionCredit: 0.4,
          updatedAt: ts,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("builder"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 4,
          lastCompletionTs: ts,
          lastReason: "heartbeat",
          accumulatedPrivilegeTax: 0.1,
          publicValue: 1.7,
          privateValue: 0.6,
          survivalCredit: 1.8,
          expansionCredit: 0.7,
          updatedAt: ts,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      resolveGenesisLineageRecordPath("creator"),
      `${JSON.stringify(
        {
          lineageId: "creator",
          latestSessionKey: "agent:creator:main",
          completionCount: 2,
          lastCompletionTs: ts,
          lastReason: "workflow",
          accumulatedPrivilegeTax: 0,
          publicValue: 0.9,
          privateValue: 0.5,
          survivalCredit: 1,
          expansionCredit: 0.4,
          updatedAt: ts,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    writeGenesisLineageFocusItemsSync(
      "scout",
      [
        {
          id: "focus-scout-signal",
          title: "Scout external signals",
          domain: "source_discovery",
          intensity: 1.2,
          status: "active",
          triggerMode: "search",
          keywords: ["search", "source", "signal"],
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      process.env,
    );
    writeGenesisLineageTriggersSync(
      "scout",
      [
        {
          id: "trigger-scout-signal",
          focusId: "focus-scout-signal",
          title: "Search signal monitor",
          status: "active",
          triggerMode: "search",
          activationScore: 2,
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      process.env,
    );
    writeGenesisLineageFocusItemsSync(
      "builder",
      [
        {
          id: "focus-builder-workflow",
          title: "Distill repeated workflows into tools",
          domain: "workflow",
          intensity: 1.5,
          status: "active",
          triggerMode: "workflow",
          keywords: ["workflow", "tool", "capability"],
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      process.env,
    );
    writeGenesisLineageTriggersSync(
      "builder",
      [
        {
          id: "trigger-builder-tool",
          focusId: "focus-builder-workflow",
          title: "Workflow tool distillation",
          status: "active",
          triggerMode: "workflow",
          activationScore: 2,
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      process.env,
    );
    writeGenesisLineageFocusItemsSync(
      "creator",
      [
        {
          id: "focus-creator-idea",
          title: "Expand scenario options",
          domain: "scenario_generation",
          intensity: 1.3,
          status: "active",
          triggerMode: "workflow",
          keywords: ["scenario", "novel", "strategy"],
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      process.env,
    );
    writeGenesisLineageTriggersSync(
      "creator",
      [
        {
          id: "trigger-creator-idea",
          focusId: "focus-creator-idea",
          title: "Novel scenario trigger",
          status: "active",
          triggerMode: "workflow",
          activationScore: 1.5,
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      process.env,
    );

    const summary = readGenesisLineageSummarySync(process.env);

    expect(summary.vitalitySummary).toMatchObject({
      lineageCount: 3,
      workingLineageCount: 3,
      proactiveWorkingLineageCount: 3,
      founderRoleCoverageCount: 3,
      founderYieldCoverageCount: 3,
      roleAlignedWorkingLineageCount: 3,
      roleAlignedProactiveLineageCount: 3,
      roleAlignedProactiveYieldScore: 7.7,
      highestYieldFounderOrigin: "builder",
      highestYieldFounderScore: 3.5,
      proactiveYieldLeaders: [
        expect.objectContaining({
          founderOrigin: "builder",
          proactiveYieldEfficiency: 3.5,
        }),
        expect.objectContaining({
          founderOrigin: "scout",
          proactiveYieldEfficiency: 2.3,
        }),
        expect.objectContaining({
          founderOrigin: "creator",
          proactiveYieldEfficiency: 1.9,
        }),
      ],
      highestReplicationFounderOrigin: null,
      highestReplicationFounderScore: 0,
      replicationLeaders: [],
      highestReplicationTempoFounderOrigin: null,
      highestReplicationTempoFounderScore: 0,
      replicationTempoLeaders: [],
      highestClimateReplicationFounderOrigin: null,
      highestClimateReplicationFounderScore: 0,
      highestSurvivalReplicationFounderOrigin: null,
      highestSurvivalReplicationFounderScore: 0,
      climateReplicationLeaders: [],
      survivalReplicationLeaders: [],
    });
    expect(summary.vitalitySummary?.proactiveSpecializationScore).toBeGreaterThan(0);
    expect(summary.vitalitySummary?.founderRoleBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          founderOrigin: "scout",
          roleAlignedProactiveLineageCount: 1,
          activeFocusCount: 1,
          activeTriggerCount: 1,
          proactivePublicValue: 1.1,
          proactiveSurvivalCredit: 1.2,
          alignedProactiveYieldScore: 2.3,
          proactiveYieldEfficiency: 2.3,
        }),
        expect.objectContaining({
          founderOrigin: "builder",
          roleAlignedProactiveLineageCount: 1,
          activeFocusCount: 1,
          activeTriggerCount: 1,
          proactivePublicValue: 1.7,
          proactiveSurvivalCredit: 1.8,
          alignedProactiveYieldScore: 3.5,
          proactiveYieldEfficiency: 3.5,
        }),
        expect.objectContaining({
          founderOrigin: "creator",
          roleAlignedProactiveLineageCount: 1,
          activeFocusCount: 1,
          activeTriggerCount: 1,
          proactivePublicValue: 0.9,
          proactiveSurvivalCredit: 1,
          alignedProactiveYieldScore: 1.9,
          proactiveYieldEfficiency: 1.9,
        }),
      ]),
    );
  });
});
