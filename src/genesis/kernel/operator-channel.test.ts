import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workflowMocks = vi.hoisted(() => ({
  enqueueSystemEvent: vi.fn(),
  resolveGenesisLineageDispatchDecision: vi.fn(),
}));

const sessionUtilsMock = vi.hoisted(() => ({
  loadSessionEntry: vi.fn(),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: workflowMocks.enqueueSystemEvent,
}));

vi.mock("./state.js", async () => {
  const actual = await vi.importActual<typeof import("./state.js")>("./state.js");
  return {
    ...actual,
    resolveGenesisLineageDispatchDecision: workflowMocks.resolveGenesisLineageDispatchDecision,
  };
});

vi.mock("../../gateway/session-utils.js", () => ({
  loadSessionEntry: (sessionKey: string) => sessionUtilsMock.loadSessionEntry(sessionKey),
}));

import { runGenesisOperatorChannelTurn } from "./operator-channel.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-operator-channel-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
  workflowMocks.enqueueSystemEvent.mockReset();
  workflowMocks.enqueueSystemEvent.mockReturnValue(true);
  workflowMocks.resolveGenesisLineageDispatchDecision.mockReset();
  workflowMocks.resolveGenesisLineageDispatchDecision.mockImplementation((lineageId: string) => ({
    lineageId,
    ecologyState: lineageId === "auditor" ? "stressed" : "active",
    proactiveAllowed: true,
    pressure: 0,
  }));
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

describe("Genesis operator channel", () => {
  it("routes channel search prompts into climate dispatch and user intent history", async () => {
    const result = await runGenesisOperatorChannelTurn({
      cfg: { session: { mainKey: "main" } } as never,
      primarySessionKey: "agent:main:main",
      primaryAgentId: "main",
      channel: "slack",
      senderLabel: "operator",
      body: "Search the latest recovery signals and query coordination issues for this incident.",
      candidateAgentIds: ["main", "builder", "creator", "auditor", "negotiator"],
      requestId: "operator-run-1",
      timestamp: 1000,
    });

    expect(result).not.toBeNull();
    expect(result?.climateKind).toBe("search");
    expect(result?.dispatch.forcedCollaboration).toBe(true);
    expect(result?.dispatch.mobilizedCoverageRatio).toBeGreaterThanOrEqual(0.8);
    expect(result?.summary.userIntentSummary?.historyEntryCount ?? 0).toBeGreaterThan(0);
    expect(result?.summary.collaborationSummary?.mobilizedAgentCount ?? 0).toBeGreaterThanOrEqual(3);
    expect(result?.report.lines.join("\n")).toContain("climate=search");
    expect(result?.report.lines.join("\n")).toContain("lead=main");
  });
});
