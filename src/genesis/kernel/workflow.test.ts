import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  enqueueSystemEvent: vi.fn(),
  resolveGenesisLineageDispatchDecision: vi.fn(),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: mocks.enqueueSystemEvent,
}));

vi.mock("./state.js", async () => {
  const actual = await vi.importActual<typeof import("./state.js")>("./state.js");
  return {
    ...actual,
    resolveGenesisLineageDispatchDecision: mocks.resolveGenesisLineageDispatchDecision,
  };
});

import {
  primeGenesisWorkflowDispatch,
  resolveGenesisClimateEventKind,
  resolveGenesisSchedulingFromAssignment,
  resolveGenesisSocietyDispatchPlan,
  resolveGenesisWorkflowScheduling,
  resolveGenesisWorkflowShockIntensity,
} from "./workflow.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-workflow-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("primeGenesisWorkflowDispatch", () => {
  it("mobilizes primary and active support lineages while deferring stressed support under low shock", () => {
    mocks.enqueueSystemEvent.mockReset();
    mocks.enqueueSystemEvent.mockReturnValue(true);
    mocks.resolveGenesisLineageDispatchDecision.mockImplementation((lineageId: string) => ({
      lineageId,
      ecologyState:
        lineageId === "auditor" ? "stressed" : lineageId === "main" ? "active" : "active",
      proactiveAllowed: true,
      pressure: 0,
    }));

    const result = primeGenesisWorkflowDispatch({
      cfg: { session: { mainKey: "main" } } as never,
      primarySessionKey: "agent:main:main",
      primaryAgentId: "main",
      climateKind: "workflow",
      candidateAgentIds: ["main", "builder", "auditor"],
      message: "Handle the current workflow shock.",
      requestId: "run-1",
    });

    expect(result).toMatchObject({
      primaryAgentId: "main",
      deferredAgentIds: ["auditor"],
      revivedAgentIds: [],
      mobilizedSessionKeys: ["agent:main:main", "agent:builder:main"],
    });
    expect(mocks.enqueueSystemEvent).toHaveBeenCalledTimes(2);
  });

  it("revives dormant and extinct support lineages under stronger workflow storms", () => {
    mocks.enqueueSystemEvent.mockReset();
    mocks.enqueueSystemEvent.mockReturnValue(true);
    mocks.resolveGenesisLineageDispatchDecision.mockImplementation((lineageId: string) => ({
      lineageId,
      ecologyState:
        lineageId === "creator" ? "dormant" : lineageId === "auditor" ? "extinct" : "active",
      proactiveAllowed: true,
      pressure: 0,
    }));

    const result = primeGenesisWorkflowDispatch({
      cfg: { session: { mainKey: "main" } } as never,
      primarySessionKey: "agent:main:main",
      primaryAgentId: "main",
      climateKind: "workflow",
      candidateAgentIds: ["main", "creator", "auditor"],
      message: "A severe cross-system incident hit production and requires immediate multi-lineage coordination with logs, visuals, and recovery planning.",
      imageCount: 2,
      internalEventCount: 1,
      requestId: "run-2",
    });

    expect(result?.revivedAgentIds).toEqual(["creator", "auditor"]);
    expect(result?.mobilized).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: "creator", mode: "revive", queued: true }),
        expect.objectContaining({ agentId: "auditor", mode: "revive", queued: true }),
      ]),
    );
    expect(mocks.enqueueSystemEvent).toHaveBeenCalledTimes(3);
  });

  it("uses experiment profile thresholds to revive lineages under milder shocks", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-workflow-profile-"));
    try {
      vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
      await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
      await fs.writeFile(
        path.join(stateDir, "genesis", "experiment-profile.json"),
        `${JSON.stringify(
          {
            stressedSupportThreshold: 0.8,
            dormantReviveThreshold: 0.8,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );
      mocks.enqueueSystemEvent.mockReset();
      mocks.enqueueSystemEvent.mockReturnValue(true);
      mocks.resolveGenesisLineageDispatchDecision.mockImplementation((lineageId: string) => ({
        lineageId,
        ecologyState:
          lineageId === "creator" ? "dormant" : lineageId === "auditor" ? "stressed" : "active",
        proactiveAllowed: true,
        pressure: 0,
      }));

      const result = primeGenesisWorkflowDispatch({
        cfg: { session: { mainKey: "main" } } as never,
        primarySessionKey: "agent:main:main",
        primaryAgentId: "main",
        climateKind: "workflow",
        candidateAgentIds: ["main", "creator", "auditor"],
        message: "Handle this workflow issue quickly.",
        internalEventCount: 1,
        requestId: "run-profile",
      });

      expect(result?.revivedAgentIds).toEqual(["creator"]);
      expect(result?.deferredAgentIds).toEqual([]);
      expect(result?.mobilized).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ agentId: "creator", mode: "revive" }),
          expect.objectContaining({ agentId: "auditor", mode: "support" }),
        ]),
      );
    } finally {
      vi.unstubAllEnvs();
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });

  it("forces high-coverage collaboration for search climate events", () => {
    mocks.enqueueSystemEvent.mockReset();
    mocks.enqueueSystemEvent.mockReturnValue(true);
    mocks.resolveGenesisLineageDispatchDecision.mockImplementation((lineageId: string) => ({
      lineageId,
      ecologyState:
        lineageId === "creator"
          ? "dormant"
          : lineageId === "auditor"
            ? "stressed"
            : lineageId === "planner"
              ? "active"
              : "active",
      proactiveAllowed: true,
      pressure: 0,
    }));

    const result = primeGenesisWorkflowDispatch({
      cfg: { session: { mainKey: "main" } } as never,
      primarySessionKey: "agent:main:main",
      primaryAgentId: "main",
      candidateAgentIds: ["main", "builder", "creator", "auditor", "planner"],
      message: "Please search the market and query the latest signals for this task.",
      requestId: "run-search",
    });

    expect(result).toMatchObject({
      climateKind: "search",
      forcedCollaboration: true,
      availableAgentCount: 5,
      targetCoverageRatio: 0.85,
      mobilizedCoverageRatio: 0.8,
      deferredAgentIds: ["creator"],
    });
    expect(result?.mobilized).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: "main", mode: "primary" }),
        expect.objectContaining({ agentId: "builder", mode: "support" }),
        expect.objectContaining({ agentId: "auditor", mode: "support" }),
        expect.objectContaining({ agentId: "planner", mode: "support" }),
      ]),
    );
    expect(mocks.enqueueSystemEvent).toHaveBeenCalledTimes(4);
  });
});

describe("resolveGenesisWorkflowShockIntensity", () => {
  it("raises intensity for richer workflow shocks", () => {
    const base = resolveGenesisWorkflowShockIntensity({
      message: "short",
    });
    const richer = resolveGenesisWorkflowShockIntensity({
      message:
        "This workflow shock includes long context, multiple constraints, and requires coordinated action across the society to recover quickly.",
      imageCount: 2,
      internalEventCount: 2,
    });
    expect(richer).toBeGreaterThan(base);
    expect(richer).toBeLessThanOrEqual(1.6);
  });

  it("uses experiment profile to amplify lighter workflow shocks", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-workflow-intensity-"));
    try {
      vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
      await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
      await fs.writeFile(
        path.join(stateDir, "genesis", "experiment-profile.json"),
        `${JSON.stringify(
          {
            workflowBaseIntensity: 0.9,
            workflowLengthThreshold1: 20,
            workflowLengthGain1: 0.2,
            workflowInternalEventGainPerEvent: 0.1,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const intensity = resolveGenesisWorkflowShockIntensity({
        message: "Handle this workflow issue quickly.",
        internalEventCount: 1,
      });

      expect(intensity).toBeGreaterThan(1);
    } finally {
      vi.unstubAllEnvs();
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });
});

describe("resolveGenesisClimateEventKind", () => {
  it("classifies user search and consultation prompts as climate events", () => {
    expect(
      resolveGenesisClimateEventKind({
        message: "请搜索并查询这个问题，再给我咨询建议。",
      }),
    ).toBe("consultation");
    expect(
      resolveGenesisClimateEventKind({
        message: "This is a scheduled reminder for tomorrow morning.",
      }),
    ).toBe("scheduled");
    expect(
      resolveGenesisClimateEventKind({
        message: "We need to finish this requirement today.",
      }),
    ).toBe("requirement");
  });
});


describe("resolveGenesisWorkflowScheduling", () => {
  it("staggeres stressed primary lineages during lower-intensity workflow storms", () => {
    mocks.resolveGenesisLineageDispatchDecision.mockReset();
    mocks.resolveGenesisLineageDispatchDecision.mockReturnValue({
      lineageId: "main",
      ecologyState: "stressed",
      proactiveAllowed: true,
      pressure: 0.5,
    });

    expect(
      resolveGenesisWorkflowScheduling({
        primaryAgentId: "main",
        dispatch: {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 0.9,
          mobilized: [],
          mobilizedSessionKeys: [],
          revivedAgentIds: [],
          deferredAgentIds: [],
        },
      }),
    ).toEqual({
      lane: "workflow-staggered",
      dispatchMode: "staggered",
      delayMs: 75,
      priorityBias: 1,
      ecologyState: "stressed",
    });
  });

  it("escalates to emergency scheduling when workflow storms revive dormant society members", () => {
    mocks.resolveGenesisLineageDispatchDecision.mockReset();
    mocks.resolveGenesisLineageDispatchDecision.mockReturnValue({
      lineageId: "main",
      ecologyState: "active",
      proactiveAllowed: true,
      pressure: 0,
    });

    expect(
      resolveGenesisWorkflowScheduling({
        primaryAgentId: "main",
        dispatch: {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 1.2,
          mobilized: [],
          mobilizedSessionKeys: [],
          revivedAgentIds: ["creator"],
          deferredAgentIds: [],
        },
      }),
    ).toEqual({
      lane: "workflow",
      dispatchMode: "emergency",
      delayMs: 0,
      priorityBias: 4,
      ecologyState: "active",
    });
  });

  it("reuses persisted Genesis assignment scheduling for later session runs", () => {
    expect(
      resolveGenesisSchedulingFromAssignment({
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1.3,
        climateKind: "command",
        forcedCollaboration: true,
        availableAgentCount: 3,
        targetCoverageRatio: 0.8,
        mobilizedCoverageRatio: 1,
        lane: "workflow",
        dispatchMode: "emergency",
        updatedAt: 123,
        assignment: {
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
      }),
    ).toEqual({
        lane: "workflow",
        dispatchMode: "emergency",
        delayMs: 0,
        priorityBias: 4,
        ecologyState: "dormant",
    });
  });
});

describe("resolveGenesisSocietyDispatchPlan", () => {
  it("assigns lead, assist, and reactivate roles across the mobilized society", () => {
    const plan = resolveGenesisSocietyDispatchPlan({
      dispatch: {
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        intensity: 1.2,
        climateKind: "command",
        forcedCollaboration: true,
        availableAgentCount: 3,
        targetCoverageRatio: 0.8,
        mobilizedCoverageRatio: 1,
        mobilized: [
          {
            agentId: "main",
            sessionKey: "agent:main:main",
            ecologyState: "active",
            mode: "primary",
            queued: true,
          },
          {
            agentId: "builder",
            sessionKey: "agent:builder:main",
            ecologyState: "active",
            mode: "support",
            queued: true,
          },
          {
            agentId: "creator",
            sessionKey: "agent:creator:main",
            ecologyState: "dormant",
            mode: "revive",
            queued: true,
          },
        ],
        mobilizedSessionKeys: ["agent:main:main", "agent:builder:main", "agent:creator:main"],
        revivedAgentIds: ["creator"],
        deferredAgentIds: ["auditor"],
      },
      scheduling: {
        lane: "workflow",
        dispatchMode: "emergency",
        delayMs: 0,
        priorityBias: 4,
        ecologyState: "active",
      },
    });

    expect(plan).toEqual({
      primaryAgentId: "main",
      primarySessionKey: "agent:main:main",
      intensity: 1.2,
      climateKind: "command",
      forcedCollaboration: true,
      availableAgentCount: 3,
      targetCoverageRatio: 0.8,
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
          dispatchMode: "emergency",
          delayMs: 0,
          priorityBias: 3,
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
    });
  });
});
