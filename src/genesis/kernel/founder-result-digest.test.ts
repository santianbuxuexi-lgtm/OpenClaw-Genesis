import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStorePath, resolveSessionTranscriptPath } from "../../config/sessions.js";
import { updateSessionStore } from "../../config/sessions/store.js";
import { withEnvAsync } from "../../test-utils/env.js";
import { withTempDir } from "../../test-utils/temp-dir.js";
import {
  buildGenesisFounderResultDigestPrompt,
  resolveGenesisFounderResultDigest,
} from "./founder-result-digest.js";
import type { GenesisSocietyDispatchPlan } from "./workflow.js";

async function writeTranscript(params: {
  stateDir: string;
  agentId: string;
  sessionId: string;
  lines: unknown[];
}) {
  const sessionFile = resolveSessionTranscriptPath(params.sessionId, params.agentId);
  await fs.mkdir(path.dirname(sessionFile), { recursive: true });
  await fs.writeFile(
    sessionFile,
    `${params.lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
    "utf-8",
  );
  const storePath = resolveStorePath(undefined, { agentId: params.agentId, env: process.env });
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await updateSessionStore(storePath, (store) => {
    store[`agent:${params.agentId}:main`] = {
      sessionId: params.sessionId,
      updatedAt: Date.now(),
    };
  });
}

describe("resolveGenesisFounderResultDigest", () => {
  it("collects recent support and revive founder outputs for the lead session", async () => {
    await withTempDir("genesis-founder-digest-", async (stateDir) => {
      await withEnvAsync({ OPENCLAW_STATE_DIR: stateDir }, async () => {
        await writeTranscript({
          stateDir,
          agentId: "builder",
          sessionId: "11111111-1111-4111-8111-111111111111",
          lines: [
            { message: { role: "assistant", content: [{ type: "text", text: "Builder found the TPU distillation notes and summarized the latency tradeoffs." }] } },
          ],
        });
        await writeTranscript({
          stateDir,
          agentId: "auditor",
          sessionId: "22222222-2222-4222-8222-222222222222",
          lines: [
            { message: { role: "assistant", content: [{ type: "text", text: "HEARTBEAT_OK" }] } },
            { message: { role: "assistant", content: [{ type: "text", text: "Auditor verified the compression claim and flagged the main accuracy risk." }] } },
          ],
        });

        const society: GenesisSocietyDispatchPlan = {
          primaryAgentId: "main",
          primarySessionKey: "agent:main:main",
          intensity: 0.9,
          climateKind: "search",
          forcedCollaboration: true,
          availableAgentCount: 3,
          targetCoverageRatio: 0.8,
          mobilizedCoverageRatio: 1,
          lane: "workflow",
          dispatchMode: "immediate",
          supportSessionKeys: ["agent:builder:main"],
          reviveSessionKeys: ["agent:auditor:main"],
          deferredAgentIds: [],
          assignments: [
            {
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
            {
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
            {
              agentId: "auditor",
              sessionKey: "agent:auditor:main",
              mode: "revive",
              action: "reactivate",
              ecologyState: "stressed",
              queued: true,
              lane: "workflow",
              dispatchMode: "emergency",
              delayMs: 0,
              priorityBias: 2,
            },
          ],
        };

        const digest = resolveGenesisFounderResultDigest({
          society,
          currentSessionKey: "agent:main:main",
        });
        expect(digest?.entries).toEqual([
          {
            agentId: "builder",
            sessionKey: "agent:builder:main",
            action: "assist",
            mode: "support",
            preview:
              "Builder found the TPU distillation notes and summarized the latency tradeoffs.",
          },
          {
            agentId: "auditor",
            sessionKey: "agent:auditor:main",
            action: "reactivate",
            mode: "revive",
            preview:
              "Auditor verified the compression claim and flagged the main accuracy risk.",
          },
        ]);

        const prompt = buildGenesisFounderResultDigestPrompt(digest);
        expect(prompt).toContain("Recent founder result digest (internal):");
        expect(prompt).toContain("builder [assist/support]");
        expect(prompt).toContain("auditor [reactivate/revive]");
      });
    });
  });
});
