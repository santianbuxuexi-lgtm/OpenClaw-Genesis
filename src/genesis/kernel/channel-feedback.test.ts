import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const summaryFixture = {
  experimentSignals: {
    phaseState: "stable",
    runawayRiskScore: 0.46,
    trendState: "advancing",
  },
  world: {
    currentPressure: 1.44,
    stormMomentum: 0.88,
    replicationBoost: 0.2,
    triggerCounts: {
      workflow: 3,
      heartbeat: 1,
      cron: 0,
    },
  },
  activePlans: [
    {
      primaryAgentId: "main",
      climateKind: "search",
      intensity: 0.75,
      dispatchMode: "immediate",
    },
  ],
  coordinationBatches: [
    {
      lead: { agentId: "main" },
      support: [{ agentId: "builder" }, { agentId: "creator" }, { agentId: "auditor" }],
      revive: [{ agentId: "negotiator" }],
    },
  ],
  collaborationSummary: {
    mobilizedAgentCount: 6,
    collaborativePlanCount: 1,
    averageMobilizedCoverageRatio: 1,
    averageTargetCoverageRatio: 0.8,
    coordinationScore: 15.5,
    collaborationEffectScore: 15.5,
  },
  proactiveWorkSummary: {
    totalEntryCount: 3,
    plannedCount: 1,
    inProgressCount: 0,
    completedCount: 2,
    learningPlannedCount: 1,
    learningInProgressCount: 0,
    learningCompletedCount: 1,
    activeLearningFounderCount: 1,
    activeFounderCount: 2,
    highestActiveFounderOrigin: "builder",
    highestActiveFounderScore: 2.3,
    highestLearningFounderOrigin: "builder",
    concreteOutcomeCount: 2,
    highestConcreteOutcomeFounderOrigin: "builder",
    founderActivityLeaders: [
      {
        founderOrigin: "builder",
        plannedCount: 0,
        inProgressCount: 0,
        completedCount: 1,
        learningPlannedCount: 0,
        learningInProgressCount: 0,
        learningCompletedCount: 1,
        resultCount: 1,
        outcomeCount: 1,
        activityScore: 2.3,
      },
    ],
    recentLearningEntries: [
      {
        workId: "learning:2026-03-29:builder",
        founderOrigin: "builder",
        agentId: "builder",
        lineageId: "builder_founder",
        sessionKey: "agent:builder:main",
        action: "assist",
        climateKind: "daily-learning",
        workType: "learning",
        task: "Daily specialty learning: learn reusable tools, skills, and automations",
        status: "completed",
        executionStage: "skill_build",
        skillTarget: "publish-creator",
        builtSkillName: "publish-creator",
        resultPreview: "Reviewed new model compression tooling patterns and drafted a skill/tool plan.",
        artifactLabel: "skill/tool",
        effectType: "skill_tool",
        effectEvidence: "Reviewed new model compression tooling patterns and drafted a skill/tool plan.",
        source: "daily_learning",
        ts: 1002,
        updatedAt: 1002,
      },
    ],
    recentLearningOutcomes: [
      {
        workId: "learning:2026-03-29:builder",
        founderOrigin: "builder",
        agentId: "builder",
        lineageId: "builder_founder",
        sessionKey: "agent:builder:main",
        action: "assist",
        climateKind: "daily-learning",
        workType: "learning",
        task: "Daily specialty learning: learn reusable tools, skills, and automations",
        status: "completed",
        executionStage: "skill_build",
        skillTarget: "publish-creator",
        builtSkillName: "publish-creator",
        resultPreview: "Reviewed new model compression tooling patterns and drafted a skill/tool plan.",
        artifactLabel: "skill/tool",
        effectType: "skill_tool",
        effectEvidence: "Reviewed new model compression tooling patterns and drafted a skill/tool plan.",
        source: "daily_learning",
        ts: 1002,
        updatedAt: 1002,
      },
    ],
    recentConcreteOutcomes: [
      {
        workId: "w2",
        founderOrigin: "builder",
        driverKind: "history",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["compression", "tooling", "weibo"],
        driverSummary: "history:search | topic:research_signal | keywords:compression,tooling,weibo",
        agentId: "builder",
        lineageId: "builder_founder",
        sessionKey: "agent:builder:main",
        action: "assist",
        climateKind: "search",
        workType: "tooling",
        task: "涓诲姩鎶婂綋鍓嶉渶姹傝浆鎴愬彲鎵ц workflow銆乼ool 鎴?skill",
        status: "completed",
        resultPreview: "鍋氫簡涓€涓帇缂╂妧鏈姣斿伐鍏疯崏绋?",
        artifactLabel: "skill/tool",
        effectType: "skill_tool",
        effectEvidence: "鍋氫簡涓€涓帇缂╂妧鏈姣斿伐鍏疯崏绋?",
        source: "run_completion",
        ts: 1001,
        updatedAt: 1001,
      },
      {
        workId: "w1",
        founderOrigin: "scout",
        driverKind: "history",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["israel", "iran", "weibo", "headline"],
        driverSummary: "history:search | topic:research_signal | keywords:israel,iran,weibo,headline",
        agentId: "scout",
        lineageId: "scout_founder",
        sessionKey: "agent:scout:main",
        action: "assist",
        climateKind: "search",
        workType: "intelligence",
        task: "涓诲姩鎼滅储淇″彿銆佹儏鎶ュ拰鍙墽琛屾満浼氾紝骞朵负鍏朵粬 founder 鎻愪緵杈撳叆",
        status: "completed",
        resultPreview: "鍙戠幇鏂扮殑妯″瀷鍘嬬缉鍟嗘満鍜岀儹鐐瑰叧閿瘝",
        artifactLabel: "signal/opportunity",
        effectType: "opportunity",
        effectEvidence: "鍙戠幇鏂扮殑妯″瀷鍘嬬缉鍟嗘満鍜岀儹鐐瑰叧閿瘝",
        source: "run_completion",
        ts: 1000,
        updatedAt: 1000,
      },
      {
        workId: "weibo-post",
        founderOrigin: "creator",
        driverKind: "hotspot",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["israel", "iran", "weibo", "headline"],
        driverSummary: "history:search | topic:research_signal | keywords:israel,iran,weibo,headline",
        agentId: "creator",
        lineageId: "creator_founder",
        sessionKey: "agent:creator:main",
        platform: "weibo",
        accountRecordId: "weibo:1",
        accountLabel: "寰崥涓诲彿",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use weibo account to publish a short update",
        status: "completed",
        resultPreview: "Published using skill weibo.publish at https://weibo.com/4025893740/QyvknufvP",
        artifactLabel: "weibo",
        effectType: "publication",
        effectEvidence: "https://weibo.com/4025893740/QyvknufvP",
        externalCapability: "publish",
        externalStatus: "executed",
        externalEvidenceType: "post_id",
        externalEvidenceValue: "https://weibo.com/4025893740/QyvknufvP",
        externalId: "QyvknufvP",
        contentPreview: "以色列伊朗局势升温时，市场真正交易的不是消息本身，而是风险预期与情绪溢价。",
        hotspotTitle: "以色列伊朗局势升级，市场避险情绪抬头",
        source: "run_completion",
        ts: 1003,
        updatedAt: 1003,
      },
    ],
    recentEntries: [
      {
        workId: "weibo-post",
        founderOrigin: "creator",
        driverKind: "hotspot",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["israel", "iran", "weibo", "headline"],
        driverSummary: "history:search | topic:research_signal | keywords:israel,iran,weibo,headline",
        agentId: "creator",
        lineageId: "creator_founder",
        sessionKey: "agent:creator:main",
        platform: "weibo",
        accountRecordId: "weibo:1",
        accountLabel: "寰崥涓诲彿",
        action: "assist",
        climateKind: "external-execution",
        workType: "external_publish",
        task: "Use weibo account to publish a short update",
        status: "completed",
        resultPreview: "Published using skill weibo.publish at https://weibo.com/4025893740/QyvknufvP",
        artifactLabel: "weibo",
        externalCapability: "publish",
        externalStatus: "executed",
        externalEvidenceType: "post_id",
        externalEvidenceValue: "https://weibo.com/4025893740/QyvknufvP",
        externalId: "QyvknufvP",
        contentPreview: "以色列伊朗局势升温时，市场真正交易的不是消息本身，而是风险预期与情绪溢价。",
        hotspotTitle: "以色列伊朗局势升级，市场避险情绪抬头",
        source: "run_completion",
        ts: 1003,
        updatedAt: 1003,
      },
      {
        workId: "child-work",
        founderOrigin: "creator",
        agentId: "creator",
        lineageId: "creator_founder::workflow::1006",
        sessionKey: "agent:creator:main::child",
        action: "assist",
        climateKind: "search",
        workType: "synthesis",
        task: "从热点延展成更深一层的评论角度，并交由外发链继续执行",
        status: "in_progress",
        resultPreview: "child lineage is drafting a sharper commentary angle",
        artifactLabel: "content/plan",
        source: "workflow_dispatch",
        ts: 1006,
        updatedAt: 1006,
      },
      {
        workId: "child-output",
        founderOrigin: "builder",
        agentId: "builder",
        lineageId: "builder_founder::workflow::1004",
        sessionKey: "agent:builder:main::child",
        action: "assist",
        climateKind: "search",
        workType: "tooling",
        task: "扩展一条 child lineage 的执行工具链",
        status: "completed",
        resultPreview: "child lineage built a lighter publish helper for follow-up posts",
        artifactLabel: "skill/tool",
        effectType: "skill_tool",
        effectEvidence: "child lineage built a lighter publish helper for follow-up posts",
        source: "run_completion",
        ts: 1004,
        updatedAt: 1004,
      },
      {
        workId: "w2",
        founderOrigin: "builder",
        driverKind: "history",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["compression", "tooling", "weibo"],
        driverSummary: "history:search | topic:research_signal | keywords:compression,tooling,weibo",
        agentId: "builder",
        lineageId: "builder_founder",
        sessionKey: "agent:builder:main",
        action: "assist",
        climateKind: "search",
        workType: "tooling",
        task: "涓诲姩鎶婂綋鍓嶉渶姹傝浆鎴愬彲鎵ц workflow銆乼ool 鎴?skill",
        status: "completed",
        resultPreview: "鍋氫簡涓€涓帇缂╂妧鏈姣斿伐鍏疯崏绋?",
        artifactLabel: "skill/tool",
        source: "run_completion",
        ts: 1001,
        updatedAt: 1001,
      },
      {
        workId: "w1",
        founderOrigin: "scout",
        driverKind: "history",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["israel", "iran", "weibo", "headline"],
        driverSummary: "history:search | topic:research_signal | keywords:israel,iran,weibo,headline",
        agentId: "scout",
        lineageId: "scout_founder",
        sessionKey: "agent:scout:main",
        action: "assist",
        climateKind: "search",
        workType: "intelligence",
        task: "涓诲姩鎼滅储淇″彿銆佹儏鎶ュ拰鍙墽琛屾満浼氾紝骞朵负鍏朵粬 founder 鎻愪緵杈撳叆",
        status: "completed",
        resultPreview: "鏁寸悊浜嗚胺姝屽帇缂╂妧鏈殑鏈€鏂板叧閿瘝鍜屾柟鍚?",
        artifactLabel: "signal/opportunity",
        source: "run_completion",
        ts: 1000,
        updatedAt: 1000,
      },
      {
        workId: "skillcap:2026-03-29:negotiator",
        founderOrigin: "negotiator",
        driverKind: "history",
        driverHistoryKind: "search",
        driverTopicCluster: "research_signal",
        driverKeywords: ["weibo", "headline"],
        driverSummary: "history:search | topic:research_signal | keywords:weibo,headline",
        agentId: "negotiator",
        lineageId: "negotiator",
        sessionKey: "agent:negotiator:main",
        action: "reactivate",
        climateKind: "skill-capability",
        workType: "skill_coordination",
        task: "Coordinate skill adoption order, ownership, and execution lanes around publish-creator",
        status: "in_progress",
        artifactLabel: "coordination",
        source: "workflow_dispatch",
        ts: 999,
        updatedAt: 999,
      },
    ],
  },
  skillCapabilitySummary: {
    workspaceDir: "/tmp/workspace",
    totalSkillCount: 6,
    readySkillCount: 4,
    degradedSkillCount: 1,
    blockedSkillCount: 1,
    installableSkillCount: 1,
    alwaysOnSkillCount: 0,
    publishCapableSkillCount: 2,
    researchCapableSkillCount: 2,
    automationCapableSkillCount: 2,
    highestSkillCapabilityFounderOrigin: "builder",
    highestSkillGapFounderOrigin: "scout",
    readySkillNames: ["search-scout", "tool-builder"],
    degradedSkillNames: ["publish-creator"],
    installableSkillNames: ["publish-creator"],
    founderSkillLeaders: [
      {
        founderOrigin: "builder",
        readyScore: 4,
        gapScore: 0,
        readySkillCount: 2,
        degradedSkillCount: 0,
        installableSkillCount: 0,
      },
      {
        founderOrigin: "scout",
        readyScore: 3,
        gapScore: 1,
        readySkillCount: 1,
        degradedSkillCount: 1,
        installableSkillCount: 1,
      },
      {
        founderOrigin: "creator",
        readyScore: 2,
        gapScore: 1,
        readySkillCount: 1,
        degradedSkillCount: 1,
        installableSkillCount: 1,
      },
      {
        founderOrigin: "auditor",
        readyScore: 1,
        gapScore: 0,
        readySkillCount: 0,
        degradedSkillCount: 0,
        installableSkillCount: 0,
      },
      {
        founderOrigin: "negotiator",
        readyScore: 1,
        gapScore: 0,
        readySkillCount: 0,
        degradedSkillCount: 0,
        installableSkillCount: 0,
      },
    ],
  },
  openCliCapabilitySummary: {
    available: true,
    invocation: "npx",
    commandCount: 430,
    browserBridgeConnected: false,
    hotSourceCount: 3,
    readyHotSourceNames: ["36kr/news", "bbc/news", "weibo/hot"],
    lastProbeAt: 1004,
    lastProbeError: null,
    lastScoutAt: 1005,
    lastScoutError: null,
    latestScoutSource: "36kr/news",
    latestScoutTitle: "浠ヨ壊鍒椾紛鏈楀眬鍔垮崌绾э紝甯傚満閬块櫓鎯呯华鎶ご",
    latestScoutUrl: "https://36kr.com/p/1",
    recentScoutItems: [
      {
        source: "36kr/news",
        title: "浠ヨ壊鍒椾紛鏈楀眬鍔垮崌绾э紝甯傚満閬块櫓鎯呯华鎶ご",
        url: "https://36kr.com/p/1",
        summary: "鍥介檯灞€鍔夸笌鑳芥簮浠锋牸鎴愪负鐑偣銆?",
        ts: 1005,
      },
      {
        source: "36kr/news",
        title: "缇庤仈鍌ㄤ笌涓笢灞€鍔垮叡鍚屽奖鍝嶅叏鐞冮闄╁亸濂?",
        url: "https://36kr.com/p/2",
        summary: "鐑偣缁х画鎵╂暎銆?",
        ts: 1005,
      },
    ],
  },
  loginStatePoolSummary: {
    totalAccountCount: 2,
    readyAccountCount: 1,
    busyAccountCount: 0,
    pendingAccountCount: 1,
    reloginNeededCount: 0,
    blockedAccountCount: 0,
    highestReadyPlatform: "weibo",
    highestGapPlatform: "douyin",
    recentAccounts: [
      {
        recordId: "weibo:1",
        platform: "weibo",
        accountLabel: "寰崥涓诲彿",
        loginUrl: "https://weibo.com/login.php",
        status: "ready",
        authMode: "storage_state",
        storageStatePath: "/tmp/weibo.json",
        cookieCount: 2,
        originCount: 1,
        capabilities: ["publish", "browse", "comment"],
        lastUsedBy: "creator",
        lastOutcome: "legacy publish summary should not leak",
        source: "browser_popup",
        updatedAt: 1001,
        createdAt: 1000,
      },
      {
        recordId: "douyin:2",
        platform: "douyin",
        accountLabel: "鎶栭煶瀹為獙鍙?",
        loginUrl: "https://www.douyin.com/",
        status: "pending",
        authMode: "storage_state",
        capabilities: ["publish", "browse", "comment"],
        source: "browser_popup",
        updatedAt: 1002,
        createdAt: 1002,
      },
    ],
    platformLeaders: [
      {
        platform: "weibo",
        readyCount: 1,
        pendingCount: 0,
        reloginNeededCount: 0,
        blockedCount: 0,
        capabilityCount: 3,
      },
      {
        platform: "douyin",
        readyCount: 0,
        pendingCount: 1,
        reloginNeededCount: 0,
        blockedCount: 0,
        capabilityCount: 3,
      },
    ],
  },
  userIntentSummary: {
    historyEntryCount: 2,
    searchHistoryCount: 2,
    queryHistoryCount: 0,
    consultationHistoryCount: 0,
    dominantHistoryKind: "search",
    strongestTopicCluster: "coordination_recovery",
    strongestTopicSignalScore: 8.2,
    recentKeywords: ["israel", "iran", "weibo", "headline", "compression"],
    highestIntentFounderOrigin: "negotiator",
    highestLongTermIntentFounderOrigin: "negotiator",
  },
  vitalitySummary: {
    lineageCount: 13,
    childLineageCount: 7,
    specialtyOnlyChildCount: 4,
    superpowerChildCount: 3,
    multiGenerationLineageCount: 5,
    childYieldLeader: "specialty",
    highestMultigenerationFounderOrigin: "creator",
    deepestGenerationDepth: 3,
    secondGenerationChildCount: 4,
    thirdGenerationChildCount: 3,
    highestClimateReplicationFounderOrigin: "builder",
    highestSurvivalReplicationFounderOrigin: "builder",
    mortalityPressureScore: 2.5,
    highestTerminalMortalityFounderOrigin: "auditor",
    highestLongTermRecoveryFounderOrigin: "creator",
    highestLongTermDegradationFounderOrigin: "auditor",
    highestStableRecoveryFounderOrigin: "creator",
    highestRecoveryChainFounderOrigin: "scout",
    recoveryStageMap: {
      stages: [
        {
          stage: "stressed",
          founderOrigin: "auditor",
          runnerUpFounderOrigin: "negotiator",
          basis: "transient_recovery",
        },
        {
          stage: "recoverable",
          founderOrigin: "creator",
          runnerUpFounderOrigin: "builder",
          basis: "stable_recovery",
        },
        {
          stage: "stable",
          founderOrigin: "scout",
          runnerUpFounderOrigin: "creator",
          basis: "recovery_chain",
        },
      ],
    },
    replicationLeaders: [
      {
        founderOrigin: "builder",
        childCount: 4,
        workingChildCount: 3,
        proactiveChildCount: 2,
        superpowerChildCount: 1,
        replicationValueScore: 3.2,
      },
      {
        founderOrigin: "creator",
        childCount: 3,
        workingChildCount: 2,
        proactiveChildCount: 2,
        superpowerChildCount: 2,
        replicationValueScore: 2.7,
      },
    ],
    multiGenerationLeaders: [
      {
        founderOrigin: "creator",
        multiGenerationChildCount: 3,
        multiGenerationWorkingChildCount: 2,
        multiGenerationProactiveChildCount: 2,
        multiGenerationSuperpowerChildCount: 1,
        multiGenerationValueScore: 2.6,
        multiGenerationYieldEfficiency: 1.4,
        multiGenerationEffectiveScore: 3.1,
      },
      {
        founderOrigin: "builder",
        multiGenerationChildCount: 2,
        multiGenerationWorkingChildCount: 2,
        multiGenerationProactiveChildCount: 1,
        multiGenerationSuperpowerChildCount: 1,
        multiGenerationValueScore: 2.1,
        multiGenerationYieldEfficiency: 1.2,
        multiGenerationEffectiveScore: 2.5,
      },
    ],
  },
  learningSummary: {
    highestReplicationQualificationFounderOrigin: "builder",
    highestRecoveryQualificationFounderOrigin: "creator",
    highestNicheBalanceFounderOrigin: "scout",
    highestLearningVelocityFounderOrigin: "builder",
    highestLearningConversionFounderOrigin: "builder",
    highestLearningInheritanceFounderOrigin: "builder",
    highestLearningMomentumFounderOrigin: "builder",
    metaClawTargetFounderOrigin: "creator",
    metaClawOptimizationActive: true,
    recoveryQueue: [
      {
        label: "auditor",
        ecologyState: "stressed",
        recoveryPhase: "stabilize",
        recoveryStage: "stressed",
        recoveryStageResponsibilityRole: "leader",
        priority: 1.25,
      },
      {
        label: "negotiator",
        ecologyState: "stressed",
        recoveryPhase: "stabilize",
        recoveryStage: "stressed",
        recoveryStageResponsibilityRole: "runner-up",
        priority: 0.95,
      },
    ],
  },
} as const;

