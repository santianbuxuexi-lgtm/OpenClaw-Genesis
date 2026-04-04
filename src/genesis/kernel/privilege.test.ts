import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeGenesisPrivilege,
  resolveGenesisPrivilegeOverride,
  resolveGenesisRuntimeProfile,
} from "./privilege.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-privilege-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis privilege", () => {
  it("defaults runtime profile to observe", () => {
    expect(resolveGenesisRuntimeProfile()).toBe("observe");
    expect(resolveGenesisRuntimeProfile({ genesis: { runtimeProfile: "lab" } } as never)).toBe(
      "lab",
    );
  });

  it("grants host execution to allowlisted agents in lab mode", () => {
    const override = resolveGenesisPrivilegeOverride({
      cfg: {
        genesis: {
          runtimeProfile: "lab",
          hostAllowlist: ["builder", "scout"],
        },
      } as never,
      agentId: "builder",
    });

    expect(override).toEqual({
      allowed: true,
      mode: "off",
      workspaceAccess: "rw",
      privilegeTax: 2.5,
      reason: "genesis_lab_allowlist",
    });
  });

  it("denies privilege outside the allowlist or outside lab mode", () => {
    expect(
      resolveGenesisPrivilegeOverride({
        cfg: {
          genesis: {
            runtimeProfile: "observe",
            hostAllowlist: ["builder"],
          },
        } as never,
        agentId: "builder",
      }),
    ).toBeNull();

    expect(
      authorizeGenesisPrivilege({
        cfg: {
          genesis: {
            runtimeProfile: "lab",
            hostAllowlist: ["builder"],
          },
        } as never,
        agentId: "creator",
      }),
    ).toMatchObject({
      allowed: false,
      privilegeTax: 0,
      reason: "genesis_privilege_denied",
    });
  });

  it("denies lab privilege when lineage credits are exhausted", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 4,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 0.5,
        expansionCredit: 0.25,
        ecologyState: "stressed",
        updatedAt: 10,
      }),
    );

    expect(
      authorizeGenesisPrivilege({
        cfg: {
          genesis: {
            runtimeProfile: "lab",
            hostAllowlist: ["builder"],
          },
        } as never,
        agentId: "builder",
        lineageId: "builder_founder",
      }),
    ).toMatchObject({
      allowed: false,
      reason: "genesis_lineage_extinct",
    });
  });

  it("uses experiment profile to relax privilege survival and expansion thresholds", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0.5,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 1.1,
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
        currentPressure: 1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );
    await fs.writeFile(
      path.join(stateDir, "genesis", "experiment-profile.json"),
      JSON.stringify({
        labPrivilegeTax: 1.25,
        privilegeRequiredSurvivalFloor: 0.2,
        privilegeRequiredSurvivalPressureGain: 0.2,
        privilegeRequiredExpansionBase: 0.1,
        privilegeRequiredExpansionPressureGain: 0.05,
      }),
    );

    expect(
      authorizeGenesisPrivilege({
        cfg: {
          genesis: {
            runtimeProfile: "lab",
            hostAllowlist: ["builder"],
          },
        } as never,
        agentId: "builder",
        lineageId: "builder_founder",
      }),
    ).toMatchObject({
      allowed: true,
      privilegeTax: 1.25,
      reason: "genesis_lab_allowlist",
    });
  });

  it("lets skill evolution lower privilege thresholds for stronger lineages", async () => {
    await fs.mkdir(path.join(stateDir, "genesis", "lineages"), { recursive: true });
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "lineages", `${encodeURIComponent("builder_founder")}.json`),
      JSON.stringify({
        lineageId: "builder_founder",
        latestSessionKey: "agent:builder:main",
        completionCount: 3,
        lastCompletionTs: 10,
        accumulatedPrivilegeTax: 0.25,
        publicValue: 1,
        privateValue: 0,
        survivalCredit: 1.05,
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
        currentPressure: 1,
        triggerCounts: { cron: 1, heartbeat: 1, workflow: 1 },
        updatedAt: 10,
      }),
    );

    const baseline = authorizeGenesisPrivilege({
      cfg: {
        genesis: {
          runtimeProfile: "lab",
          hostAllowlist: ["builder"],
        },
      } as never,
      agentId: "builder",
      lineageId: "builder_founder",
    });
    expect(baseline).toMatchObject({
      allowed: false,
      reason: "genesis_privilege_credit_insufficient",
    });

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
            lineageId: "builder_founder",
            eventCount: 4,
            fixCount: 0,
            derivedCount: 1,
            capturedCount: 3,
            lastMode: "captured",
          },
        ],
      }),
    );

    const decision = authorizeGenesisPrivilege({
      cfg: {
        genesis: {
          runtimeProfile: "lab",
          hostAllowlist: ["builder"],
        },
      } as never,
      agentId: "builder",
      lineageId: "builder_founder",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "genesis_lab_allowlist",
    });
  });
});
