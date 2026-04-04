import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionUtilsMock = vi.hoisted(() => ({
  loadSessionEntry: vi.fn(),
}));

vi.mock("../../gateway/session-utils.js", () => ({
  loadSessionEntry: (sessionKey: string) => sessionUtilsMock.loadSessionEntry(sessionKey),
}));

vi.mock("../../gateway/session-utils.ts", () => ({
  loadSessionEntry: (sessionKey: string) => sessionUtilsMock.loadSessionEntry(sessionKey),
}));

import {
  emitGenesisEnvironmentEvent,
  writeGenesisRunCompletion,
  writeGenesisWorkflowDispatch,
} from "./gateway-bridge.js";
import { writeGenesisLineageFocusItemsSync, writeGenesisLineageTriggersSync } from "./focus.js";
import {
  resolveGenesisEventLogSummaryPath,
  resolveGenesisMetaClawStatePath,
  resolveGenesisProactiveWorkLogPath,
  resolveGenesisProactiveWorkSummaryPath,
  resolveGenesisSkillEvolutionLogPath,
  resolveGenesisSkillEvolutionSummaryPath,
  resolveGenesisLineageSummaryPath,
  resolveGenesisTrajectorySummaryPath,
} from "./state.js";

let stateDir: string;

async function readJsonLines(filePath: string): Promise<Array<Record<string, unknown>>> {
  const raw = await fs.readFile(filePath, "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-bridge-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  sessionUtilsMock.loadSessionEntry.mockReset();
  sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
    canonicalKey: sessionKey,
    entry: undefined,
  }));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis gateway bridge", () => {
  it("writes environment events to the Genesis ledger", async () => {
    await emitGenesisEnvironmentEvent({
      trigger: "workflow",
      summary: "A workflow storm hit the society.",
      intensity: 1.4,
      sourceRef: "gateway://test#workflow",
    });

    const ledgerPath = path.join(stateDir, "genesis", "ledger.jsonl");
    const eventLogSummaryPath = resolveGenesisEventLogSummaryPath(process.env);
    const trajectorySummaryPath = resolveGenesisTrajectorySummaryPath(process.env);
    const metaClawStatePath = resolveGenesisMetaClawStatePath(process.env);
    const worldStatePath = path.join(stateDir, "genesis", "world-state.json");
    const entries = await readJsonLines(ledgerPath);
    const eventLogSummary = JSON.parse(
      await fs.readFile(eventLogSummaryPath, "utf-8"),
    ) as Record<string, unknown>;
    const trajectorySummary = JSON.parse(
      await fs.readFile(trajectorySummaryPath, "utf-8"),
    ) as Record<string, unknown>;
    const metaClawState = JSON.parse(
      await fs.readFile(metaClawStatePath, "utf-8"),
    ) as Record<string, unknown>;
    const worldState = JSON.parse(await fs.readFile(worldStatePath, "utf-8")) as Record<string, unknown>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "environment_event",
      payload: {
        trigger: "workflow",
        summary: "A workflow storm hit the society.",
        intensity: 1.4,
        sourceRef: "gateway://test#workflow",
      },
    });
    expect(eventLogSummary).toMatchObject({
      recentEntryCount: 1,
      environmentEventCount: 1,
      recentEnvironmentTriggers: {
        workflow: 1,
      },
      lastEnvironmentSummary: "A workflow storm hit the society.",
    });
    expect(trajectorySummary).toMatchObject({
      recentTrajectoryCount: 1,
      climateTrajectoryCount: 1,
      latestMode: "climate",
    });
    expect(metaClawState).toMatchObject({
      idleEligible: false,
      lastSkipReason: "pressure_not_idle",
    });
    expect(worldState).toMatchObject({
      totalEnvironmentEvents: 1,
      totalRunCompletions: 0,
      cumulativeIntensity: 1.4,
      stormMomentum: expect.any(Number),
      replicationBoost: expect.any(Number),
      triggerCounts: {
        workflow: 1,
      },
      lastEventSummary: "A workflow storm hit the society.",
    });
    expect((worldState.replicationBoost as number | undefined) ?? 0).toBeGreaterThan(0);
  });

  it("applies Genesis experiment profile gains to environment shocks", async () => {
    const profilePath = path.join(stateDir, "genesis", "experiment-profile.json");
    await fs.mkdir(path.dirname(profilePath), { recursive: true });
    await fs.writeFile(
      profilePath,
      `${JSON.stringify(
        {
          workflowShockGain: 1.5,
          replicationStormGain: 0.8,
          replicationPressureGain: 0.35,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await emitGenesisEnvironmentEvent({
      trigger: "workflow",
      summary: "A high-gain workflow storm hit the society.",
      intensity: 1,
    });

    const worldStatePath = path.join(stateDir, "genesis", "world-state.json");
    const worldState = JSON.parse(await fs.readFile(worldStatePath, "utf-8")) as Record<string, unknown>;
    expect(worldState).toMatchObject({
      currentPressure: 1,
      stormMomentum: 1.5,
    });
    expect((worldState.replicationBoost as number | undefined) ?? 0).toBeGreaterThan(1);
  });

  it("recomputes persisted lineage ecology state after a workflow shock", async () => {
    const lineagePath = path.join(
      stateDir,
      "genesis",
      "lineages",
      `${encodeURIComponent("builder_founder")}.json`,
    );
    await fs.mkdir(path.dirname(lineagePath), { recursive: true });
    await fs.writeFile(
      lineagePath,
      `${JSON.stringify(
        {
          lineageId: "builder_founder",
          latestSessionKey: "agent:builder:main",
          completionCount: 3,
          lastCompletionTs: 10,
          accumulatedPrivilegeTax: 0,
          publicValue: 1,
          privateValue: 0.5,
          survivalCredit: 0.8,
          expansionCredit: 0.3,
          ecologyState: "active",
          updatedAt: 10,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await emitGenesisEnvironmentEvent({
      trigger: "workflow",
      summary: "A severe workflow storm hit the society.",
      intensity: 2,
      sourceRef: "gateway://test#workflow-severe",
    });

    const lineage = JSON.parse(await fs.readFile(lineagePath, "utf-8")) as Record<string, unknown>;
    expect(lineage).toMatchObject({
      lineageId: "builder_founder",
      ecologyState: "dormant",
    });
  });

  it("activates matching Genesis triggers from environment events", async () => {
    writeGenesisLineageFocusItemsSync(
      "builder_founder",
      [
        {
          id: "focus-builder-market",
          title: "Builder market automation",
          domain: "market",
          intensity: 1.5,
          status: "active",
          triggerMode: "workflow",
          keywords: ["market", "pricing"],
          createdAt: 10,
          updatedAt: 10,
        },
      ],
      process.env,
    );
    writeGenesisLineageTriggersSync(
      "builder_founder",
      [
        {
          id: "trigger-builder-market",
          focusId: "focus-builder-market",
          title: "market surge",
          status: "active",
          triggerMode: "workflow",
          threshold: 1.25,
          createdAt: 20,
          updatedAt: 20,
        },
      ],
      process.env,
    );

    await emitGenesisEnvironmentEvent({
      trigger: "workflow",
      summary: "A market pricing workflow storm hit the society.",
      intensity: 1.8,
      sourceRef: "gateway://test#workflow-market",
    });

    const focusPath = path.join(
      stateDir,
      "genesis",
      "focus",
      `${encodeURIComponent("builder_founder")}.json`,
    );
    const record = JSON.parse(await fs.readFile(focusPath, "utf-8")) as {
      triggers?: Array<Record<string, unknown>>;
    };
    expect(record.triggers).toHaveLength(1);
    expect(record.triggers?.[0]).toMatchObject({
      id: "trigger-builder-market",
      status: "active",
      lastTriggeredAt: expect.any(Number),
      activationScore: expect.any(Number),
    });
    expect((record.triggers?.[0]?.activationScore as number | undefined) ?? 0).toBeGreaterThan(1.25);
  });

  it("writes run completions to the ledger, session records, and lineage records", async () => {
    sessionUtilsMock.loadSessionEntry.mockImplementation(() => ({
      canonicalKey: "agent:main:main",
      entry: {
        genesisLineageId: "builder_founder::subagent::child",
        genesisParentLineageId: "builder_founder",
        genesisInheritanceMode: "hybrid",
        genesisSpecialtyOrigin: "builder",
        genesisSuperpowerInherited: true,
        genesisPrivilegeInheritanceReason: "genesis_lab_allowlist",
        genesisRuntimeProfile: "lab",
        genesisPrivilegeTax: 2.5,
      },
    }));
    await writeGenesisRunCompletion({
      sessionKey: "agent:main:main",
      reason: "create",
      ts: 123456,
    });
    await writeGenesisRunCompletion({
      sessionKey: "agent:main:main",
      reason: "complete",
      ts: 123999,
    });
    const ledgerPath = path.join(stateDir, "genesis", "ledger.jsonl");
    const completionsPath = path.join(stateDir, "genesis", "run-completions.jsonl");
    const worldStatePath = path.join(stateDir, "genesis", "world-state.json");
    const trajectorySummaryPath = resolveGenesisTrajectorySummaryPath(process.env);
    const metaClawStatePath = resolveGenesisMetaClawStatePath(process.env);
    const skillEvolutionPath = resolveGenesisSkillEvolutionLogPath(process.env);
    const skillEvolutionSummaryPath = resolveGenesisSkillEvolutionSummaryPath(process.env);
    const recordPath = path.join(
      stateDir,
      "genesis",
      "session-records",
      `${encodeURIComponent("agent:main:main")}.json`,
    );
    const lineagesDir = path.join(stateDir, "genesis", "lineages");

    const ledgerEntries = await readJsonLines(ledgerPath);
    const completionEntries = await readJsonLines(completionsPath);
    const record = JSON.parse(await fs.readFile(recordPath, "utf-8")) as Record<string, unknown>;
    const worldState = JSON.parse(await fs.readFile(worldStatePath, "utf-8")) as Record<string, unknown>;
    const trajectorySummary = JSON.parse(
      await fs.readFile(trajectorySummaryPath, "utf-8"),
    ) as Record<string, unknown>;
    const metaClawState = JSON.parse(
      await fs.readFile(metaClawStatePath, "utf-8"),
    ) as Record<string, unknown>;
    const skillEvolutionEntries = await readJsonLines(skillEvolutionPath);
    const skillEvolutionSummary = JSON.parse(
      await fs.readFile(skillEvolutionSummaryPath, "utf-8"),
    ) as Record<string, unknown>;
    await vi.waitFor(async () => {
      const lineageFiles = await fs.readdir(lineagesDir);
      expect(lineageFiles.length).toBeGreaterThan(0);
    });
    const lineageFiles = await fs.readdir(lineagesDir);
    const lineage = JSON.parse(
      await fs.readFile(path.join(lineagesDir, lineageFiles[0]!), "utf-8"),
    ) as Record<string, unknown>;

    expect(ledgerEntries.map((entry) => entry.kind)).toEqual(["run_completion", "run_completion"]);
    expect(completionEntries).toHaveLength(2);
    expect(record).toMatchObject({
      sessionKey: "agent:main:main",
      completionCount: 2,
      lastCompletionTs: 123999,
      lastReason: "complete",
    });
    expect(worldState).toMatchObject({
      totalEnvironmentEvents: 0,
      totalRunCompletions: 2,
    });
    expect(trajectorySummary).toMatchObject({
      recentTrajectoryCount: 2,
    });
    expect(metaClawState).toMatchObject({
      idleEligible: true,
      idleOptimizationCount: 0,
    });
    expect(lineage).toMatchObject({
      latestSessionKey: "agent:main:main",
      completionCount: 2,
      accumulatedPrivilegeTax: expect.any(Number),
      publicValue: 2.5,
      privateValue: 0.5,
      survivalCredit: 2.5,
      expansionCredit: 1,
      lastReason: "complete",
    });
    expect(skillEvolutionEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "derived",
          reason: "create",
        }),
        expect.objectContaining({
          mode: "captured",
          reason: "complete",
        }),
      ]),
    );
    expect(skillEvolutionSummary).toMatchObject({
      recentEventCount: 2,
      modeCounts: {
        fix: 0,
        derived: 1,
        captured: 1,
      },
    });
  });

  it("dedupes repeated run completion writes for the same runId", async () => {
    await writeGenesisRunCompletion({
      sessionKey: "agent:creator:main",
      reason: "run_completed",
      ts: 200,
      runId: "run-same",
      source: "agent_run",
    });
    await writeGenesisRunCompletion({
      sessionKey: "agent:creator:main",
      reason: "run_completed",
      ts: 201,
      runId: "run-same",
      source: "agent_run",
    });

    const completionsPath = path.join(stateDir, "genesis", "run-completions.jsonl");
    const recordPath = path.join(
      stateDir,
      "genesis",
      "session-records",
      `${encodeURIComponent("agent:creator:main")}.json`,
    );
    const completionEntries = await readJsonLines(completionsPath);
    const record = JSON.parse(await fs.readFile(recordPath, "utf-8")) as Record<string, unknown>;

    expect(completionEntries).toHaveLength(1);
    expect(completionEntries[0]).toMatchObject({
      sessionKey: "agent:creator:main",
      runId: "run-same",
      source: "agent_run",
    });
    expect(record).toMatchObject({
      sessionKey: "agent:creator:main",
      completionCount: 1,
    });
  });

  it("writes workflow dispatch plans to Genesis state files", async () => {
    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:builder:main"
          ? {
              sessionId: "builder-session",
              updatedAt: Date.now(),
              genesisLineageId: "builder-lineage",
              genesisSpecialtyOrigin: "builder",
            }
          : sessionKey === "agent:main:main"
            ? {
                sessionId: "main-session",
                updatedAt: Date.now(),
              }
            : undefined,
    }));
    await writeGenesisWorkflowDispatch({
      runId: "workflow-run-1",
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      intensity: 1.2,
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
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
      ],
      supportSessionKeys: ["agent:builder:main"],
      reviveSessionKeys: [],
      deferredAgentIds: ["auditor"],
      updatedAt: 654321,
    });

    const ledgerPath = path.join(stateDir, "genesis", "ledger.jsonl");
    const dispatchPlanPath = path.join(
      stateDir,
      "genesis",
      "dispatch-plans",
      `${encodeURIComponent("agent:main:main")}.json`,
    );
    const assignmentPath = path.join(
      stateDir,
      "genesis",
      "dispatch-assignments",
      `${encodeURIComponent("agent:builder:main")}.json`,
    );
    const ledgerEntries = await readJsonLines(ledgerPath);
    const dispatchPlan = JSON.parse(await fs.readFile(dispatchPlanPath, "utf-8")) as Record<
      string,
      unknown
    >;
    const assignment = JSON.parse(await fs.readFile(assignmentPath, "utf-8")) as Record<
      string,
      unknown
    >;

    expect(ledgerEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workflow_dispatch",
          payload: expect.objectContaining({
            runId: "workflow-run-1",
            primaryAgentId: "main",
            primarySessionKey: "agent:main:main",
          }),
        }),
      ]),
    );
    expect(dispatchPlan).toMatchObject({
      runId: "workflow-run-1",
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      supportSessionKeys: ["agent:builder:main"],
    });
    expect(assignment).toMatchObject({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      assignment: {
        agentId: "builder",
        sessionKey: "agent:builder:main",
        action: "assist",
      },
    });
  });

  it("persists founder lineage records for live dispatches even without founder session entries", async () => {
    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:main:main"
          ? {
              sessionId: "main-session",
              updatedAt: Date.now(),
            }
          : undefined,
    }));

    await writeGenesisWorkflowDispatch({
      runId: "workflow-run-founder-fallback",
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      intensity: 0.9,
      lane: "workflow",
      dispatchMode: "immediate",
      climateKind: "search",
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "builder",
          sessionKey: "agent:builder:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
        {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
      ],
      supportSessionKeys: ["agent:builder:main", "agent:creator:main"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      updatedAt: 777777,
    });

    const lineagesDir = path.join(stateDir, "genesis", "lineages");
    await vi.waitFor(async () => {
      const files = await fs.readdir(lineagesDir);
      expect(files).toEqual(expect.arrayContaining(["builder.json", "creator.json"]));
    });

    await fs.writeFile(
      path.join(lineagesDir, "builder.json"),
      `${JSON.stringify(
        {
          lineageId: "builder",
          specialtyOrigin: "builder",
          latestSessionKey: "agent:builder:main",
          completionCount: 1,
          lastCompletionTs: 777700,
          accumulatedPrivilegeTax: 0,
          publicValue: 0.9,
          privateValue: 0.2,
          survivalCredit: 1.1,
          expansionCredit: 0.8,
          ecologyState: "active",
          updatedAt: 777700,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(lineagesDir, "creator.json"),
      `${JSON.stringify(
        {
          lineageId: "creator",
          specialtyOrigin: "creator",
          latestSessionKey: "agent:creator:main",
          completionCount: 1,
          lastCompletionTs: 777700,
          accumulatedPrivilegeTax: 0,
          publicValue: 0.9,
          privateValue: 0.2,
          survivalCredit: 1.1,
          expansionCredit: 0.8,
          ecologyState: "active",
          updatedAt: 777700,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await writeGenesisWorkflowDispatch({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      lane: "workflow",
      dispatchMode: "immediate",
      climateKind: "search",
      intensity: 0.75,
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "builder",
          sessionKey: "agent:builder:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
        {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
      ],
      supportSessionKeys: ["agent:builder:main", "agent:creator:main"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      updatedAt: 777790,
    });

    const builderLineage = JSON.parse(
      await fs.readFile(path.join(lineagesDir, "builder.json"), "utf-8"),
    ) as Record<string, unknown>;
    const creatorLineage = JSON.parse(
      await fs.readFile(path.join(lineagesDir, "creator.json"), "utf-8"),
    ) as Record<string, unknown>;
    const lineageFiles = await fs.readdir(lineagesDir);
    const workflowChildFile = lineageFiles.find((name) => name.includes("%3A%3Aworkflow%3A%3A"));
    expect(workflowChildFile).toBeTruthy();
    const workflowChild = JSON.parse(
      await fs.readFile(path.join(lineagesDir, workflowChildFile!), "utf-8"),
    ) as Record<string, unknown>;
    const builderFocusRecord = JSON.parse(
      await fs.readFile(
        path.join(stateDir, "genesis", "focus", `${encodeURIComponent("builder")}.json`),
        "utf-8",
      ),
    ) as { items?: Array<Record<string, unknown>>; triggers?: Array<Record<string, unknown>> };
    const creatorFocusRecord = JSON.parse(
      await fs.readFile(
        path.join(stateDir, "genesis", "focus", `${encodeURIComponent("creator")}.json`),
        "utf-8",
      ),
    ) as { items?: Array<Record<string, unknown>>; triggers?: Array<Record<string, unknown>> };
    const lineageSummary = JSON.parse(
      await fs.readFile(resolveGenesisLineageSummaryPath(process.env), "utf-8"),
    ) as {
      vitalitySummary?: {
        childLineageCount?: number;
        proactiveWorkingLineageCount?: number;
        activeFocusLineageCount?: number;
        activeTriggerCount?: number;
      };
    };

    expect(builderLineage).toMatchObject({
      lineageId: "builder",
      latestSessionKey: "agent:builder:main",
      completionCount: 1,
      ecologyState: expect.any(String),
    });
    expect(creatorLineage).toMatchObject({
      lineageId: "creator",
      latestSessionKey: "agent:creator:main",
      specialtyOrigin: "creator",
      completionCount: 1,
      ecologyState: expect.any(String),
    });
    expect(workflowChild).toMatchObject({
      inheritanceMode: "hybrid",
      superpowerInherited: true,
    });
    expect(["builder", "creator"]).toContain(workflowChild.parentLineageId);
    expect(["builder", "creator"]).toContain(workflowChild.specialtyOrigin);
    expect(builderFocusRecord.items?.[0]).toMatchObject({
      domain: "workflow",
      status: "active",
    });
    expect(builderFocusRecord.triggers?.[0]).toMatchObject({
      status: "active",
      triggerMode: "search",
    });
    expect(creatorFocusRecord.items?.[0]).toMatchObject({
      domain: "scenario_generation",
      status: "active",
    });
    expect(lineageSummary.vitalitySummary?.activeFocusLineageCount ?? 0).toBeGreaterThan(0);
    expect(lineageSummary.vitalitySummary?.activeTriggerCount ?? 0).toBeGreaterThan(0);
    expect(lineageSummary.vitalitySummary?.proactiveWorkingLineageCount ?? 0).toBeGreaterThan(0);
    expect(lineageSummary.vitalitySummary?.childLineageCount ?? 0).toBeGreaterThan(0);
  });

  it("extends repeated live workflow dispatches into multigeneration child chains", async () => {
    const baseTs = Date.now();
    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:main:main"
          ? {
              sessionId: "main-session",
              updatedAt: Date.now(),
            }
          : undefined,
    }));

    const baseDispatch = {
      primaryAgentId: "main" as const,
      primarySessionKey: "agent:main:main",
      lane: "workflow" as const,
      dispatchMode: "immediate" as const,
      climateKind: "search" as const,
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary" as const,
          action: "lead" as const,
          ecologyState: "active" as const,
          queued: true,
          lane: "workflow" as const,
          dispatchMode: "immediate" as const,
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "support" as const,
          action: "assist" as const,
          ecologyState: "active" as const,
          queued: true,
          lane: "workflow" as const,
          dispatchMode: "immediate" as const,
          delayMs: 0,
          priorityBias: 1,
        },
      ],
      supportSessionKeys: ["agent:creator:main"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
    };

    const worldStatePath = path.join(stateDir, "genesis", "world-state.json");
    await fs.mkdir(path.dirname(worldStatePath), { recursive: true });
    await fs.writeFile(
      worldStatePath,
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 0,
          cumulativeIntensity: 2.2,
          currentPressure: 1.6,
          stormMomentum: 1.8,
          replicationBoost: 1.4,
          triggerCounts: {
            cron: 0,
            heartbeat: 0,
            workflow: 1,
          },
          updatedAt: baseTs - 200,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    const creatorLineagePath = path.join(
      stateDir,
      "genesis",
      "lineages",
      `${encodeURIComponent("creator")}.json`,
    );
    await fs.mkdir(path.dirname(creatorLineagePath), { recursive: true });
    await fs.writeFile(
      creatorLineagePath,
      `${JSON.stringify(
        {
          lineageId: "creator",
          specialtyOrigin: "creator",
          latestSessionKey: "agent:creator:main",
          completionCount: 1,
          lastCompletionTs: baseTs - 150,
          accumulatedPrivilegeTax: 0,
          publicValue: 1.25,
          privateValue: 0.2,
          survivalCredit: 1.9,
          expansionCredit: 1.35,
          ecologyState: "active",
          updatedAt: baseTs - 150,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await writeGenesisWorkflowDispatch({
      ...baseDispatch,
      runId: "workflow-run-generation-1",
      intensity: 0.9,
      updatedAt: baseTs,
    });

    const lineagesDir = path.join(stateDir, "genesis", "lineages");
    const generationOneFiles = await fs.readdir(lineagesDir);
    const firstGenerationWorkflowChild = generationOneFiles.find((name) => name.includes("%3A%3Aworkflow%3A%3A"));
    expect(firstGenerationWorkflowChild).toBeTruthy();
    const firstGenerationWorkflowChildPath = path.join(lineagesDir, firstGenerationWorkflowChild!);
    const firstGenerationWorkflowRecord = JSON.parse(
      await fs.readFile(firstGenerationWorkflowChildPath, "utf-8"),
    ) as Record<string, unknown>;
    await fs.writeFile(
      firstGenerationWorkflowChildPath,
      `${JSON.stringify(
        {
          ...firstGenerationWorkflowRecord,
          completionCount: 1,
          lastCompletionTs: baseTs + 50,
          lastReason: "workflow_complete",
          updatedAt: baseTs + 50,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    await writeGenesisWorkflowDispatch({
      ...baseDispatch,
      runId: "workflow-run-generation-2",
      intensity: 0.95,
      updatedAt: baseTs + 100,
    });

    const lineageFiles = await fs.readdir(lineagesDir);
    const workflowChildren = lineageFiles.filter((name) => name.includes("%3A%3Aworkflow%3A%3A"));
    expect(workflowChildren.length).toBeGreaterThanOrEqual(2);

    const workflowRecords = await Promise.all(
      workflowChildren.map(async (name) =>
        JSON.parse(await fs.readFile(path.join(lineagesDir, name), "utf-8")) as Record<string, unknown>,
      ),
    );
    const secondGenerationChild = workflowRecords.find(
      (record) =>
        typeof record.parentLineageId === "string" &&
        (record.parentLineageId as string).includes("::workflow::"),
    );
    expect(secondGenerationChild).toMatchObject({
      inheritanceMode: "hybrid",
      superpowerInherited: true,
      lastReason: "workflow_seed",
    });
    const firstGenerationChild = workflowRecords.find(
      (record) =>
        typeof record.parentLineageId === "string" &&
        !(record.parentLineageId as string).includes("::workflow::"),
    );
    expect(firstGenerationChild).toBeTruthy();
    expect(secondGenerationChild?.parentLineageId).toBe(firstGenerationChild?.lineageId);
    expect(secondGenerationChild?.specialtyOrigin).toBe(firstGenerationChild?.specialtyOrigin);

    const lineageSummary = JSON.parse(
      await fs.readFile(resolveGenesisLineageSummaryPath(process.env), "utf-8"),
    ) as {
      vitalitySummary?: {
        childLineageCount?: number;
        multiGenerationLineageCount?: number;
        secondGenerationChildCount?: number;
        deepestGenerationDepth?: number;
        activeFocusLineageCount?: number;
        activeTriggerCount?: number;
      };
    };

    expect(lineageSummary.vitalitySummary?.childLineageCount ?? 0).toBeGreaterThanOrEqual(2);
    expect(lineageSummary.vitalitySummary?.multiGenerationLineageCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(lineageSummary.vitalitySummary?.secondGenerationChildCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(lineageSummary.vitalitySummary?.deepestGenerationDepth ?? 0).toBeGreaterThanOrEqual(2);
    expect(lineageSummary.vitalitySummary?.activeFocusLineageCount ?? 0).toBeGreaterThanOrEqual(2);
    expect(lineageSummary.vitalitySummary?.activeTriggerCount ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("assigns children only compact closable workflow tasks", async () => {
    const baseTs = Date.now();
    const lineagesDir = path.join(stateDir, "genesis", "lineages");
    await fs.mkdir(lineagesDir, { recursive: true });
    await fs.writeFile(
      path.join(lineagesDir, `${encodeURIComponent("creator::workflow::seed-1")}.json`),
      `${JSON.stringify(
        {
          lineageId: "creator::workflow::seed-1",
          parentLineageId: "creator",
          inheritanceMode: "hybrid",
          specialtyOrigin: "creator",
          superpowerInherited: true,
          latestSessionKey: "agent:creator:child",
          completionCount: 0,
          lastCompletionTs: baseTs,
          accumulatedPrivilegeTax: 0.2,
          publicValue: 0.25,
          privateValue: 0.08,
          survivalCredit: 0.3,
          expansionCredit: 0.24,
          ecologyState: "active",
          updatedAt: baseTs,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:creator:child"
          ? {
              sessionId: "creator-child-session",
              genesisParentLineageId: "creator",
              genesisSpecialtyOrigin: "creator",
              updatedAt: baseTs,
            }
          : sessionKey === "agent:main:main"
            ? {
                sessionId: "main-session",
                updatedAt: baseTs,
              }
            : undefined,
    }));

    await writeGenesisWorkflowDispatch({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      lane: "workflow",
      dispatchMode: "immediate",
      climateKind: "command",
      intensity: 0.9,
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "creator",
          sessionKey: "agent:creator:child",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
      ],
      supportSessionKeys: ["agent:creator:child"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      updatedAt: baseTs,
    });

    const proactiveEntries = await readJsonLines(resolveGenesisProactiveWorkLogPath(process.env));
    const childTask = proactiveEntries.find(
      (entry) => entry.lineageId === "creator::workflow::seed-1" && entry.workType === "synthesis",
    );
    expect(childTask).toBeTruthy();
    expect(String(childTask?.task ?? "")).not.toContain("主动整理方案、内容、策略和可交付表达");
  });

  it("credits founder completions back into the assigned child lineage", async () => {
    const baseTs = Date.now();
    const lineagesDir = path.join(stateDir, "genesis", "lineages");
    await fs.mkdir(lineagesDir, { recursive: true });
    await fs.writeFile(
      path.join(lineagesDir, `${encodeURIComponent("creator::workflow::seed-main")}.json`),
      `${JSON.stringify(
        {
          lineageId: "creator::workflow::seed-main",
          parentLineageId: "creator",
          inheritanceMode: "hybrid",
          specialtyOrigin: "creator",
          superpowerInherited: true,
          latestSessionKey: "agent:creator:main::child:0",
          completionCount: 0,
          lastCompletionTs: baseTs,
          lastReason: "workflow_seed",
          accumulatedPrivilegeTax: 0.2,
          publicValue: 0.25,
          privateValue: 0.08,
          survivalCredit: 0.3,
          expansionCredit: 0.24,
          ecologyState: "active",
          updatedAt: baseTs,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:creator:main"
          ? {
              sessionId: "creator-main-session",
              genesisSpecialtyOrigin: "creator",
              updatedAt: baseTs,
            }
          : sessionKey === "agent:main:main"
            ? {
                sessionId: "main-session",
                updatedAt: baseTs,
              }
            : undefined,
    }));

    await writeGenesisWorkflowDispatch({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      lane: "workflow",
      dispatchMode: "immediate",
      climateKind: "command",
      intensity: 0.9,
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
      ],
      supportSessionKeys: ["agent:creator:main"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      updatedAt: baseTs,
    });

    await writeGenesisRunCompletion({
      sessionKey: "agent:creator:main",
      reason: "child_task_closed",
      ts: baseTs + 100,
    });

    const childLineage = JSON.parse(
      await fs.readFile(path.join(lineagesDir, `${encodeURIComponent("creator::workflow::seed-main")}.json`), "utf-8"),
    ) as Record<string, unknown>;
    expect(childLineage).toMatchObject({
      lineageId: "creator::workflow::seed-main",
      latestSessionKey: "agent:creator:main",
      completionCount: 1,
      lastReason: "child_task_closed",
    });
  });

  it("records founder proactive work plans and completions into a live summary", async () => {
    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:builder:main"
          ? {
              sessionId: "builder-session",
              genesisLineageId: "builder",
              genesisSpecialtyOrigin: "builder",
              updatedAt: Date.now(),
            }
          : sessionKey === "agent:main:main"
            ? {
                sessionId: "main-session",
                updatedAt: Date.now(),
              }
            : undefined,
    }));

    await writeGenesisWorkflowDispatch({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      lane: "workflow",
      dispatchMode: "immediate",
      climateKind: "query",
      intensity: 0.8,
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "builder",
          sessionKey: "agent:builder:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 1,
        },
      ],
      supportSessionKeys: ["agent:builder:main"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      updatedAt: Date.now(),
    });

    await writeGenesisRunCompletion({
      sessionKey: "agent:builder:main",
      reason: "workflow_complete",
      ts: Date.now() + 25,
    });

    const proactiveSummary = JSON.parse(
      await fs.readFile(resolveGenesisProactiveWorkSummaryPath(process.env), "utf-8"),
    ) as {
      totalEntryCount?: number;
      plannedCount?: number;
      completedCount?: number;
      highestActiveFounderOrigin?: string | null;
      recentEntries?: Array<{ founderOrigin?: string; workType?: string; status?: string }>;
    };
    expect(proactiveSummary.totalEntryCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(proactiveSummary.completedCount ?? 0).toBeGreaterThanOrEqual(1);
    expect(proactiveSummary.highestActiveFounderOrigin).toBe("builder");
    expect(
      proactiveSummary.recentEntries?.some(
        (entry) => entry.founderOrigin === "builder" && entry.workType === "tooling",
      ),
    ).toBe(true);
  });

  it("lets command pressure seed multiple workflow children in a single dispatch", async () => {
    const baseTs = Date.now();
    const profilePath = path.join(stateDir, "genesis", "experiment-profile.json");
    await fs.mkdir(path.dirname(profilePath), { recursive: true });
    await fs.writeFile(
      profilePath,
      `${JSON.stringify(
        {
          workflowReplicationRecentChildCooldownMs: 5 * 60 * 1000,
          workflowReplicationSeedBaseCount: 1,
          workflowReplicationSeedCommandBonus: 1,
          workflowReplicationSeedIntensityBonusThreshold: 0.85,
          workflowReplicationSeedIntensityBonus: 1,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    sessionUtilsMock.loadSessionEntry.mockImplementation((sessionKey: string) => ({
      canonicalKey: sessionKey,
      entry:
        sessionKey === "agent:main:main"
          ? {
              sessionId: "main-session",
              updatedAt: baseTs,
            }
          : {
              sessionId: `${sessionKey}-session`,
              genesisLineageId: sessionKey.split(":")[1] ?? sessionKey,
              genesisSpecialtyOrigin: sessionKey.split(":")[1] ?? sessionKey,
              updatedAt: baseTs,
            },
    }));

    const worldStatePath = path.join(stateDir, "genesis", "world-state.json");
    await fs.mkdir(path.dirname(worldStatePath), { recursive: true });
    await fs.writeFile(
      worldStatePath,
      `${JSON.stringify(
        {
          totalEnvironmentEvents: 1,
          totalRunCompletions: 0,
          cumulativeIntensity: 2.5,
          currentPressure: 1.9,
          stormMomentum: 1.7,
          replicationBoost: 1.6,
          triggerCounts: {
            cron: 0,
            heartbeat: 0,
            workflow: 1,
          },
          updatedAt: baseTs - 200,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    for (const founder of ["creator", "scout", "negotiator"]) {
      const lineagePath = path.join(
        stateDir,
        "genesis",
        "lineages",
        `${encodeURIComponent(founder)}.json`,
      );
      await fs.mkdir(path.dirname(lineagePath), { recursive: true });
      await fs.writeFile(
        lineagePath,
        `${JSON.stringify(
          {
            lineageId: founder,
            specialtyOrigin: founder,
            latestSessionKey: `agent:${founder}:main`,
            completionCount: 2,
            lastCompletionTs: baseTs - 150,
            accumulatedPrivilegeTax: 0,
            publicValue: 1.4,
            privateValue: 0.3,
            survivalCredit: 2.1,
            expansionCredit: 1.6,
            ecologyState: "active",
            updatedAt: baseTs - 150,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );
    }

    await writeGenesisWorkflowDispatch({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      lane: "workflow",
      dispatchMode: "immediate",
      climateKind: "command",
      intensity: 0.95,
      requestSummary: "Expand the Genesis society aggressively based on the latest operator command.",
      assignments: [
        {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
        {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 2,
        },
        {
          agentId: "scout",
          sessionKey: "agent:scout:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 2,
        },
        {
          agentId: "negotiator",
          sessionKey: "agent:negotiator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 2,
        },
      ],
      supportSessionKeys: ["agent:creator:main", "agent:scout:main", "agent:negotiator:main"],
      reviveSessionKeys: [],
      deferredAgentIds: [],
      runId: "workflow-run-multi-seed",
      updatedAt: baseTs,
    });

    const lineagesDir = path.join(stateDir, "genesis", "lineages");
    const lineageFiles = await fs.readdir(lineagesDir);
    const workflowChildren = lineageFiles.filter((name) => name.includes("%3A%3Aworkflow%3A%3A"));
    expect(workflowChildren.length).toBeGreaterThanOrEqual(2);

    const lineageSummary = JSON.parse(
      await fs.readFile(resolveGenesisLineageSummaryPath(process.env), "utf-8"),
    ) as {
      vitalitySummary?: {
        childLineageCount?: number;
      };
    };
    expect(lineageSummary.vitalitySummary?.childLineageCount ?? 0).toBeGreaterThanOrEqual(2);
  });
});
