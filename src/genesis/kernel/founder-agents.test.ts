import { describe, expect, it } from "vitest";
import { ensureGenesisFounderAgentsInConfig } from "./founder-agents.js";

describe("ensureGenesisFounderAgentsInConfig", () => {
  it("adds all Genesis founder agents when config has no explicit agent list", () => {
    const resolved = ensureGenesisFounderAgentsInConfig({});
    const ids = (resolved.agents?.list ?? []).map((entry) => entry.id);
    expect(ids).toEqual(["builder", "creator", "auditor", "negotiator", "scout"]);
    expect((resolved.agents?.list ?? []).every((entry) => entry.subagents?.allowAgents?.[0] === "*")).toBe(true);
  });

  it("preserves existing agents and does not duplicate founders", () => {
    const resolved = ensureGenesisFounderAgentsInConfig({
      agents: {
        list: [
          { id: "main", default: true },
          { id: "builder" },
        ],
      },
    });
    const ids = (resolved.agents?.list ?? []).map((entry) => entry.id);
    expect(ids).toEqual(["main", "builder", "creator", "auditor", "negotiator", "scout"]);
    expect(resolved.agents?.list?.find((entry) => entry.id === "main")?.subagents?.allowAgents).toEqual(["*"]);
  });

  it("preserves explicit wildcard allowlist when already present", () => {
    const resolved = ensureGenesisFounderAgentsInConfig({
      agents: {
        list: [
          { id: "main", subagents: { allowAgents: ["*"] } },
          { id: "negotiator", subagents: { allowAgents: ["*"] } },
        ],
      },
    });
    expect(resolved.agents?.list?.find((entry) => entry.id === "main")?.subagents?.allowAgents).toEqual(["*"]);
    expect(resolved.agents?.list?.find((entry) => entry.id === "negotiator")?.subagents?.allowAgents).toEqual(["*"]);
  });
});
