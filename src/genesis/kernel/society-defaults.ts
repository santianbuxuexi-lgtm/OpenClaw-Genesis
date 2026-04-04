import { readGenesisExperimentProfileSync } from "./experiment-profile.js";
import { resolveGenesisSkillEvolutionBias } from "./skill-evolution.js";
import { readNextGenesisSocietyPlanSync } from "./society-query.js";
import { readGenesisWorldStateSync } from "./state.js";

export type GenesisSocietyExecutionDefaults = {
  minIntervalMs: number;
  maxTicks: number;
  maxActions: number;
  maxRounds: number;
  maxFailureRounds: number;
  maxStableRounds: number;
};

export function resolveGenesisSocietyExecutionDefaultsFromInputs(params: {
  profile: ReturnType<typeof readGenesisExperimentProfileSync>;
  world: ReturnType<typeof readGenesisWorldStateSync>;
  skillEvolutionBias: number;
}): GenesisSocietyExecutionDefaults {
  const replicationBoost = Math.max(0, params.world?.replicationBoost ?? 0);
  const stormMomentum = Math.max(0, params.world?.stormMomentum ?? 0);
  const skillEvolutionBias = Math.max(0, params.skillEvolutionBias);
  const profile = params.profile;
  return {
    minIntervalMs: profile.societyDefaultMinIntervalMs,
    maxTicks:
      profile.societyDefaultMaxTicks +
      (stormMomentum >= profile.societyStormTickBonusThreshold
        ? profile.societyStormTickBonus
        : 0),
    maxActions:
      profile.societyDefaultMaxActions +
      (replicationBoost >= profile.societyReplicationActionBonusThreshold
        ? profile.societyReplicationActionBonus
        : 0) +
      Math.max(0, Math.floor(skillEvolutionBias * profile.societySkillEvolutionActionWeight)),
    maxRounds:
      profile.societyDefaultMaxRounds +
      (stormMomentum >= profile.societyStormRoundBonusThreshold
        ? profile.societyStormRoundBonus
        : 0) +
      Math.max(0, Math.floor(skillEvolutionBias * profile.societySkillEvolutionRoundWeight)),
    maxFailureRounds:
      profile.societyDefaultMaxFailureRounds +
      (replicationBoost >= profile.societyReplicationFailureBonusThreshold
        ? profile.societyReplicationFailureBonus
        : 0) +
      Math.max(0, Math.floor(skillEvolutionBias * profile.societySkillEvolutionFailureWeight)),
    maxStableRounds:
      profile.societyDefaultMaxStableRounds +
      (stormMomentum >= profile.societyStormStableRoundBonusThreshold
        ? profile.societyStormStableRoundBonus
        : 0) +
      Math.max(0, Math.floor(skillEvolutionBias * profile.societySkillEvolutionStableRoundWeight)),
  };
}

export function resolveGenesisSocietyExecutionDefaultsSync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSocietyExecutionDefaults {
  const profile = readGenesisExperimentProfileSync(env);
  const world = readGenesisWorldStateSync(env);
  const nextPlan = readNextGenesisSocietyPlanSync(env);
  const skillEvolutionBias = Math.max(
    0,
    nextPlan.plan ? resolveGenesisSkillEvolutionBias(nextPlan.plan.primaryAgentId, env) : 0,
  );
  return resolveGenesisSocietyExecutionDefaultsFromInputs({
    profile,
    world,
    skillEvolutionBias,
  });
}
