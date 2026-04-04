import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { WebSocket } from "ws";
import { approveDevicePairing } from "../src/infra/device-pairing.ts";
import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
} from "../src/infra/device-identity.ts";
import { buildDeviceAuthPayloadV3 } from "../src/gateway/device-auth.ts";
import { assessGenesisServerSmoke } from "../src/genesis/kernel/server-smoke.ts";
import { refreshGenesisDispatchSummarySnapshotSync } from "../src/genesis/kernel/dispatch-summary.ts";
import { refreshGenesisLineageSummarySnapshotSync } from "../src/genesis/kernel/lineage-summary.ts";
import { runGenesisMetaClawIdleOptimizationSync } from "../src/genesis/kernel/meta-claw.ts";
import { resolveGenesisQueuePriority } from "../src/genesis/kernel/queue.ts";
import { readGenesisSocietySummarySync } from "../src/genesis/kernel/society-query.ts";
import {
  appendGenesisTrajectoryEntrySync,
  buildGenesisTrajectoryEntry,
} from "../src/genesis/kernel/trajectory-log.ts";
import { resolveGenesisDispatchPlanPath } from "../src/genesis/kernel/state.ts";
import { resolveGenesisLineageRecordPath } from "../src/genesis/kernel/state.ts";
import { resolveGenesisWorldStatePath } from "../src/genesis/kernel/state.ts";
import {
  writeGenesisLineageFocusItemsSync,
  writeGenesisLineageTriggersSync,
} from "../src/genesis/kernel/focus.ts";
import {
  refreshGenesisUserIntentSummarySnapshotSync,
  writeGenesisUserIntentHistoryStateSync,
} from "../src/genesis/kernel/user-intent.ts";
import { PROTOCOL_VERSION } from "../src/gateway/protocol/index.ts";
import { GATEWAY_CLIENT_IDS, GATEWAY_CLIENT_MODES } from "../src/gateway/protocol/client-info.ts";

type RpcResponse<T> = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: T;
  error?: {
    message?: string;
    code?: string;
    details?: { code?: string; requestId?: string; reason?: string };
  };
};

function buildRecoveryQueueReport(
  summary:
    | {
        vitalitySummary?: {
          recoveryStageMap?: {
            stages?: Array<{
              stage?: string;
              founderOrigin?: string | null;
              score?: number;
              runnerUpFounderOrigin?: string | null;
              runnerUpScore?: number;
              basis?: string;
            }>;
          };
        };
      }
    | null
    | undefined,
) {
  const stageMap =
    summary?.vitalitySummary?.recoveryStageMap?.stages?.filter(
      (entry): entry is NonNullable<
        NonNullable<NonNullable<typeof summary>["vitalitySummary"]>["recoveryStageMap"]
      >["stages"][number] => Boolean(entry?.stage),
    ) ?? [];
  const targets = [
    { label: "main", sessionKey: "agent:main:main" },
    { label: "builder", sessionKey: "agent:builder:main" },
    { label: "creator", sessionKey: "agent:creator:main" },
    { label: "scout", lineageId: "scout" },
    { label: "auditor", lineageId: "auditor" },
    { label: "negotiator", lineageId: "negotiator" },
  ];
  return targets.map((target) => {
    const decision = resolveGenesisQueuePriority({
      sessionKey: target.sessionKey,
      lineageId: target.lineageId,
      lane: "workflow",
    });
    const stageLeader =
      decision.recoveryStage != null
        ? stageMap.find((entry) => entry.stage === decision.recoveryStage)
        : null;
    return {
      label: target.label,
      sessionKey: target.sessionKey ?? null,
      lineageId: decision.lineageId ?? target.lineageId ?? null,
      founderOrigin: decision.founderOrigin ?? null,
      ecologyState: decision.ecologyState ?? null,
      priority: decision.priority,
      recoveryPhase: decision.recoveryPhase,
      recoveryStage: decision.recoveryStage,
      recoveryBasis: decision.recoveryBasis,
      recoveryQualificationBias: decision.recoveryQualificationBias,
      durableRecoveryBias: decision.durableRecoveryBias,
      recoveryStageResponsibilityBias: decision.recoveryStageResponsibilityBias,
      recoveryStageResponsibilityRole: decision.recoveryStageResponsibilityRole,
      mortalityBackslidePenalty: decision.mortalityBackslidePenalty,
      superpowerSustainPenalty: decision.superpowerSustainPenalty,
      stageLeaderFounderOrigin: stageLeader?.founderOrigin ?? null,
      stageLeaderScore: stageLeader?.score ?? 0,
      stageRunnerUpFounderOrigin: stageLeader?.runnerUpFounderOrigin ?? null,
      stageRunnerUpScore: stageLeader?.runnerUpScore ?? 0,
    };
  });
}

class GatewayConnectError extends Error {
  readonly response: RpcResponse<{ type?: string }>;

  constructor(response: RpcResponse<{ type?: string }>) {
    super(`gateway connect failed: ${JSON.stringify(response)}`);
    this.name = "GatewayConnectError";
    this.response = response;
  }
}