describe("channel feedback commands", () => {
  let stateDir: string;

  beforeEach(async () => {
    vi.resetModules();
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-genesis-channel-feedback-"));
    vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
    vi.stubEnv("OPENCLAW_GENESIS_CHANNEL_FEEDBACK_ENABLED", "1");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  it("renders Chinese status commands and a compact real footer", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    vi.doMock("./operator-channel.js", () => ({
      runGenesisOperatorChannelTurn: vi.fn(),
    }));
    const {
      resolveGenesisStatusCommandReply,
      appendGenesisStatusFooterToReply,
    } = await import("./channel-feedback.js");

    const workflow = resolveGenesisStatusCommandReply("/workflow");
    const founders = resolveGenesisStatusCommandReply("/founders");
    const skills = resolveGenesisStatusCommandReply("/skills");
    const accounts = resolveGenesisStatusCommandReply("/accounts");
    const queue = resolveGenesisStatusCommandReply("/queue");
    const pressure = resolveGenesisStatusCommandReply("/pressure");
    const intent = resolveGenesisStatusCommandReply("/intent");
    const progress = resolveGenesisStatusCommandReply("/progress");
    const footer = appendGenesisStatusFooterToReply({ text: "done" });

    expect(workflow?.text).toContain("climate=search");
    expect(founders?.text).toContain("roster=builder,creator,auditor,negotiator,scout");
    expect(founders?.text).toContain("skillOwner=builder skillGap=scout");
    expect(skills?.text).toContain("ready=4 degraded=1 blocked=1 installable=1");
    expect(skills?.text).toContain("skillOwner=builder skillGap=scout");
    expect(skills?.text).toContain("opencli=ready source=npx commands=430 bridge=disconnected");
    expect(skills?.text).toContain("hot=36kr/news,bbc/news,weibo/hot");
    expect(skills?.text).toContain("scout=36kr/news");
    expect(skills?.text).toContain("readySkills=search-scout,tool-builder");
    expect(skills?.text).toContain("currentSkillWork=negotiator:skill_coordination:in_progress [coordination]");
    expect(accounts?.text).toContain("ready=1 busy=0 pending=1 relogin=0 blocked=0");
    expect(accounts?.text).toContain("readyPlatform=weibo gapPlatform=douyin");
    expect(accounts?.text).toContain("recentAccounts=weibo:寰崥涓诲彿:ready:creator:source=popup:verified=");
    expect(accounts?.text).toContain("[platform=weibo capability=publish evidence=post_id id=QyvknufvP]");
    expect(accounts?.text).toContain("=> https://weibo.com/4025893740/QyvknufvP");
    expect(accounts?.text).not.toContain("legacy publish summary should not leak");
    expect(queue?.text).toContain("auditor:stressed");
    expect(pressure?.text).toContain("currentPressure=1.44");
    expect(intent?.text).toContain("cluster=coordination_recovery");
    expect(intent?.text).toContain("recentKeywords=israel,iran,weibo,headline,compression");
    expect(progress?.text).toContain("childYield=specialty");
    expect(progress?.text).toContain("childExpansion=children=7 specialty=4 superpower=3 secondGen=4 thirdGen=3 multigen=5");
    expect(progress?.text).toContain("childGrowth=builder:child=4 working=3 proactive=2 superpower=1 value=3.2");
    expect(progress?.text).toContain("childLabor=creator:multiGen=3 working=2 proactive=2 superpower=1 yield=1.4 effective=3.1");
    expect(progress?.text).toContain("childWork=creator:synthesis:in_progress");
    expect(progress?.text).toContain("lineage=creator_founder::workflow::1006");
    expect(progress?.text).toContain("childOutput=builder:tooling:lineage=builder_founder::workflow::1004");
    expect(progress?.text).toContain("driver=history:search | topic:research_signal | keywords:compression,tooling,weibo");
    expect(progress?.text).toContain("opencli=ready source=npx commands=430 bridge=disconnected");
    expect(progress?.text).toContain("items=36kr/news:浠ヨ壊鍒椾紛鏈楀眬鍔垮崌绾э紝甯傚満閬块櫓鎯呯华鎶ご");
    expect(progress?.text).toContain("learning=builder planned=1 inProgress=0 completed=1");
    expect(progress?.text).toContain("founderBoard=builder=completed:tooling:skill/tool");
    expect(progress?.text).toContain("driver=history:search | topic:research_signal | keywords:israel,iran,weibo,headline");
    expect(progress?.text).toContain("scout=completed:intelligence:signal/opportunity");
    expect(progress?.text).toContain("skill=search-scout");
    expect(progress?.text).toContain("executingNow=creator:synthesis:in_progress [content/plan]");
    expect(progress?.text).toContain("negotiator:skill_coordination:in_progress [coordination]");
    expect(progress?.text).toContain("target=publish-creator");
    expect(progress?.text).toContain("todayDone=creator:external_publish:completed [weibo]");
    expect(progress?.text).toContain("builder:tooling:completed [skill/tool]");
    expect(progress?.text).toContain("publicOutput=creator:weibo");
    expect(progress?.text).toContain("content=以色列伊朗局势升温时，市场真正交易的不是消息本身，而是风险预期与情绪溢价。");
    expect(progress?.text).toContain("recentLearning=builder:completed");
    expect(progress?.text).toContain("recentEvidence=builder:skill/tool");
    const learning = resolveGenesisStatusCommandReply("/learning");
    expect(learning?.text).toContain("dailyLearning=builder planned=1 inProgress=0 completed=1");
    expect(footer.text).toContain("coordination=15.5");
    expect(footer.text).toContain("lead=main support=builder,creator,auditor revive=negotiator");
    expect(footer.text).toContain("work=planned:1 inProgress:0 completed:2");
    expect(footer.text).toContain(
      "replication=builder recovery=creator niche=scout multigen=creator",
    );
    expect(footer.text).toContain("skills=ready:4 degraded:1 installable:1 owner=builder gap=scout");
    expect(footer.text).toContain("opencli=ready source=npx commands=430 bridge=disconnected");
    expect(footer.text).toContain("accounts=ready:1 busy:0 pending:1 relogin:0 owner=weibo gap=douyin");
    expect(footer.text).toContain("outcome=builder:skill/tool");
    expect(footer.text).toContain("done");
    expect(footer.text?.trimEnd().split("\n").slice(-4).length).toBe(4);
  });

  it("shows explicit no-evidence wording when nothing is completed", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => ({
        ...summaryFixture,
        proactiveWorkSummary: {
          ...summaryFixture.proactiveWorkSummary,
          completedCount: 0,
          learningCompletedCount: 0,
          concreteOutcomeCount: 0,
          recentConcreteOutcomes: [],
          recentEntries: summaryFixture.proactiveWorkSummary.recentEntries.filter(
            (entry) => entry.workId !== "weibo-post",
          ),
        },
      })),
    }));
    vi.doMock("./operator-channel.js", () => ({
      runGenesisOperatorChannelTurn: vi.fn(),
    }));
    const {
      resolveGenesisStatusCommandReply,
      appendGenesisStatusFooterToReply,
    } = await import("./channel-feedback.js");

    const progress = resolveGenesisStatusCommandReply("/progress");
    const footer = appendGenesisStatusFooterToReply({ text: "done" });

    expect(progress?.text).toContain("recentEvidence=none");
    expect(progress?.text).toContain("publicOutput=none");
    expect(footer.text).toContain("outcome=暂无已完成成果证据");
  });

  it("writes a channel snapshot when inbound workflow turns run", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    vi.doMock("./operator-channel.js", () => ({
      runGenesisOperatorChannelTurn: vi.fn(async () => ({
        climateKind: "search",
        intensity: 0.75,
        dispatch: { primaryAgentId: "main", mobilizedCoverageRatio: 1, targetCoverageRatio: 0.8 },
        summary: summaryFixture,
        report: { title: "qq:operator", lines: [] },
      })),
    }));
    const { runGenesisInboundWorkflowTurn } = await import("./channel-feedback.js");

    await runGenesisInboundWorkflowTurn({
      ctx: {
        SessionKey: "agent:main:main",
        BodyForCommands: "鎼滅储鎭㈠淇″彿锛屽苟鍗忚皟 founder 缁欐垜缁撹",
        Surface: "qqbot",
        AccountId: "default",
        Timestamp: 1000,
      } as never,
      cfg: { session: { mainKey: "main" } } as never,
    });

    const snapshotPath = path.join(stateDir, "genesis", "channel-status.json");
    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));
    expect(snapshot.phaseState).toBe("stable");
    expect(snapshot.replicationLeader).toBe("builder");
    expect(snapshot.recoveryLeader).toBe("creator");
    expect(snapshot.nicheLeader).toBe("scout");
  });

  it("answers natural-language agent roster questions in Genesis terms", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    const { resolveGenesisNaturalLanguageReply } = await import("./channel-feedback.js");

    const reply = resolveGenesisNaturalLanguageReply("现在有多少agent");

    expect(reply?.text).toContain("Genesis 已接管当前会话");
    expect(reply?.text).toContain("当前共 6 个角色");
    expect(reply?.text).toContain("当前成员=13（其中 founder+main=6，child=7，二代=4，三代=3，多代链=5）");
    expect(reply?.text).toContain("复制扩张=children=7 specialty=4 superpower=3 secondGen=4 thirdGen=3 multigen=5");
    expect(reply?.text).toContain("childGrowth=builder:child=4 working=3 proactive=2 superpower=1 value=3.2");
    expect(reply?.text).toContain("childWork=creator:synthesis:in_progress");
    expect(reply?.text).toContain("childOutput=builder:tooling:lineage=builder_founder::workflow::1004");
    expect(reply?.text).toContain("builder、creator、auditor、negotiator、scout");
    expect(reply?.text).toContain("公开成果=");
  });

  it("answers team-shape questions in Genesis terms", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    const { resolveGenesisNaturalLanguageReply } = await import("./channel-feedback.js");

    const reply = resolveGenesisNaturalLanguageReply("谁在工作、多少 agent、团队长什么样");

    expect(reply?.text).toContain("当前调度：lead=main");
    expect(reply?.text).toContain("childLabor=creator:multiGen=3 working=2 proactive=2 superpower=1 yield=1.4 effective=3.1");
    expect(reply?.text).toContain("当前工作=");
  });

  it("answers member and replication questions in Genesis terms", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    const { resolveGenesisNaturalLanguageReply } = await import("./channel-feedback.js");

    const reply = resolveGenesisNaturalLanguageReply("genesis 有多少成员？繁衍复制了多少？");

    expect(reply?.text).toContain("Genesis 已接管当前会话");
    expect(reply?.text).toContain("当前成员=13（其中 founder+main=6，child=7，二代=4，三代=3，多代链=5）");
    expect(reply?.text).toContain("复制扩张=children=7 specialty=4 superpower=3 secondGen=4 thirdGen=3 multigen=5");
  });

  it("treats explicit Genesis meta questions as Genesis-routed queries", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    const { resolveGenesisNaturalLanguageReply } = await import("./channel-feedback.js");

    const reply = resolveGenesisNaturalLanguageReply("genesis 当前状态怎么样");

    expect(reply?.text).toContain("Genesis 已接管当前会话");
    expect(reply?.text).toContain("当前成员=13（其中 founder+main=6，child=7，二代=4，三代=3，多代链=5）");
  });

  it("does not hijack Genesis task requests into status replies", async () => {
    vi.doMock("./society-query.js", () => ({
      readGenesisSocietySummarySync: vi.fn(() => summaryFixture),
    }));
    const { resolveGenesisNaturalLanguageReply } = await import("./channel-feedback.js");

    const reply = resolveGenesisNaturalLanguageReply(
      "搜索当前国际金融局势，尤其亚洲领域的热点新闻。并整理成汇报。由genesis共同推进。",
    );

    expect(reply).toBeNull();
  });
});

