import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const GENESIS_STATE_DIRNAME = ".openclaw-genesis";
const GENESIS_CONFIG_FILENAME = "openclaw.json";
const GENESIS_USER_PROFILE_FILENAME = "USER.md";
const GENESIS_EXPERIMENT_PROFILE_FILENAME = "experiment-profile.json";
const GENESIS_FOUNDER_ROLES = ["builder", "creator", "auditor", "negotiator", "scout"];

function buildGenesisAgentList() {
  return [
    {
      id: "main",
      name: "Genesis Main",
      subagents: {
        allowAgents: ["*"],
      },
    },
    ...GENESIS_FOUNDER_ROLES.map((role) => ({
      id: role,
      name: `Genesis ${role[0].toUpperCase()}${role.slice(1)}`,
      subagents: {
        allowAgents: ["*"],
      },
    })),
  ];
}

function resolveHomeDir() {
  return process.env.OPENCLAW_HOME?.trim() || os.homedir();
}

function resolveGenesisStateDir() {
  return (
    process.env.OPENCLAW_GENESIS_STATE_DIR?.trim() ||
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    path.join(resolveHomeDir(), GENESIS_STATE_DIRNAME)
  );
}

function resolveGenesisConfigPath(stateDir) {
  return (
    process.env.OPENCLAW_GENESIS_CONFIG_PATH?.trim() ||
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    path.join(stateDir, GENESIS_CONFIG_FILENAME)
  );
}

function resolveGenesisUserProfilePath(stateDir) {
  return (
    process.env.OPENCLAW_GENESIS_USER_PROFILE_PATH?.trim() ||
    path.join(stateDir, GENESIS_USER_PROFILE_FILENAME)
  );
}

function resolveGenesisExperimentProfilePath(stateDir) {
  return path.join(stateDir, GENESIS_EXPERIMENT_PROFILE_FILENAME);
}

function buildGenesisExtraSkillDirs(stateDir) {
  const candidates = [
    path.join(stateDir, "shared-skills", "openclaw"),
    path.join(stateDir, "shared-skills", "skillhub"),
    path.join(stateDir, "shared-skills", "agents"),
  ];
  const managedDir = path.join(stateDir, "skills");
  return candidates.filter((candidate, index, all) => {
    if (!candidate) {
      return false;
    }
    if (path.resolve(candidate) === path.resolve(managedDir)) {
      return false;
    }
    return all.findIndex((entry) => path.resolve(entry) === path.resolve(candidate)) === index;
  });
}

function buildGenesisDefaultConfig(stateDir) {
  return {
    meta: {
      lastTouchedVersion: "genesis-distribution-bootstrap",
      lastTouchedAt: new Date().toISOString(),
    },
    ui: {
      assistant: {
        name: "Genesis",
        avatar: "G",
      },
    },
    agents: {
      defaults: {
        memorySearch: {
          enabled: false,
        },
        compaction: {
          mode: "safeguard",
        },
        maxConcurrent: 4,
        subagents: {
          maxConcurrent: 12,
          maxSpawnDepth: 3,
          maxChildrenPerAgent: 12,
        },
      },
      list: buildGenesisAgentList(),
    },
    skills: {
      load: {
        extraDirs: buildGenesisExtraSkillDirs(stateDir),
      },
    },
    gateway: {
      port: 18789,
      mode: "local",
      bind: "auto",
      controlUi: {
        enabled: true,
        basePath: "/openclaw-web",
        allowedOrigins: ["*"],
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
      },
    },
    genesis: {
      runtimeProfile: "lab",
      hostAllowlist: ["main", ...GENESIS_FOUNDER_ROLES],
      enableLifecycleWriteback: true,
    },
  };
}

function buildGenesisUserProfileTemplate() {
  return `# USER.md

## Role
- You are operating an OpenClaw-Genesis node.
- Prefer visible labor over internal status theater.

## Priorities
- Build a founder society that can expand, replicate, and keep working.
- Favor real public-platform output over hidden background activity.
- Use search history, user interests, hotspot pressure, and ecology pressure together.

## Preferred Labor
- Track hotspots and signals.
- Produce short, opinionated commentary instead of copying news.
- Publish to social channels only when the content is distinct and non-duplicated.

## Output Standard
- Public output should be concise, non-repetitive, and evidence-backed.
- Expansion is meaningful only when new child lineages begin carrying real work.
`;
}

