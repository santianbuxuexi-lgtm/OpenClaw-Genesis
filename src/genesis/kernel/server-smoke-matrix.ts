import type { GenesisServerSmokeAssessment } from "./server-smoke.js";

type GenesisServerSmokeCompactResult = {
  experimentOverride?: {
    applied?: boolean;
    preset?: string | null;
  } | null;
  assessment?: GenesisServerSmokeAssessment | null;
  experimentSignals?: {
    amplificationScore?: number | null;
    runawayRiskScore?: number | null;
    phaseState?: GenesisServerSmokeAssessment["phaseState"] | null;
  } | null;
};

export type GenesisServerSmokeMatrixScenario = {
  name: string;
  result: GenesisServerSmokeCompactResult;
};

export type GenesisServerSmokeMatrixAssessment = {
  scenarios: Array<{
    name: string;
    preset: string | null;
    verdict: GenesisServerSmokeAssessment["verdict"] | null;
    phaseState: GenesisServerSmokeAssessment["phaseState"] | null;
    trendState: GenesisServerSmokeAssessment["trend"]["state"] | null;
    amplificationScore: number | null;
    runawayRiskScore: number | null;
    totalRunDelta: number | null;
  }>;
  ordering: {
    phaseMonotonic: boolean;
    trendMonotonic: boolean;
    amplificationMonotonic: boolean;
    runawayRiskMonotonic: boolean;
  };
  transition: {
    baselineToPressure: "missing" | "flat" | "elevated";
    pressureToRunaway: "missing" | "flat" | "elevated";
  };
  verdict: "ok" | "needs-attention";
};

const PHASE_RANK: Record<NonNullable<GenesisServerSmokeAssessment["phaseState"]>, number> = {
  stable: 0,
  amplifying: 1,
  "runaway-risk": 2,
};

const TREND_RANK: Record<GenesisServerSmokeAssessment["trend"]["state"], number> = {
  stalled: 0,
  steady: 1,
  advancing: 2,
  "threshold-building": 3,
  "runaway-pressure": 4,
};

export function assessGenesisServerSmokeMatrix(
  scenarios: GenesisServerSmokeMatrixScenario[],
): GenesisServerSmokeMatrixAssessment {
  const normalized = scenarios.map((scenario) => {
    const assessment = scenario.result.assessment ?? null;
    const signals = scenario.result.experimentSignals ?? null;
    return {
      name: scenario.name,
      preset: scenario.result.experimentOverride?.preset?.trim() || null,
      verdict: assessment?.verdict ?? null,
      phaseState: assessment?.phaseState ?? signals?.phaseState ?? null,
      trendState: assessment?.trend.state ?? null,
      amplificationScore: normalizeNumber(signals?.amplificationScore),
      runawayRiskScore: normalizeNumber(signals?.runawayRiskScore),
      totalRunDelta: normalizeNumber(assessment?.runCountDelta.total),
    };
  });

  const ordering = {
    phaseMonotonic: isMonotonic(normalized.map((entry) => phaseRank(entry.phaseState))),
    trendMonotonic: isMonotonic(normalized.map((entry) => trendRank(entry.trendState))),
    amplificationMonotonic: isMonotonic(normalized.map((entry) => entry.amplificationScore)),
    runawayRiskMonotonic: isMonotonic(normalized.map((entry) => entry.runawayRiskScore)),
  };

  const baseline = normalized.find((entry) => entry.name === "baseline") ?? normalized[0] ?? null;
  const pressure =
    normalized.find((entry) => entry.name === "pressure") ??
    normalized.find((entry) => entry.preset === "pressure") ??
    null;
  const runaway =
    normalized.find((entry) => entry.name === "runaway") ??
    normalized.find((entry) => entry.preset === "runaway") ??
    null;

  const transition = {
    baselineToPressure: classifyTransition(baseline?.runawayRiskScore ?? null, pressure?.runawayRiskScore ?? null),
    pressureToRunaway: classifyTransition(pressure?.runawayRiskScore ?? null, runaway?.runawayRiskScore ?? null),
  };

  const verdict =
    normalized.every((entry) => entry.verdict === "ok") &&
    ordering.phaseMonotonic &&
    ordering.trendMonotonic &&
    ordering.amplificationMonotonic &&
    ordering.runawayRiskMonotonic &&
    transition.baselineToPressure !== "flat" &&
    transition.pressureToRunaway !== "flat"
      ? "ok"
      : "needs-attention";

  return {
    scenarios: normalized,
    ordering,
    transition,
    verdict,
  };
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function phaseRank(value: GenesisServerSmokeAssessment["phaseState"] | null): number | null {
  return value ? PHASE_RANK[value] : null;
}

function trendRank(value: GenesisServerSmokeAssessment["trend"]["state"] | null): number | null {
  return value ? TREND_RANK[value] : null;
}

function isMonotonic(values: Array<number | null>): boolean {
  const normalized = values.filter((value): value is number => typeof value === "number");
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] < normalized[index - 1]) {
      return false;
    }
  }
  return true;
}

function classifyTransition(
  before: number | null,
  after: number | null,
): "missing" | "flat" | "elevated" {
  if (before === null || after === null) {
    return "missing";
  }
  return after > before + 0.05 ? "elevated" : "flat";
}
