import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  resolveGenesisEcologyState,
  resolveGenesisStateDir,
  type GenesisLineageRecord,
  type GenesisWorldState,
} from "./state.js";

describe("resolveGenesisEcologyState", () => {
  it("keeps freshly participating workflow lineages out of immediate extinction", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-29T03:40:00.000Z"));
      const lineage: GenesisLineageRecord = {
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 0,
        lastCompletionTs: Date.now(),
        accumulatedPrivilegeTax: 0,
        publicValue: 0.20625,
        privateValue: 0.0825,
        survivalCredit: 0.165,
        expansionCredit: 0.165,
        updatedAt: Date.now(),
      };
      const world: GenesisWorldState = {
        totalEnvironmentEvents: 1,
        totalRunCompletions: 0,
        cumulativeIntensity: 0.75,
        currentPressure: 2.0590498748343062,
        stormMomentum: 1.1095777923084746,
        replicationBoost: 0.8056410918902512,
        triggerCounts: {
          cron: 0,
          heartbeat: 0,
          workflow: 1,
        },
        updatedAt: Date.now(),
      };

      expect(resolveGenesisEcologyState({ lineage, world })).toBe("stressed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still lets stale low-vitality lineages fall to extinct", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-29T03:40:00.000Z"));
      const lineage: GenesisLineageRecord = {
        lineageId: "builder",
        latestSessionKey: "agent:builder:main",
        completionCount: 0,
        lastCompletionTs: Date.now() - 2 * 60 * 60_000,
        accumulatedPrivilegeTax: 0,
        publicValue: 0.20625,
        privateValue: 0.0825,
        survivalCredit: 0.165,
        expansionCredit: 0.165,
        updatedAt: Date.now() - 2 * 60 * 60_000,
      };
      const world: GenesisWorldState = {
        totalEnvironmentEvents: 1,
        totalRunCompletions: 0,
        cumulativeIntensity: 0.75,
        currentPressure: 2.0590498748343062,
        stormMomentum: 1.1095777923084746,
        replicationBoost: 0.8056410918902512,
        triggerCounts: {
          cron: 0,
          heartbeat: 0,
          workflow: 1,
        },
        updatedAt: Date.now(),
      };

      expect(resolveGenesisEcologyState({ lineage, world })).toBe("extinct");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps freshly seeded workflow children recoverable instead of dormant", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-29T04:10:00.000Z"));
      const lineage: GenesisLineageRecord = {
        lineageId: "negotiator::workflow::child",
        parentLineageId: "negotiator",
        inheritanceMode: "hybrid",
        specialtyOrigin: "negotiator",
        superpowerInherited: true,
        latestSessionKey: "agent:negotiator:main::child",
        completionCount: 0,
        lastCompletionTs: Date.now(),
        lastReason: "workflow_seed",
        accumulatedPrivilegeTax: 0.2,
        publicValue: 0.17675,
        privateValue: 0.0558,
        survivalCredit: 0.1961,
        expansionCredit: 0.14675,
        updatedAt: Date.now(),
      };
      const world: GenesisWorldState = {
        totalEnvironmentEvents: 2,
        totalRunCompletions: 0,
        cumulativeIntensity: 1.5,
        currentPressure: 2.0590498748343062,
        stormMomentum: 1.1095777923084746,
        replicationBoost: 0.8056410918902512,
        triggerCounts: {
          cron: 0,
          heartbeat: 0,
          workflow: 2,
        },
        updatedAt: Date.now(),
      };

      expect(resolveGenesisEcologyState({ lineage, world })).toBe("stressed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("migrates legacy genesis state into the canonical distribution directory", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-genesis-home-"));
    const legacyDir = path.join(homeDir, ".openclaw", "genesis");
    const canonicalBaseDir = path.join(homeDir, ".openclaw-genesis");
    const canonicalDir = path.join(canonicalBaseDir, "genesis");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, "login-state-pool.json"),
      JSON.stringify({ records: [{ recordId: "toutiao:1", platform: "toutiao" }] }, null, 2),
      "utf-8",
    );

    const resolved = resolveGenesisStateDir({
      ...process.env,
      HOME: homeDir,
      OPENCLAW_STATE_DIR: canonicalBaseDir,
    });

    expect(resolved).toBe(canonicalDir);
    expect(fs.existsSync(path.join(canonicalDir, "login-state-pool.json"))).toBe(true);
    expect(fs.existsSync(path.join(canonicalDir, ".legacy-migrated"))).toBe(true);
  });
});