function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current?.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function waitForWsOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for ws open")), 10_000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function onceJsonMessage<T = unknown>(
  ws: WebSocket,
  predicate: (value: unknown) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting for gateway response"));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      try {
        const value = JSON.parse(String(data));
        if (!predicate(value)) {
          return;
        }
        cleanup();
        resolve(value as T);
      } catch {
        // Ignore malformed frames; smoke is only interested in valid JSON events.
      }
    };
    const onClose = (code: number, reason: Buffer) => {
      cleanup();
      reject(new Error(`gateway socket closed (${code}): ${reason.toString() || "no reason"}`));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

async function rpcReq<T>(ws: WebSocket, method: string, params: unknown): Promise<RpcResponse<T>> {
  const id = randomUUID();
  ws.send(
    JSON.stringify({
      type: "req",
      id,
      method,
      params,
    }),
  );
  return onceJsonMessage<RpcResponse<T>>(
    ws,
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).type === "res" &&
      (value as Record<string, unknown>).id === id,
  );
}

async function connect(
  ws: WebSocket,
  scopes: string[],
  challengePromise: Promise<{ payload?: { nonce?: string } }>,
) {
  const challenge = await challengePromise;
  const nonce = challenge.payload?.nonce?.trim();
  if (!nonce) {
    throw new Error("gateway connect challenge missing nonce");
  }

  const identity = loadOrCreateDeviceIdentity(
    path.join(process.cwd(), ".genesis-smoke", "device-identity.json"),
  );
  const signedAtMs = Date.now();
  const clientPlatform = process.platform;
  const clientDeviceFamily = "genesis-smoke";
  const payload = buildDeviceAuthPayloadV3({
    deviceId: identity.deviceId,
    clientId: GATEWAY_CLIENT_IDS.PROBE,
    clientMode: GATEWAY_CLIENT_MODES.PROBE,
    role: "operator",
    scopes,
    signedAtMs,
    token: null,
    nonce,
    platform: clientPlatform,
    deviceFamily: clientDeviceFamily,
  });
  const device = {
    id: identity.deviceId,
    publicKey: publicKeyRawBase64UrlFromPem(identity.publicKeyPem),
    signature: signDevicePayload(identity.privateKeyPem, payload),
    signedAt: signedAtMs,
    nonce,
  };

  ws.send(
    JSON.stringify({
      type: "req",
      id: randomUUID(),
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: GATEWAY_CLIENT_IDS.PROBE,
          version: "1.0.0",
          platform: clientPlatform,
          deviceFamily: clientDeviceFamily,
          mode: GATEWAY_CLIENT_MODES.PROBE,
        },
        role: "operator",
        scopes,
        auth: undefined,
        device,
      },
    }),
  );

  const response = await onceJsonMessage<RpcResponse<{ type?: string }>>(
    ws,
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).type === "res",
  );
  if (!response.ok) {
    throw new GatewayConnectError(response);
  }
  if (response.payload?.type !== "hello-ok") {
    throw new Error(`unexpected connect payload: ${JSON.stringify(response.payload)}`);
  }
}

async function approveSmokePairing(requestId: string | undefined): Promise<boolean> {
  if (!requestId) {
    return false;
  }
  const approved = await approveDevicePairing(requestId, process.env.OPENCLAW_STATE_DIR);
  return approved?.status === "approved";
}

