import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readGenesisDispatchSummarySnapshotSync,
  readGenesisDispatchSummarySync,
  readGenesisSocietyPlanDetailSync,
  refreshGenesisDispatchSummarySnapshotSync,
} from "./dispatch-summary.js";
import { resolveGenesisDispatchPlanPath, resolveGenesisLineageRecordPath } from "./state.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-dispatch-summary-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis dispatch summary", () => {
  it("builds dispatch summary and plan detail from persisted plans", async () => {
    await fs.mkdir(path.dirname(resolveGenesisDispatchPlanPath("agent:main:main")), {
      recursive: true,
    });
    await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath("main")), {
      recursive: true,
    });
    await fs.writeFile(
      resolveGenesisDispatchPlanPath("agent:main:main"),
      `${JSON.stringify(
        {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 1.3,
          climateKind: "search",
          forcedCollaboration: true,
          availableAgentCount: 4,
          targetCoverageRatio: 0.85,
          mobilizedCoverageRatio: 0.75,
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
              priorityBias: 5,
            },
            {
              agentId: "builder",
              sessionKey: "agent:builder:main",
              mode: "support",
              action: "assist",
              ecologyState: "stressed",
              queued: true,
              lane: "workflow-staggered",
              dispatchMode: "staggered",
              delayMs: 250,
              priorityBias: 2,
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
              priorityBias: 4,
            },
          ],
          supportSessionKeys: ["agent:builder:main"],
          reviveSessionKeys: ["agent:creator:main"],
          deferredAgentIds: ["auditor"],
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
          completionCount: 3,
          lastCompletionTs: 100,
          accumulatedPrivilegeTax: 0,
          publicValue: 2,
          privateValue: 0.5,
          survivalCredit: 1.2,
          expansionCredit: 0.4,
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
          lastCompletionTs: 100,
          accumulatedPrivilegeTax: 0,
          publicValue: 1.5,
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
      resolveGenesisLineageRecordPath("creator"),
      `${JSON.stringify(
        {
          lineageId: "creator",
          latestSessionKey: "agent:creator:main",
          completionCount: 1,
          lastCompletionTs: 100,
          accumulatedPrivilegeTax: 0,
          publicValue: 0.75,
          privateValue: 0.1,
          survivalCredit: 0.6,
          expansionCredit: 0.1,
          updatedAt: 100,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const summary = readGenesisDispatchSummarySync(process.env);
    const snapshot = refreshGenesisDispatchSummarySnapshotSync(process.env);
    const persistedSnapshot = readGenesisDispatchSummarySnapshotSync(process.env);
    const detail = readGenesisSocietyPlanDetailSync("agent:main:main", process.env);

    expect(summary).toMatchObject({
      activeDispatchCount: 1,
      reviveDispatchCount: 1,
      activePlans: [{ primaryAgentId: "main", supportCount: 1, reviveCount: 1, deferredCount: 1 }],
      collaborationSummary: {
        activePlanCount: 1,
        collaborativePlanCount: 1,
        emergencyPlanCount: 1,
        forcedCollaborationPlanCount: 1,
        highCoveragePlanCount: 0,
        mobilizedAgentCount: 3,
        averageMobilizedCoverageRatio: 0.75,
        averageTargetCoverageRatio: 0.85,
        leadAssignmentCount: 1,
        supportAssignmentCount: 1,
        reviveAssignmentCount: 1,
        productiveMobilizedLineageCount: 3,
        productiveLeadLineageCount: 1,
        productiveSupportLineageCount: 1,
        productiveReviveLineageCount: 1,
        productiveAssignmentCoverageRatio: 1,
        leadYieldScore: 3.2,
        supportYieldScore: 2.3,
        reviveYieldScore: 1.35,
        queuedAssignmentCount: 3,
      },
    });
    expect(summary.collaborationSummary?.averageAssignmentsPerPlan).toBeCloseTo(3, 6);
    expect(summary.collaborationSummary?.coordinationScore).toBeGreaterThan(6);
    expect(summary.collaborationSummary?.productiveMobilizedLineageCount).toBe(3);
    expect(summary.collaborationSummary?.collaborationEffectScore).toBeGreaterThan(6);
    expect(summary.activePlans[0]).toMatchObject({
      climateKind: "search",
      forcedCollaboration: true,
      availableAgentCount: 4,
      targetCoverageRatio: 0.85,
      mobilizedCoverageRatio: 0.75,
    });
    expect(summary.coordinationQueue[0]).toMatchObject({
      agentId: "main",
      action: "lead",
      priorityBias: 5,
    });
    expect(summary.coordinationBatches[0]).toMatchObject({
      primaryAgentId: "main",
      recommendedAction: "reactivate_lineages",
      support: [{ agentId: "builder" }],
      revive: [{ agentId: "creator" }],
    });
    expect(snapshot).toMatchObject(summary);
    expect(persistedSnapshot).toMatchObject(summary);
    expect(detail).toMatchObject({
      primaryAgentId: "main",
      supportCount: 1,
      reviveCount: 1,
      recommendedAction: "reactivate_lineages",
      executionPhases: [
        { phase: "reactivate", count: 1 },
        { phase: "lead", count: 1 },
        { phase: "support", count: 1 },
      ],
    });
  });
});
