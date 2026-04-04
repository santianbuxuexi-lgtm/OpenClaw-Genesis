import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGenesisSkillCapabilitySummarySync } from "./skill-capability.js";

describe("readGenesisSkillCapabilitySummarySync", () => {
  let stateDir: string;
  let workspaceDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    previousCwd = process.cwd();
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-capability-state-"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-capability-workspace-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    await fs.mkdir(path.join(workspaceDir, "skills", "search-scout"), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, "skills", "publish-creator"), { recursive: true });
    await fs.mkdir(path.join(workspaceDir, "skills", "tool-builder"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "skills", "search-scout", "SKILL.md"),
      [
        "---",
        'summary: "Research and signal scout"',
        "---",
        "# Search Scout",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceDir, "skills", "publish-creator", "SKILL.md"),
      [
        "---",
        'summary: "Publish social content"',
        "---",
        "# Publish Creator",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceDir, "skills", "tool-builder", "SKILL.md"),
      [
        "---",
        'summary: "Build reusable workflow tool"',
        "---",
        "# Tool Builder",
      ].join("\n"),
      "utf8",
    );
    process.chdir(workspaceDir);
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    vi.unstubAllEnvs();
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("summarizes ready skills and founder-oriented capability lanes", () => {
    const summary = readGenesisSkillCapabilitySummarySync(process.env);

    expect(summary.workspaceDir).toBe(path.resolve(workspaceDir));
    expect(summary.totalSkillCount).toBeGreaterThanOrEqual(3);
    expect(summary.readySkillCount).toBeGreaterThanOrEqual(3);
    expect(summary.researchCapableSkillCount).toBeGreaterThanOrEqual(1);
    expect(summary.publishCapableSkillCount).toBeGreaterThanOrEqual(1);
    expect(summary.automationCapableSkillCount).toBeGreaterThanOrEqual(1);
    expect(summary.readySkillNames.length).toBeGreaterThan(0);
    expect(summary.highestSkillCapabilityFounderOrigin).toBeTruthy();
    expect(summary.founderSkillLeaders.some((entry) => entry.readySkillCount > 0)).toBe(true);
    expect(summary.founderSkillLeaders).toHaveLength(5);
  });
});