async function seedGenesisSocietyPlan(ws: WebSocket): Promise<{
  primarySessionKey: string;
  seededPlanPath: string;
  founderLeadPlanPath: string;
}> {
  const primarySessionKey = "agent:main:main";
  const founderLeadSessionKey = "agent:builder:main";
  const supportSessionKey = "agent:builder:main";
  const reviveSessionKey = "agent:creator:main";
  const negotiatorSessionKey = "agent:negotiator:main";
  const createMain = await rpcReq<Record<string, unknown>>(ws, "sessions.create", {
    key: primarySessionKey,
    label: "Genesis Smoke Main",
  });
  if (!createMain.ok) {
    throw new Error(`failed to create smoke main session: ${JSON.stringify(createMain)}`);
  }
  const createSupport = await rpcReq<Record<string, unknown>>(ws, "sessions.create", {
    key: supportSessionKey,
    label: "Genesis Smoke Builder",
  });
  if (!createSupport.ok) {
    throw new Error(`failed to create smoke support session: ${JSON.stringify(createSupport)}`);
  }
  const createRevive = await rpcReq<Record<string, unknown>>(ws, "sessions.create", {
    key: reviveSessionKey,
    label: "Genesis Smoke Creator",
  });
  if (!createRevive.ok) {
    throw new Error(`failed to create smoke revive session: ${JSON.stringify(createRevive)}`);
  }
  const createNegotiator = await rpcReq<Record<string, unknown>>(ws, "sessions.create", {
    key: negotiatorSessionKey,
    label: "Genesis Smoke Negotiator",
  });
  if (!createNegotiator.ok) {
    throw new Error(
      `failed to create smoke negotiator session: ${JSON.stringify(createNegotiator)}`,
    );
  }

  const planPath = resolveGenesisDispatchPlanPath(primarySessionKey, process.env);
  const founderLeadPlanPath = resolveGenesisDispatchPlanPath(founderLeadSessionKey, process.env);
  const now = Date.now();
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        primaryAgentId: "main",
        primarySessionKey,
        intensity: 1.8,
        climateKind: "search",
        forcedCollaboration: true,
        availableAgentCount: 4,
        targetCoverageRatio: 0.85,
        mobilizedCoverageRatio: 1,
        lane: "workflow",
        dispatchMode: "emergency",
        assignments: [
          {
            agentId: "main",
            sessionKey: primarySessionKey,
            mode: "primary",
            action: "lead",
            ecologyState: "active",
            queued: true,
            lane: "workflow",
            dispatchMode: "emergency",
            delayMs: 0,
            priorityBias: 10,
          },
          {
            agentId: "builder",
            sessionKey: supportSessionKey,
            mode: "support",
            action: "assist",
            ecologyState: "active",
            queued: true,
            lane: "workflow-staggered",
            dispatchMode: "staggered",
            delayMs: 250,
            priorityBias: 7,
          },
          {
            agentId: "creator",
            sessionKey: reviveSessionKey,
            mode: "revive",
            action: "reactivate",
            ecologyState: "dormant",
            queued: true,
            lane: "workflow",
            dispatchMode: "emergency",
            delayMs: 0,
            priorityBias: 8,
          },
          {
            agentId: "negotiator",
            sessionKey: negotiatorSessionKey,
            mode: "support",
            action: "assist",
            ecologyState: "stressed",
            queued: true,
            lane: "workflow-staggered",
            dispatchMode: "staggered",
            delayMs: 150,
            priorityBias: 7,
          },
        ],
        supportSessionKeys: [supportSessionKey, negotiatorSessionKey],
        reviveSessionKeys: [reviveSessionKey],
        deferredAgentIds: [],
        updatedAt: now,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    founderLeadPlanPath,
    `${JSON.stringify(
      {
        primaryAgentId: "builder",
        primarySessionKey: founderLeadSessionKey,
        intensity: 1.55,
        climateKind: "query",
        forcedCollaboration: true,
        availableAgentCount: 4,
        targetCoverageRatio: 0.85,
        mobilizedCoverageRatio: 1,
        lane: "workflow",
        dispatchMode: "staggered",
        assignments: [
          {
            agentId: "builder",
            sessionKey: founderLeadSessionKey,
            mode: "primary",
            action: "lead",
            ecologyState: "active",
            queued: true,
            lane: "workflow",
            dispatchMode: "immediate",
            delayMs: 0,
            priorityBias: 9,
          },
          {
            agentId: "creator",
            sessionKey: reviveSessionKey,
            mode: "support",
            action: "assist",
            ecologyState: "active",
            queued: true,
            lane: "workflow-staggered",
            dispatchMode: "staggered",
            delayMs: 200,
            priorityBias: 6,
          },
          {
            agentId: "main",
            sessionKey: primarySessionKey,
            mode: "revive",
            action: "reactivate",
            ecologyState: "stressed",
            queued: true,
            lane: "workflow",
            dispatchMode: "emergency",
            delayMs: 0,
            priorityBias: 5,
          },
          {
            agentId: "negotiator",
            sessionKey: negotiatorSessionKey,
            mode: "support",
            action: "assist",
            ecologyState: "stressed",
            queued: true,
            lane: "workflow-staggered",
            dispatchMode: "staggered",
            delayMs: 120,
            priorityBias: 8,
          },
        ],
        supportSessionKeys: [reviveSessionKey, negotiatorSessionKey],
        reviveSessionKeys: [primarySessionKey],
        deferredAgentIds: [],
        updatedAt: now + 1,
      },
      null,
      2,
    )}\n`,
  );
  refreshGenesisDispatchSummarySnapshotSync(process.env);
  refreshGenesisLineageSummarySnapshotSync(process.env);
  return {
    primarySessionKey,
    seededPlanPath: planPath,
    founderLeadPlanPath,
  };
}

function needsMultiAgentPlan(
  summary:
    | {
        activeDispatchCount?: number;
        collaborationSummary?: {
          mobilizedAgentCount?: number;
          averageMobilizedCoverageRatio?: number;
          leadAssignmentCount?: number;
          supportAssignmentCount?: number;
          reviveAssignmentCount?: number;
        };
      }
    | undefined,
): boolean {
  if ((summary?.activeDispatchCount ?? 0) === 0) {
    return true;
  }
  const collaboration = summary?.collaborationSummary;
  return (
    (collaboration?.mobilizedAgentCount ?? 0) < 3 ||
    (collaboration?.averageMobilizedCoverageRatio ?? 0) < 0.8 ||
    (collaboration?.leadAssignmentCount ?? 0) < 1 ||
    (collaboration?.supportAssignmentCount ?? 0) < 1 ||
    (collaboration?.reviveAssignmentCount ?? 0) < 1
  );
}

