import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { primeGenesisWorkflowDispatch } from "./workflow.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-workflow-routing-"));
  tempDirs.push(root);
  return {
    ...process.env,
    OPENCLAW_STATE_DIR: root,
  };
}

describe("primeGenesisWorkflowDispatch founder climate routing", () => {
  it("prioritizes scout for search climate forced coverage", () => {
    const env = makeTempEnv();
    const previousEnv = process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = env.OPENCLAW_STATE_DIR;
    try {
      const dispatch = primeGenesisWorkflowDispatch({
        cfg: {},
        primarySessionKey: "agent:main:main",
        primaryAgentId: "main",
        climateKind: "search",
        message: "search the latest recovery signals",
        candidateAgentIds: ["main", "builder", "creator", "auditor", "negotiator", "scout"],
      });

      expect(dispatch).not.toBeNull();
      const mobilizedIds = dispatch?.mobilized.map((entry) => entry.agentId) ?? [];
      expect(mobilizedIds).toEqual(
        expect.arrayContaining(["main", "scout", "auditor", "creator", "negotiator"]),
      );
      expect(mobilizedIds.indexOf("scout")).toBeGreaterThanOrEqual(0);
      expect(mobilizedIds.indexOf("builder")).toBeGreaterThanOrEqual(0);
      expect(mobilizedIds.indexOf("scout")).toBeLessThan(mobilizedIds.indexOf("builder"));
      expect(dispatch?.forcedCollaboration).toBe(true);
      expect(dispatch?.targetCoverageRatio).toBeGreaterThan(0.8);
    } finally {
      if (previousEnv === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousEnv;
      }
    }
  });
});