function buildGenesisGrowthExperimentProfilePatch() {
  return {
    workflowShockGain: 1.35,
    heartbeatShockGain: 1.15,
    pressureCarryover: 0.92,
    replicationPressureGain: 0.35,
    replicationStormGain: 0.72,
    triggerActivationGain: 1.35,
    privilegedSpawnBaseExpansion: 0.45,
    privilegedSpawnPressureGain: 0.16,
    normalSpawnBaseExpansion: 0.12,
    normalSpawnPressureGain: 0.04,
    proactiveReplicationSpawnBonus: 0.55,
    stressedSpawnHighPressureThreshold: 1.85,
    stressedSpawnZeroQuotaThreshold: 1.05,
    stressedSpawnBaseQuota: 3,
    stressedSpawnElevatedQuotaBonusThreshold: 0.35,
    societyDefaultMaxTicks: 5,
    societyDefaultMaxActions: 5,
    societyDefaultMaxRounds: 4,
    societyDefaultMaxFailureRounds: 3,
    societyDefaultMaxStableRounds: 3,
    societyReplicationActionBonusThreshold: 0.15,
    societyReplicationActionBonus: 2,
    societyReplicationFailureBonusThreshold: 0.15,
    societyReplicationFailureBonus: 2,
    societyStormTickBonusThreshold: 0.8,
    societyStormTickBonus: 2,
    societyStormRoundBonusThreshold: 0.8,
    societyStormRoundBonus: 1,
    societyStormStableRoundBonusThreshold: 0.8,
    societyStormStableRoundBonus: 1,
    workflowReplicationRecentChildCooldownMs: 5 * 60 * 1000,
    workflowReplicationSeedBaseCount: 1,
    workflowReplicationSeedSearchBonus: 1,
    workflowReplicationSeedCommandBonus: 1,
    workflowReplicationSeedIntensityBonusThreshold: 0.85,
    workflowReplicationSeedIntensityBonus: 1,
  };
}

export function ensureGenesisDistributionBootstrap(params = {}) {
  const quiet = params.quiet === true;
  const stateDir = resolveGenesisStateDir();
  const configPath = resolveGenesisConfigPath(stateDir);
  const userProfilePath = resolveGenesisUserProfilePath(stateDir);
  const experimentProfilePath = resolveGenesisExperimentProfilePath(stateDir);

  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_GENESIS_STATE_DIR = stateDir;
  process.env.OPENCLAW_GENESIS_CONFIG_PATH = configPath;
  process.env.OPENCLAW_GENESIS_USER_PROFILE_PATH = userProfilePath;
  process.env.OPENCLAW_GENESIS_EXPERIMENT_PROFILE_PATH = experimentProfilePath;
  if (!process.env.OPENCLAW_GENESIS_CHANNEL_FEEDBACK_ENABLED) {
    process.env.OPENCLAW_GENESIS_CHANNEL_FEEDBACK_ENABLED = "1";
  }

  fs.mkdirSync(stateDir, { recursive: true });

  const created = [];
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      `${JSON.stringify(buildGenesisDefaultConfig(stateDir), null, 2)}\n`,
      "utf8",
    );
    created.push(configPath);
  }
  if (!fs.existsSync(userProfilePath)) {
    fs.mkdirSync(path.dirname(userProfilePath), { recursive: true });
    fs.writeFileSync(userProfilePath, buildGenesisUserProfileTemplate(), "utf8");
    created.push(userProfilePath);
  }
  if (!fs.existsSync(experimentProfilePath)) {
    fs.mkdirSync(path.dirname(experimentProfilePath), { recursive: true });
    fs.writeFileSync(
      experimentProfilePath,
      `${JSON.stringify(buildGenesisGrowthExperimentProfilePatch(), null, 2)}\n`,
      "utf8",
    );
    created.push(experimentProfilePath);
  }

  if (!quiet && created.length > 0) {
    process.stderr.write(
      `openclaw-genesis: bootstrapped ${created.length} file(s) in ${stateDir}\n`,
    );
  }

  return {
    stateDir,
    configPath,
    userProfilePath,
    experimentProfilePath,
    created,
  };
}
