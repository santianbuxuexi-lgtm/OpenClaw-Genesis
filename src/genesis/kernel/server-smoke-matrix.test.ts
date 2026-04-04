import { describe, expect, it } from "vitest";
import { assessGenesisServerSmokeMatrix } from "./server-smoke-matrix.js";

describe("Genesis server smoke matrix", () => {
  it("marks baseline, pressure, and runaway runs as an elevating matrix", () => {
    const matrix = assessGenesisServerSmokeMatrix([
      {
        name: "baseline",
        result: {
          assessment: {
            seededPlan: true,
            tickDecision: "ran",
            tickRan: true,
            pumpTickCount: 2,
            pumpRan: true,
            runCountDelta: { tick: 1, pump: 2, followupPump: 1, total: 4 },
            activeDispatchDelta: 1,
            amplificationDelta: 0.6,
            runawayRiskDelta: 0.5,
            phaseState: "amplifying",
            assertions: [],
            trend: {
              runCountSeries: [1, 2, 4, 5],
              runawayRiskSeries: [2, 2.2, 2.35, 2.5],
              phaseSeries: ["amplifying"],
              riskDirection: "rising",
              state: "advancing",
            },
            progressed: true,
            verdict: "ok",
          },
          experimentSignals: {
            amplificationScore: 3,
            runawayRiskScore: 2.5,
            phaseState: "amplifying",
          },
        },
      },
      {
        name: "pressure",
        result: {
          experimentOverride: { applied: true, preset: "pressure" },
          assessment: {
            seededPlan: true,
            tickDecision: "ran",
            tickRan: true,
            pumpTickCount: 3,
            pumpRan: true,
            runCountDelta: { tick: 1, pump: 3, followupPump: 1, total: 5 },
            activeDispatchDelta: 2,
            amplificationDelta: 1.1,
            runawayRiskDelta: 1.4,
            phaseState: "runaway-risk",
            assertions: [],
            trend: {
              runCountSeries: [1, 2, 5, 6],
              runawayRiskSeries: [2.5, 3.5, 4.1, 4.4],
              phaseSeries: ["amplifying", "runaway-risk"],
              riskDirection: "rising",
              state: "threshold-building",
            },
            progressed: true,
            verdict: "ok",
          },
          experimentSignals: {
            amplificationScore: 6,
            runawayRiskScore: 4.4,
            phaseState: "runaway-risk",
          },
        },
      },
      {
        name: "runaway",
        result: {
          experimentOverride: { applied: true, preset: "runaway" },
          assessment: {
            seededPlan: true,
            tickDecision: "ran",
            tickRan: true,
            pumpTickCount: 4,
            pumpRan: true,
            runCountDelta: { tick: 2, pump: 4, followupPump: 2, total: 8 },
            activeDispatchDelta: 3,
            amplificationDelta: 2.2,
            runawayRiskDelta: 3.5,
            phaseState: "runaway-risk",
            assertions: [],
            trend: {
              runCountSeries: [2, 4, 8, 10],
              runawayRiskSeries: [4.4, 5.8, 6.9, 7.9],
              phaseSeries: ["runaway-risk"],
              riskDirection: "rising",
              state: "runaway-pressure",
            },
            progressed: true,
            verdict: "ok",
          },
          experimentSignals: {
            amplificationScore: 10,
            runawayRiskScore: 7.9,
            phaseState: "runaway-risk",
          },
        },
      },
    ]);

    expect(matrix.ordering).toEqual({
      phaseMonotonic: true,
      trendMonotonic: true,
      amplificationMonotonic: true,
      runawayRiskMonotonic: true,
    });
    expect(matrix.transition).toEqual({
      baselineToPressure: "elevated",
      pressureToRunaway: "elevated",
    });
    expect(matrix.verdict).toBe("ok");
  });

  it("flags flat or regressing matrices", () => {
    const matrix = assessGenesisServerSmokeMatrix([
      {
        name: "baseline",
        result: {
          assessment: {
            seededPlan: true,
            tickDecision: "ran",
            tickRan: true,
            pumpTickCount: 1,
            pumpRan: true,
            runCountDelta: { tick: 1, pump: 1, followupPump: 0, total: 2 },
            activeDispatchDelta: 0,
            amplificationDelta: 0,
            runawayRiskDelta: 0,
            phaseState: "amplifying",
            assertions: [],
            trend: {
              runCountSeries: [1, 2],
              runawayRiskSeries: [3, 3],
              phaseSeries: ["amplifying"],
              riskDirection: "flat",
              state: "advancing",
            },
            progressed: true,
            verdict: "ok",
          },
          experimentSignals: {
            amplificationScore: 4,
            runawayRiskScore: 3,
            phaseState: "amplifying",
          },
        },
      },
      {
        name: "pressure",
        result: {
          experimentOverride: { applied: true, preset: "pressure" },
          assessment: {
            seededPlan: true,
            tickDecision: "ran",
            tickRan: true,
            pumpTickCount: 1,
            pumpRan: true,
            runCountDelta: { tick: 1, pump: 1, followupPump: 0, total: 2 },
            activeDispatchDelta: 0,
            amplificationDelta: -0.1,
            runawayRiskDelta: -0.1,
            phaseState: "amplifying",
            assertions: [],
            trend: {
              runCountSeries: [1, 2],
              runawayRiskSeries: [2.9, 2.9],
              phaseSeries: ["amplifying"],
              riskDirection: "flat",
              state: "steady",
            },
            progressed: true,
            verdict: "ok",
          },
          experimentSignals: {
            amplificationScore: 3.8,
            runawayRiskScore: 2.9,
            phaseState: "amplifying",
          },
        },
      },
    ]);

    expect(matrix.ordering.amplificationMonotonic).toBe(false);
    expect(matrix.ordering.runawayRiskMonotonic).toBe(false);
    expect(matrix.transition.baselineToPressure).toBe("flat");
    expect(matrix.verdict).toBe("needs-attention");
  });
});