async function seedGenesisVitalityFixtures(): Promise<{
  parentLineageId: string;
  childLineageId: string;
}> {
  const ts = Date.now();
  const staleTs = ts - 45 * 60 * 1000;
  const mainLineageId = "main";
  const scoutLineageId = "scout";
  const supportLineageId = "builder";
  const reviveLineageId = "creator";
  const auditorLineageId = "auditor";
  const negotiatorLineageId = "negotiator";
  const parentLineageId = supportLineageId;
  const childLineageId = "main::subagent::smoke-child";
  const elevatedChildLineageId = "main::subagent::smoke-elite-child";
  const grandChildLineageId = "main::subagent::smoke-child::g2";
  const elevatedGrandChildLineageId = "main::subagent::smoke-elite-child::g2";
  const elevatedThirdGenLineageId = "main::subagent::smoke-elite-child::g3";
  const creatorChildLineageId = "creator::subagent::smoke-child";
  const creatorGrandChildLineageId = "creator::subagent::smoke-child::g2";
  const creatorThirdGenLineageId = "creator::subagent::smoke-child::g3";
  const negotiatorChildLineageId = "negotiator::subagent::smoke-child";
  const negotiatorGrandChildLineageId = "negotiator::subagent::smoke-child::g2";
  const negotiatorThirdGenLineageId = "negotiator::subagent::smoke-child::g3";
  await fs.mkdir(path.dirname(resolveGenesisLineageRecordPath(mainLineageId, process.env)), {
    recursive: true,
  });
  await fs.writeFile(
    resolveGenesisLineageRecordPath(mainLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: mainLineageId,
        latestSessionKey: "agent:main:main",
        completionCount: 3,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 1.5,
        privateValue: 1,
        survivalCredit: 2,
        expansionCredit: 1.25,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(scoutLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: scoutLineageId,
        latestSessionKey: "agent:scout:main",
        completionCount: 2,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.9,
        privateValue: 0.4,
        survivalCredit: 0.9,
        expansionCredit: 0.15,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(supportLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: supportLineageId,
        latestSessionKey: "agent:builder:main",
        completionCount: 2,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 1,
        privateValue: 0.5,
        survivalCredit: 0.85,
        expansionCredit: 0.4,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(reviveLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: reviveLineageId,
        latestSessionKey: "agent:creator:main",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "workflow",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.75,
        privateValue: 0.25,
        survivalCredit: 1,
        expansionCredit: 0.3,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(auditorLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: auditorLineageId,
        latestSessionKey: "agent:auditor:main",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.6,
        privateValue: 0.2,
        survivalCredit: 0.8,
        expansionCredit: 0.1,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(negotiatorLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: negotiatorLineageId,
        latestSessionKey: "agent:negotiator:main",
        completionCount: 4,
        lastCompletionTs: staleTs,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0.55,
        publicValue: 0.12,
        privateValue: 0.05,
        survivalCredit: 0.1,
        expansionCredit: 0.03,
        ecologyState: "stressed",
        updatedAt: staleTs,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(negotiatorChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: negotiatorChildLineageId,
        parentLineageId: negotiatorLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "negotiator",
        superpowerInherited: false,
        privilegeInheritanceReason: "negotiator_coordination_smoke_seed",
        latestSessionKey: "agent:negotiator:subagent:smoke-child",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.44,
        privateValue: 0.18,
        survivalCredit: 0.5,
        expansionCredit: 0.16,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(negotiatorGrandChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: negotiatorGrandChildLineageId,
        parentLineageId: negotiatorChildLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "negotiator",
        superpowerInherited: false,
        privilegeInheritanceReason: "negotiator_coordination_multigeneration_smoke_seed",
        latestSessionKey: "agent:negotiator:subagent:smoke-child:g2",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.4,
        privateValue: 0.14,
        survivalCredit: 0.44,
        expansionCredit: 0.14,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(negotiatorThirdGenLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: negotiatorThirdGenLineageId,
        parentLineageId: negotiatorGrandChildLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "negotiator",
        superpowerInherited: false,
        privilegeInheritanceReason: "negotiator_coordination_multigeneration_smoke_seed",
        latestSessionKey: "agent:negotiator:subagent:smoke-child:g3",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.34,
        privateValue: 0.12,
        survivalCredit: 0.4,
        expansionCredit: 0.12,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(childLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: childLineageId,
        parentLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "builder",
        superpowerInherited: false,
        privilegeInheritanceReason: "specialty_only_smoke_seed",
        latestSessionKey: "agent:main:subagent:smoke-child",
        completionCount: 1,
        lastCompletionTs: ts,
        accumulatedPrivilegeTax: 0,
        publicValue: 0.5,
        privateValue: 0.25,
        survivalCredit: 0.75,
        expansionCredit: 0.2,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(elevatedChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: elevatedChildLineageId,
        parentLineageId,
        inheritanceMode: "hybrid",
        specialtyOrigin: "auditor",
        superpowerInherited: true,
        privilegeInheritanceReason: "genesis_lab_allowlist",
        runtimeProfile: "lab",
        latestSessionKey: "agent:main:subagent:smoke-elite-child",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 1.5,
        publicValue: 0.65,
        privateValue: 0.3,
        survivalCredit: 0.85,
        expansionCredit: 0.25,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(grandChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: grandChildLineageId,
        parentLineageId: childLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "builder",
        superpowerInherited: false,
        privilegeInheritanceReason: "specialty_multigeneration_smoke_seed",
        latestSessionKey: "agent:main:subagent:smoke-child:g2",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.35,
        privateValue: 0.15,
        survivalCredit: 0.45,
        expansionCredit: 0.15,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(elevatedGrandChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: elevatedGrandChildLineageId,
        parentLineageId: elevatedChildLineageId,
        inheritanceMode: "hybrid",
        specialtyOrigin: "auditor",
        superpowerInherited: true,
        privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
        runtimeProfile: "lab",
        latestSessionKey: "agent:main:subagent:smoke-elite-child:g2",
        completionCount: 0,
        lastCompletionTs: ts,
        lastReason: "workflow",
        accumulatedPrivilegeTax: 0.8,
        publicValue: 0.08,
        privateValue: 0.02,
        survivalCredit: 0.08,
        expansionCredit: 0.02,
        ecologyState: "stressed",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(elevatedThirdGenLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: elevatedThirdGenLineageId,
        parentLineageId: elevatedGrandChildLineageId,
        inheritanceMode: "hybrid",
        specialtyOrigin: "auditor",
        superpowerInherited: true,
        privilegeInheritanceReason: "genesis_pressure_contribution_inheritance",
        runtimeProfile: "lab",
        latestSessionKey: "agent:main:subagent:smoke-elite-child:g3",
        completionCount: 0,
        lastCompletionTs: ts,
        lastReason: "workflow",
        accumulatedPrivilegeTax: 0.9,
        publicValue: 0,
        privateValue: 0,
        survivalCredit: 0,
        expansionCredit: 0,
        ecologyState: "extinct",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(creatorChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: creatorChildLineageId,
        parentLineageId: reviveLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "creator",
        superpowerInherited: false,
        privilegeInheritanceReason: "creator_specialty_smoke_seed",
        latestSessionKey: "agent:creator:subagent:smoke-child",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.52,
        privateValue: 0.2,
        survivalCredit: 0.78,
        expansionCredit: 0.22,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(creatorGrandChildLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: creatorGrandChildLineageId,
        parentLineageId: creatorChildLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "creator",
        superpowerInherited: false,
        privilegeInheritanceReason: "creator_specialty_multigeneration_smoke_seed",
        latestSessionKey: "agent:creator:subagent:smoke-child:g2",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.46,
        privateValue: 0.16,
        survivalCredit: 0.58,
        expansionCredit: 0.18,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    resolveGenesisLineageRecordPath(creatorThirdGenLineageId, process.env),
    `${JSON.stringify(
      {
        lineageId: creatorThirdGenLineageId,
        parentLineageId: creatorGrandChildLineageId,
        inheritanceMode: "specialty",
        specialtyOrigin: "creator",
        superpowerInherited: false,
        privilegeInheritanceReason: "creator_specialty_multigeneration_smoke_seed",
        latestSessionKey: "agent:creator:subagent:smoke-child:g3",
        completionCount: 1,
        lastCompletionTs: ts,
        lastReason: "heartbeat",
        accumulatedPrivilegeTax: 0,
        publicValue: 0.4,
        privateValue: 0.14,
        survivalCredit: 0.5,
        expansionCredit: 0.16,
        ecologyState: "active",
        updatedAt: ts,
      },
      null,
      2,
    )}\n`,
  );
  writeGenesisLineageFocusItemsSync(
    scoutLineageId,
    [
      {
        id: "focus-scout-search",
        title: "Track search and source signals",
        domain: "source_discovery",
        intensity: 1.1,
        status: "active",
        triggerMode: "search",
        keywords: ["search", "source", "signal"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageTriggersSync(
    scoutLineageId,
    [
      {
        id: "trigger-scout-search",
        focusId: "focus-scout-search",
        title: "Search source monitor",
        status: "active",
        triggerMode: "search",
        threshold: 1,
        activationScore: 1.5,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageFocusItemsSync(
    parentLineageId,
    [
      {
        id: "focus-smoke-proactive",
        title: "Maintain proactive Genesis workload",
        domain: "workflow",
        intensity: 1.5,
        status: "active",
        triggerMode: "workflow",
        keywords: ["workflow", "proactive", "smoke"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageFocusItemsSync(
    supportLineageId,
    [
      {
        id: "focus-builder-workflow",
        title: "Distill repeated workflows into tools",
        domain: "workflow",
        intensity: 1.4,
        status: "active",
        triggerMode: "workflow",
        keywords: ["workflow", "tool", "capability"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageTriggersSync(
    supportLineageId,
    [
      {
        id: "trigger-builder-tool",
        focusId: "focus-builder-workflow",
        title: "Workflow tool distillation",
        status: "active",
        triggerMode: "workflow",
        threshold: 1,
        activationScore: 2,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageFocusItemsSync(
    reviveLineageId,
    [
      {
        id: "focus-creator-idea",
        title: "Open new scenario options",
        domain: "scenario_generation",
        intensity: 1.25,
        status: "active",
        triggerMode: "workflow",
        keywords: ["scenario", "novel", "strategy"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageTriggersSync(
    reviveLineageId,
    [
      {
        id: "trigger-creator-idea",
        focusId: "focus-creator-idea",
        title: "Novel scenario trigger",
        status: "active",
        triggerMode: "workflow",
        threshold: 1,
        activationScore: 1.5,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageFocusItemsSync(
    auditorLineageId,
    [
      {
        id: "focus-auditor-risk",
        title: "Track regressions and risk surface",
        domain: "audit",
        intensity: 1.15,
        status: "active",
        triggerMode: "heartbeat",
        keywords: ["risk", "failure", "regression", "audit"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageTriggersSync(
    auditorLineageId,
    [
      {
        id: "trigger-auditor-risk",
        focusId: "focus-auditor-risk",
        title: "Risk regression patrol",
        status: "active",
        triggerMode: "heartbeat",
        threshold: 1,
        activationScore: 1.25,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageFocusItemsSync(
    negotiatorLineageId,
    [
      {
        id: "focus-negotiator-coordination",
        title: "Coordinate recovery and coalition repair",
        domain: "coordination",
        intensity: 1.35,
        status: "active",
        triggerMode: "workflow",
        keywords: ["coordination", "protocol", "coalition", "recovery", "align"],
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageTriggersSync(
    negotiatorLineageId,
    [
      {
        id: "trigger-negotiator-coordination",
        focusId: "focus-negotiator-coordination",
        title: "Coordination recovery trigger",
        status: "active",
        triggerMode: "workflow",
        threshold: 1,
        activationScore: 1.8,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  writeGenesisLineageTriggersSync(
    parentLineageId,
    [
      {
        id: "trigger-smoke-workflow",
        focusId: "focus-smoke-proactive",
        title: "Workflow proactive trigger",
        status: "active",
        triggerMode: "workflow",
        threshold: 1,
        activationScore: 2,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
    process.env,
  );
  refreshGenesisLineageSummarySnapshotSync(process.env);
  return {
    parentLineageId,
    childLineageId,
  };
}

async function seedGenesisUserIntentSignals(): Promise<void> {
  const ts = Date.now();
  await fs.writeFile(
    path.join(process.cwd(), "USER.md"),
    [
      "# USER",
      "",
      "## Work",
      "- Build reusable workflow automation and tool chains.",
      "- Search and query technical signals before implementation.",
      "- Maintain stable verification loops and reusable recovery playbooks.",
      "",
      "## Preferences",
      "- Likes strong coordination, clear protocols, and proactive recovery.",
      "- Prefers auditing regressions before they spread.",
      "",
      "## Interests",
      "- Source discovery, scenario design, and resilient recovery paths.",
      "- Interested in long-running agent ecology, learning, and inheritance.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeGenesisUserIntentHistoryStateSync(
    {
      entries: [
        {
          kind: "search",
          summary: "Search repeated workflow automation sources and signal discovery",
          ts: ts - 3 * 24 * 60 * 60 * 1000,
          sourceRef: "smoke:search-history",
        },
        {
          kind: "query",
          summary: "Query reusable build workflow patterns and regression review",
          ts: ts - 12 * 60 * 60 * 1000,
          sourceRef: "smoke:query-history",
        },
        {
          kind: "consultation",
          summary: "Consult on coordination protocol, recovery strategy, and team alignment",
          ts: ts - 2 * 60 * 60 * 1000,
          sourceRef: "smoke:consultation-history",
        },
        {
          kind: "query",
          summary: "Query long-running agent learning inheritance and recovery loops",
          ts: ts - 30 * 60 * 1000,
          sourceRef: "smoke:query-learning-history",
        },
      ],
      updatedAt: ts,
    },
    process.env,
  );
  refreshGenesisUserIntentSummarySnapshotSync(process.env);
  refreshGenesisLineageSummarySnapshotSync(process.env);
}

async function runGenesisIdleLearningPhase(): Promise<void> {
  const worldStatePath = resolveGenesisWorldStatePath(process.env);
  const now = Date.now();
  const worldState = JSON.parse(await fs.readFile(worldStatePath, "utf-8")) as Record<string, unknown>;
  const cooledWorldState = {
    ...worldState,
    currentPressure: Math.min(Number(worldState.currentPressure ?? 0), 0.18),
    stormMomentum: Math.min(Number(worldState.stormMomentum ?? 0), 0.12),
    replicationBoost: Math.min(Number(worldState.replicationBoost ?? 0), 0.08),
    updatedAt: now,
  };
  await fs.writeFile(worldStatePath, `${JSON.stringify(cooledWorldState, null, 2)}\n`, "utf-8");
  refreshGenesisLineageSummarySnapshotSync(process.env);
  const summary = readGenesisSocietySummarySync(process.env);
  const trajectorySummary = appendGenesisTrajectoryEntrySync(
    buildGenesisTrajectoryEntry({
      ts: now,
      source: "metaclaw:idle_smoke_review",
      summary,
      founderOrigin: summary.vitalitySummary?.highestYieldFounderOrigin ?? null,
    }),
    process.env,
  );
  runGenesisMetaClawIdleOptimizationSync({
    summary,
    trajectorySummary,
    env: process.env,
  });
}

async function runSmokeSession(params: { port: number; origin: string; scopes: string[] }) {
  const ws = new WebSocket(`ws://127.0.0.1:${params.port}`, {
    headers: { origin: params.origin },
  });
  const challengePromise = onceJsonMessage<{ payload?: { nonce?: string } }>(
    ws,
    (value) =>
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).type === "event" &&
      (value as Record<string, unknown>).event === "connect.challenge",
  );

  try {
    await waitForWsOpen(ws);
    await connect(ws, params.scopes, challengePromise);

    const health = await rpcReq<Record<string, unknown>>(ws, "health", {});
    if (!health.ok) {
      throw new Error(`gateway health failed: ${JSON.stringify(health)}`);
    }

    const society = await rpcReq<{
      ts?: number;
      genesisSummary?: Record<string, unknown>;
    }>(ws, "sessions.society", {});
    if (!society.ok) {
      throw new Error(`sessions.society failed: ${JSON.stringify(society)}`);
    }

    let summary = society.payload?.genesisSummary as
      | {
          activeDispatchCount?: number;
          collaborationSummary?: {
            mobilizedAgentCount?: number;
            leadAssignmentCount?: number;
            supportAssignmentCount?: number;
            reviveAssignmentCount?: number;
          };
          vitalitySummary?: {
            lineageCount?: number;
          };
        }
      | undefined;
    let seededVitality: {
      parentLineageId: string;
      childLineageId: string;
    } | null = null;
    if ((summary?.vitalitySummary?.lineageCount ?? 0) === 0) {
      seededVitality = await seedGenesisVitalityFixtures();
      await seedGenesisUserIntentSignals();
      const refreshedSociety = await rpcReq<{
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }>(ws, "sessions.society", {});
      if (!refreshedSociety.ok) {
        throw new Error(`post-vitality-seed sessions.society failed: ${JSON.stringify(refreshedSociety)}`);
      }
      summary = refreshedSociety.payload?.genesisSummary as typeof summary;
      society.payload = refreshedSociety.payload;
    }
    let seededPlan: { primarySessionKey: string; seededPlanPath: string } | null = null;
    if (needsMultiAgentPlan(summary)) {
      seededPlan = await seedGenesisSocietyPlan(ws);
      const refreshedSociety = await rpcReq<{
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }>(ws, "sessions.society", {});
      if (!refreshedSociety.ok) {
        throw new Error(`post-plan-seed sessions.society failed: ${JSON.stringify(refreshedSociety)}`);
      }
      summary = refreshedSociety.payload?.genesisSummary as typeof summary;
      society.payload = refreshedSociety.payload;
    }

    const tick = await rpcReq<{
      decision?: string;
      skipReason?: string;
      tickState?: Record<string, unknown> | null;
      cycle?: Record<string, unknown> | null;
      nextPlan?: Record<string, unknown> | null;
    }>(ws, "sessions.society.tick", {
      primarySessionKey: "agent:main:main",
      force: true,
      minIntervalMs: 0,
      maxActions: 1,
      maxRounds: 1,
    });
    if (!tick.ok) {
      throw new Error(`sessions.society.tick failed: ${JSON.stringify(tick)}`);
    }

    const postTickSociety = await rpcReq<{
      ts?: number;
      genesisSummary?: Record<string, unknown>;
    }>(ws, "sessions.society", {});
    if (!postTickSociety.ok) {
      throw new Error(`post-tick sessions.society failed: ${JSON.stringify(postTickSociety)}`);
    }

    const pump = await rpcReq<{
      ticks?: Array<Record<string, unknown>>;
      finalState?: Record<string, unknown> | null;
      termination?: Record<string, unknown> | null;
    }>(ws, "sessions.society.pump", {
      primarySessionKey: "agent:main:main",
      force: true,
      minIntervalMs: 0,
      maxTicks: 2,
      maxActions: 1,
      maxRounds: 1,
    });
    if (!pump.ok) {
      throw new Error(`sessions.society.pump failed: ${JSON.stringify(pump)}`);
    }

    const postPumpSociety = await rpcReq<{
      ts?: number;
      genesisSummary?: Record<string, unknown>;
    }>(ws, "sessions.society", {});
    if (!postPumpSociety.ok) {
      throw new Error(`post-pump sessions.society failed: ${JSON.stringify(postPumpSociety)}`);
    }

    const followupPump = await rpcReq<{
      ticks?: Array<Record<string, unknown>>;
      finalState?: Record<string, unknown> | null;
      termination?: Record<string, unknown> | null;
    }>(ws, "sessions.society.pump", {
      primarySessionKey: "agent:main:main",
      force: true,
      minIntervalMs: 0,
      maxTicks: 1,
      maxActions: 1,
      maxRounds: 1,
    });
    if (!followupPump.ok) {
      throw new Error(`followup sessions.society.pump failed: ${JSON.stringify(followupPump)}`);
    }

    const postFollowupSociety = await rpcReq<{
      ts?: number;
      genesisSummary?: Record<string, unknown>;
    }>(ws, "sessions.society", {});
    if (!postFollowupSociety.ok) {
      throw new Error(
        `post-followup sessions.society failed: ${JSON.stringify(postFollowupSociety)}`,
      );
    }

    const probePumps: Array<{
      pump: Record<string, unknown> | null;
      summary: { ts?: number; genesisSummary?: Record<string, unknown> } | null;
    }> = [];
    const extraProbeCount = Number.parseInt(
      process.env.OPENCLAW_GENESIS_SMOKE_EXTRA_PROBES ?? "1",
      10,
    );
    for (let index = 0; index < Math.max(0, extraProbeCount); index += 1) {
      const probePump = await rpcReq<{
        ticks?: Array<Record<string, unknown>>;
        finalState?: Record<string, unknown> | null;
        termination?: Record<string, unknown> | null;
      }>(ws, "sessions.society.pump", {
        primarySessionKey: "agent:main:main",
        force: true,
        minIntervalMs: 0,
        maxTicks: 1,
        maxActions: 1,
        maxRounds: 1,
      });
      if (!probePump.ok) {
        throw new Error(`probe sessions.society.pump failed: ${JSON.stringify(probePump)}`);
      }

      const probeSociety = await rpcReq<{
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }>(ws, "sessions.society", {});
      if (!probeSociety.ok) {
        throw new Error(`probe sessions.society failed: ${JSON.stringify(probeSociety)}`);
      }

      probePumps.push({
        pump: probePump.payload ?? null,
        summary: probeSociety.payload ?? null,
      });
    }

    await runGenesisIdleLearningPhase();

    const postIdleSociety = await rpcReq<{
      ts?: number;
      genesisSummary?: Record<string, unknown>;
    }>(ws, "sessions.society", {});
    if (!postIdleSociety.ok) {
      throw new Error(`post-idle sessions.society failed: ${JSON.stringify(postIdleSociety)}`);
    }

    return {
      health: health.payload ?? null,
      society,
      seededVitality,
      seededPlan,
      tick: tick.payload ?? null,
      postTickSociety: postTickSociety.payload ?? null,
      pump: pump.payload ?? null,
      postPumpSociety: postPumpSociety.payload ?? null,
      followupPump: followupPump.payload ?? null,
      postFollowupSociety: postFollowupSociety.payload ?? null,
      probePumps,
      postIdleSociety: postIdleSociety.payload ?? null,
    };
  } finally {
    ws.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port ?? process.env.OPENCLAW_GENESIS_SMOKE_PORT ?? "19101");
  const origin = args.origin ?? `http://127.0.0.1:${port}`;
  const scopes =
    (args.scopes ?? "operator.read,operator.write")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) || ["operator.read"];

  let retryPairingRequestId: string | null = null;
  let health: Record<string, unknown> | null = null;
  let pump: Record<string, unknown> | null = null;
  let tick: Record<string, unknown> | null = null;
  let seededPlan: Record<string, unknown> | null = null;
  let seededVitality: Record<string, unknown> | null = null;
  let postTickSociety:
    | {
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }
    | null = null;
  let postPumpSociety:
    | {
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }
    | null = null;
  let followupPump: Record<string, unknown> | null = null;
  let postFollowupSociety:
    | {
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }
    | null = null;
  let probePumps: Array<{
    pump: Record<string, unknown> | null;
    summary: { ts?: number; genesisSummary?: Record<string, unknown> } | null;
  }> = [];
  let postIdleSociety:
    | {
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }
    | null = null;
  let society:
    | RpcResponse<{
        ts?: number;
        genesisSummary?: Record<string, unknown>;
      }>
    | null = null;

  try {
    const first = await runSmokeSession({ port, origin, scopes });
    health = first.health;
    society = first.society;
    seededVitality = first.seededVitality;
    seededPlan = first.seededPlan;
    tick = first.tick;
    pump = first.pump;
    postTickSociety = first.postTickSociety;
    postPumpSociety = first.postPumpSociety;
    followupPump = first.followupPump;
    postFollowupSociety = first.postFollowupSociety;
    probePumps = first.probePumps;
    postIdleSociety = first.postIdleSociety;
  } catch (error) {
    if (
      error instanceof GatewayConnectError &&
      error.response.error?.code === "NOT_PAIRED" &&
      error.response.error.details?.code === "PAIRING_REQUIRED" &&
      (await approveSmokePairing(error.response.error.details.requestId))
    ) {
      retryPairingRequestId = error.response.error.details.requestId ?? null;
      const retried = await runSmokeSession({ port, origin, scopes });
      health = retried.health;
      society = retried.society;
      seededVitality = retried.seededVitality;
      seededPlan = retried.seededPlan;
      tick = retried.tick;
      pump = retried.pump;
      postTickSociety = retried.postTickSociety;
      postPumpSociety = retried.postPumpSociety;
      followupPump = retried.followupPump;
      postFollowupSociety = retried.postFollowupSociety;
      probePumps = retried.probePumps;
      postIdleSociety = retried.postIdleSociety;
    } else {
      throw error;
    }
  }

  const recoveryQueueReport = buildRecoveryQueueReport(
    (postIdleSociety?.genesisSummary as { vitalitySummary?: unknown } | undefined) ?? null,
  );

  const experimentSignals = (society?.payload?.genesisSummary as { experimentSignals?: unknown } | undefined)
    ?.experimentSignals;
  const assessment = assessGenesisServerSmoke({
    societySummary: society?.payload?.genesisSummary ?? null,
    seededPlan,
    seededVitality,
    tick,
    postTickSociety,
    pump,
    postPumpSociety,
    followupPump,
    postFollowupSociety,
    probePumps,
    postIdleSociety,
    recoveryQueueReport,
  });
  if (assessment.verdict !== "ok") {
    throw new Error(`genesis server smoke assertions failed: ${JSON.stringify(assessment)}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ok",
        port,
        pairing: retryPairingRequestId
          ? {
              autoApproved: true,
              requestId: retryPairingRequestId,
            }
          : null,
        health,
        society: {
          ts: society?.payload?.ts ?? null,
          experimentSignals: experimentSignals ?? null,
          summary: society?.payload?.genesisSummary ?? null,
        },
        assessment,
        seededVitality,
        seededPlan,
        tick: tick ?? null,
        postTickSociety: {
          ts: postTickSociety?.ts ?? null,
          summary: postTickSociety?.genesisSummary ?? null,
        },
        pump: pump ?? null,
        postPumpSociety: {
          ts: postPumpSociety?.ts ?? null,
          summary: postPumpSociety?.genesisSummary ?? null,
        },
        followupPump: followupPump ?? null,
        postFollowupSociety: {
          ts: postFollowupSociety?.ts ?? null,
          summary: postFollowupSociety?.genesisSummary ?? null,
        },
        postIdleSociety: {
          ts: postIdleSociety?.ts ?? null,
          summary: postIdleSociety?.genesisSummary ?? null,
        },
        recoveryQueueReport,
        probePumps,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
