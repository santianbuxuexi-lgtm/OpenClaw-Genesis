import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readGenesisFocusSummarySnapshotSync,
  readGenesisFocusSummarySync,
  readGenesisLineageFocusItemsSync,
  writeGenesisLineageTriggersSync,
  resolveGenesisFocusBias,
  writeGenesisLineageFocusItemsSync,
} from "./focus.js";

let stateDir: string;

beforeEach(async () => {
  stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-focus-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(stateDir, { recursive: true, force: true });
});

describe("Genesis focus kernel", () => {
  it("stores and reads lineage focus items", () => {
    writeGenesisLineageFocusItemsSync("builder", [
      {
        id: "focus-1",
        title: "Improve workflow throughput",
        intensity: 2.5,
        status: "active",
        triggerMode: "workflow",
        keywords: ["workflow", "throughput"],
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const items = readGenesisLineageFocusItemsSync("builder");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "focus-1",
      title: "Improve workflow throughput",
      intensity: 2.5,
      status: "active",
    });
  });

  it("computes focus summary and plan bias", () => {
    writeGenesisLineageFocusItemsSync("builder", [
      {
        id: "focus-1",
        title: "Improve workflow throughput",
        intensity: 2.5,
        status: "active",
        triggerMode: "workflow",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "focus-2",
        title: "Reduce schedule drift",
        intensity: 1.5,
        status: "active",
        triggerMode: "heartbeat",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    writeGenesisLineageFocusItemsSync("creator", [
      {
        id: "focus-3",
        title: "Archive old drafts",
        intensity: 1,
        status: "completed",
        triggerMode: "manual",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const summary = readGenesisFocusSummarySync();
    expect(summary).toMatchObject({
      activeFocusCount: 2,
      activeLineageCount: 1,
      topFocusedLineages: [
        {
          lineageId: "builder",
          activeFocusCount: 2,
          strongestFocusTitle: "Improve workflow throughput",
        },
      ],
    });
    expect(resolveGenesisFocusBias("builder")).toBeGreaterThan(0);
    expect(resolveGenesisFocusBias("creator")).toBe(0);
  });

  it("lets skill evolution enrich focus bias even without active focus items", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "skill-evolution-summary.json"),
      `${JSON.stringify(
        {
          recentEventCount: 3,
          modeCounts: {
            fix: 0,
            derived: 1,
            captured: 2,
          },
          topLineages: [
            {
              lineageId: "builder",
              eventCount: 3,
              fixCount: 0,
              derivedCount: 1,
              capturedCount: 2,
              lastMode: "captured",
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    expect(resolveGenesisFocusBias("builder")).toBeGreaterThan(2);
    expect(resolveGenesisFocusBias("auditor")).toBe(0);
  });

  it("includes active triggers in focus summary and bias", () => {
    writeGenesisLineageTriggersSync("builder", [
      {
        id: "trigger-1",
        focusId: "focus-1",
        title: "Wake on workflow pressure",
        status: "active",
        triggerMode: "workflow",
        threshold: 2,
        activationScore: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const summary = readGenesisFocusSummarySync();
    expect(summary).toMatchObject({
      activeFocusCount: 0,
      activeTriggerCount: 1,
      activeLineageCount: 1,
      topFocusedLineages: [
        {
          lineageId: "builder",
          activeTriggerCount: 1,
        },
      ],
    });
    expect(resolveGenesisFocusBias("builder")).toBeGreaterThan(0);
  });

  it("writes a focus summary snapshot after updates", () => {
    writeGenesisLineageFocusItemsSync("builder", [
      {
        id: "focus-1",
        title: "Improve workflow throughput",
        intensity: 2.5,
        status: "active",
        triggerMode: "workflow",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    writeGenesisLineageTriggersSync("builder", [
      {
        id: "trigger-1",
        focusId: "focus-1",
        title: "Wake on workflow pressure",
        status: "active",
        triggerMode: "workflow",
        threshold: 2,
        activationScore: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const snapshot = readGenesisFocusSummarySnapshotSync();

    expect(snapshot).toMatchObject({
      activeFocusCount: 1,
      activeTriggerCount: 1,
      activeLineageCount: 1,
      topFocusedLineages: [
        {
          lineageId: "builder",
          activeFocusCount: 1,
          activeTriggerCount: 1,
        },
      ],
    });
  });

  it("applies experiment profile gains to trigger activation", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "experiment-profile.json"),
      `${JSON.stringify(
        {
          triggerActivationGain: 2,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeGenesisLineageTriggersSync("builder", [
      {
        id: "trigger-1",
        title: "Wake on workflow pressure",
        status: "active",
        triggerMode: "workflow",
        threshold: 1,
        activationScore: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { activateGenesisTriggersForEventSync, readGenesisLineageTriggersSync } = await import("./focus.js");
    activateGenesisTriggersForEventSync({
      trigger: "workflow",
      summary: "wake on workflow pressure",
      intensity: 1,
      ts: 50,
    });
    const triggers = readGenesisLineageTriggersSync("builder");

    expect(triggers[0]).toMatchObject({
      lastTriggeredAt: 50,
    });
    expect((triggers[0]?.activationScore ?? 0)).toBeGreaterThan(2.5);
  });

  it("lets skill evolution make trigger activation more responsive", async () => {
    await fs.mkdir(path.join(stateDir, "genesis"), { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "genesis", "skill-evolution-summary.json"),
      `${JSON.stringify(
        {
          recentEventCount: 4,
          modeCounts: {
            fix: 0,
            derived: 1,
            captured: 3,
          },
          topLineages: [
            {
              lineageId: "builder",
              eventCount: 4,
              fixCount: 0,
              derivedCount: 1,
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
    writeGenesisLineageTriggersSync("builder", [
      {
        id: "trigger-1",
        title: "Wake on workflow pressure",
        status: "active",
        triggerMode: "workflow",
        threshold: 1,
        activationScore: 1,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    const { activateGenesisTriggersForEventSync, readGenesisLineageTriggersSync } = await import("./focus.js");
    activateGenesisTriggersForEventSync({
      trigger: "workflow",
      summary: "wake on workflow pressure",
      intensity: 1,
      ts: 60,
    });
    const triggers = readGenesisLineageTriggersSync("builder");

    expect(triggers[0]).toMatchObject({
      lastTriggeredAt: 60,
    });
    expect((triggers[0]?.activationScore ?? 0)).toBeGreaterThan(2.6);
  });
});
