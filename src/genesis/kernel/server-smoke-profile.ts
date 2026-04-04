import type { GenesisExperimentProfile } from "./experiment-profile.js";

export type GenesisServerSmokeProfilePreset = "pressure" | "runaway";

const GENESIS_SERVER_SMOKE_PRESET_PATCHES: Record<
  GenesisServerSmokeProfilePreset,
  Partial<GenesisExperimentProfile>
> = {
  pressure: {
    societyStormTickBonusThreshold: 0.1,
    societyStormTickBonus: 2,
    societyStormRoundBonusThreshold: 0.1,
    societyStormRoundBonus: 2,
    societyStormStableRoundBonusThreshold: 0.1,
    societyStormStableRoundBonus: 2,
    societyReplicationActionBonusThreshold: 0.1,
    societyReplicationActionBonus: 2,
    societyReplicationFailureBonusThreshold: 0.1,
    societyReplicationFailureBonus: 2,
  },
  runaway: {
    societyStormTickBonusThreshold: 0,
    societyStormTickBonus: 3,
    societyStormRoundBonusThreshold: 0,
    societyStormRoundBonus: 3,
    societyStormStableRoundBonusThreshold: 0,
    societyStormStableRoundBonus: 3,
    societyReplicationActionBonusThreshold: 0,
    societyReplicationActionBonus: 3,
    societyReplicationFailureBonusThreshold: 0,
    societyReplicationFailureBonus: 3,
    workflowShockGain: 1.5,
    replicationStormGain: 0.8,
    replicationPressureGain: 0.35,
  },
};

export function resolveGenesisServerSmokeProfilePatch(params: {
  preset?: string | null;
  overrideJson?: string | null;
}): {
  preset: GenesisServerSmokeProfilePreset | null;
  patch: Partial<GenesisExperimentProfile> | null;
} {
  const normalizedPreset = normalizePreset(params.preset);
  const presetPatch = normalizedPreset ? GENESIS_SERVER_SMOKE_PRESET_PATCHES[normalizedPreset] : null;
  const overridePatch = parseOverridePatch(params.overrideJson);
  const mergedPatch = {
    ...(presetPatch ?? {}),
    ...(overridePatch ?? {}),
  };
  return {
    preset: normalizedPreset,
    patch: Object.keys(mergedPatch).length > 0 ? mergedPatch : null,
  };
}

function normalizePreset(
  value: string | null | undefined,
): GenesisServerSmokeProfilePreset | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "pressure" || normalized === "runaway") {
    return normalized;
  }
  throw new Error(`unknown Genesis smoke profile preset: ${value}`);
}

function parseOverridePatch(
  value: string | null | undefined,
): Partial<GenesisExperimentProfile> | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Genesis smoke experiment override must be a JSON object");
  }
  return parsed as Partial<GenesisExperimentProfile>;
}
