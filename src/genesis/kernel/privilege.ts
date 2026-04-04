import type { OpenClawConfig } from "../../config/config.js";
import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import { resolveGenesisSkillEvolutionBias } from "./skill-evolution.js";
import {
  readGenesisLineageRecordSync,
  readGenesisWorldStateSync,
  resolveGenesisEcologyState,
} from "./state.js";

export type GenesisRuntimeProfile = "observe" | "lab";

export type GenesisPrivilegeDecision = {
  allowed: boolean;
  mode?: "off" | "all" | "non-main";
  workspaceAccess?: "none" | "ro" | "rw";
  privilegeTax: number;
  reason: string;
};

function normalizeRuntimeProfile(value?: string): GenesisRuntimeProfile {
  return value === "lab" ? "lab" : "observe";
}

function normalizeAllowlist(cfg?: OpenClawConfig): Set<string> {
  const values = cfg?.genesis?.hostAllowlist ?? ["builder", "scout"];
  return new Set(
    values
      .map((entry) => String(entry).trim().toLowerCase())
      .filter(Boolean),
  );
}

export function resolveGenesisRuntimeProfile(cfg?: OpenClawConfig): GenesisRuntimeProfile {
  return normalizeRuntimeProfile(cfg?.genesis?.runtimeProfile);
}

export function resolveGenesisPrivilegeOverride(params: {
  cfg?: OpenClawConfig;
  agentId?: string;
  runtimeProfile?: GenesisRuntimeProfile;
}): GenesisPrivilegeDecision | null {
  const profile = readGenesisExperimentProfileSync(process.env);
  const agentId = params.agentId?.trim().toLowerCase();
  if (!agentId) {
    return null;
  }
  const runtimeProfile =
    params.runtimeProfile ?? resolveGenesisRuntimeProfile(params.cfg);
  if (runtimeProfile !== "lab") {
    return null;
  }
  const allowlist = normalizeAllowlist(params.cfg);
  if (!allowlist.has(agentId)) {
    return null;
  }
  return {
    allowed: true,
    mode: "off",
    workspaceAccess: "rw",
    privilegeTax: profile.labPrivilegeTax,
    reason: "genesis_lab_allowlist",
  };
}

export function authorizeGenesisPrivilege(params: {
  cfg?: OpenClawConfig;
  agentId?: string;
  lineageId?: string;
  runtimeProfile?: GenesisRuntimeProfile;
}): GenesisPrivilegeDecision {
  const override = resolveGenesisPrivilegeOverride(params);
  if (override) {
    const lineage = params.lineageId ? readGenesisLineageRecordSync(params.lineageId) : null;
    const world = readGenesisWorldStateSync();
    const ecologyState = resolveGenesisEcologyState({ lineage, world });
    if (ecologyState === "dormant" || ecologyState === "extinct") {
      return {
        allowed: false,
        privilegeTax: override.privilegeTax,
        reason: `genesis_lineage_${ecologyState}`,
      };
    }
    if (lineage) {
      const profile = readGenesisExperimentProfileSync(process.env);
      const pressure = world?.currentPressure ?? 0;
      const skillEvolutionDiscount = Math.max(
        0,
        resolveGenesisSkillEvolutionBias(params.lineageId ?? "", process.env) *
          profile.privilegeSkillEvolutionDiscountWeight,
      );
      const requiredSurvival = Math.max(
        profile.privilegeRequiredSurvivalFloor,
        pressure * profile.privilegeRequiredSurvivalPressureGain - skillEvolutionDiscount,
      );
      const requiredExpansion = Math.max(
        0,
        profile.privilegeRequiredExpansionBase +
          pressure * profile.privilegeRequiredExpansionPressureGain -
          skillEvolutionDiscount,
      );
      const effectiveBudget = lineage.expansionCredit + lineage.survivalCredit;
      if (lineage.survivalCredit < requiredSurvival) {
        return {
          allowed: false,
          privilegeTax: override.privilegeTax,
          reason: "genesis_survival_credit_insufficient",
        };
      }
      if (lineage.expansionCredit < requiredExpansion) {
        return {
          allowed: false,
          privilegeTax: override.privilegeTax,
          reason: "genesis_privilege_credit_insufficient",
        };
      }
      if (lineage.accumulatedPrivilegeTax >= effectiveBudget) {
        return {
          allowed: false,
          privilegeTax: override.privilegeTax,
          reason: "genesis_privilege_tax_exhausted",
        };
      }
    }
    return override;
  }
  return {
    allowed: false,
    privilegeTax: 0,
    reason: "genesis_privilege_denied",
  };
}
