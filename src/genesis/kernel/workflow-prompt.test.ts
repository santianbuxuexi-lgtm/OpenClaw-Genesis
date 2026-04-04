import { describe, expect, it } from "vitest";
import { resolveGenesisAssignmentSystemPrompt } from "./workflow.js";

describe("resolveGenesisAssignmentSystemPrompt", () => {
  it("keeps Genesis coordination internal and result-first for normal replies", () => {
    const prompt = resolveGenesisAssignmentSystemPrompt({
      assignment: {
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        assignment: {
          agentId: "builder",
          sessionKey: "agent:builder:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 2,
        },
      },
    });

    expect(prompt).toContain("Internal coordination context:");
    expect(prompt).toContain("Answer the user's actual request directly and concretely.");
    expect(prompt).toContain("Keep this coordination internal.");
    expect(prompt).toContain(
      "If the user asks who is working, how many agents are involved, or what the team looks like, answer in Genesis society terms",
    );
    expect(prompt).toContain("Do not invent dashboards");
    expect(prompt).toContain("Do not claim that data is live, real-time, current, fetched, searched, or verified");
    expect(prompt).toContain("Only describe work as completed when there is explicit completed evidence.");
    expect(prompt).not.toContain("Genesis society assignment:");
    expect(prompt).not.toContain("Workflow storm:");
  });

  it("includes founder result digest for lead assignments", () => {
    const prompt = resolveGenesisAssignmentSystemPrompt({
      assignment: {
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        assignment: {
          agentId: "main",
          sessionKey: "agent:main:main",
          mode: "primary",
          action: "lead",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 3,
        },
      },
      founderResultDigest:
        "Recent founder result digest (internal):\n- builder [assist/support]: Found the benchmark delta.",
    });

    expect(prompt).toContain("Recent founder result digest (internal):");
    expect(prompt).toContain("builder [assist/support]");
    expect(prompt).toContain(
      "Treat founder digests and internal coordination context as provisional working context",
    );
  });

  it("adds founder-specific specialty guidance for support roles", () => {
    const creatorPrompt = resolveGenesisAssignmentSystemPrompt({
      assignment: {
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        assignment: {
          agentId: "creator",
          sessionKey: "agent:creator:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 2,
        },
      },
    });
    const auditorPrompt = resolveGenesisAssignmentSystemPrompt({
      assignment: {
        primaryAgentId: "main",
        primarySessionKey: "agent:main:main",
        assignment: {
          agentId: "auditor",
          sessionKey: "agent:auditor:main",
          mode: "support",
          action: "assist",
          ecologyState: "active",
          queued: true,
          lane: "workflow",
          dispatchMode: "immediate",
          delayMs: 0,
          priorityBias: 2,
        },
      },
    });

    expect(creatorPrompt).toContain("Founder specialty: creator.");
    expect(creatorPrompt).toContain("Prioritize content, plans, drafts, scripts");
    expect(creatorPrompt).toContain("Prefer existing publishing or content skills first");
    expect(auditorPrompt).toContain("Founder specialty: auditor.");
    expect(auditorPrompt).toContain("Prioritize findings, risks, gaps, regressions");
    expect(auditorPrompt).toContain("Reuse audit or verification skills first");
  });
});
