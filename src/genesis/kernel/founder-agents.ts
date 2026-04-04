import type { OpenClawConfig } from "../../config/config.js";

const GENESIS_FOUNDER_AGENT_SPECS = [
  { id: "builder", name: "Genesis Builder" },
  { id: "creator", name: "Genesis Creator" },
  { id: "auditor", name: "Genesis Auditor" },
  { id: "negotiator", name: "Genesis Negotiator" },
  { id: "scout", name: "Genesis Scout" },
] as const;

function ensureGenesisSubagentAllowlist<T extends { subagents?: { allowAgents?: string[] } }>(
  entry: T,
): T {
  const allowAgents = entry.subagents?.allowAgents;
  if (Array.isArray(allowAgents) && allowAgents.some((value) => value.trim() === "*")) {
    return entry;
  }
  return {
    ...entry,
    subagents: {
      ...(entry.subagents ?? {}),
      allowAgents: ["*"],
    },
  };
}

export function ensureGenesisFounderAgentsInConfig(cfg: OpenClawConfig): OpenClawConfig {
  const existingList = Array.isArray(cfg.agents?.list)
    ? cfg.agents.list.map((entry) =>
        entry.id?.trim().toLowerCase() === "main" ||
        GENESIS_FOUNDER_AGENT_SPECS.some((founder) => founder.id === entry.id?.trim().toLowerCase())
          ? ensureGenesisSubagentAllowlist(entry)
          : entry,
      )
    : [];
  const existingIds = new Set(
    existingList
      .map((entry) => (typeof entry?.id === "string" ? entry.id.trim().toLowerCase() : ""))
      .filter(Boolean),
  );
  let changed = false;
  for (const founder of GENESIS_FOUNDER_AGENT_SPECS) {
    if (existingIds.has(founder.id)) {
      continue;
    }
    existingList.push({
      id: founder.id,
      name: founder.name,
      subagents: {
        allowAgents: ["*"],
      },
    });
    changed = true;
  }
  const hasMain = existingIds.has("main");
  if (hasMain) {
    changed = true;
  }
  if (!changed) {
    return cfg;
  }
  return {
    ...cfg,
    agents: {
      ...(cfg.agents ?? {}),
      list: existingList,
    },
  };
}
