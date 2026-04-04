#!/usr/bin/env node

import fs from "node:fs";

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSmokeResult(filePath) {
  const result = readJsonFile(filePath);
  const detailedPath = result.societyLog;
  let detailed = result;
  if (typeof detailedPath === "string" && detailedPath.trim().length > 0 && fs.existsSync(detailedPath)) {
    try {
      detailed = readJsonFile(detailedPath);
    } catch {
      detailed = result;
    }
  }
  return {
    result,
    detailed,
  };
}

function pickLeader(origin, score) {
  if (!origin) {
    return null;
  }
  return {
    founder: origin,
    score: Number(score ?? 0),
  };
}

function pickEntry(entries, origin) {
  if (!origin || !Array.isArray(entries)) {
    return null;
  }
  return entries.find((entry) => entry?.founderOrigin === origin) ?? null;
}

function buildVerifyReport(filePath) {
  const { result, detailed } = readSmokeResult(filePath);
  const summary =
    detailed.postIdleSociety?.summary ??
    detailed.postFollowupSociety?.summary ??
    detailed.postPumpSociety?.summary ??
    detailed.postTickSociety?.summary ??
    detailed.society?.summary ??
    null;

  const assessment = result.assessment ?? detailed.assessment ?? {};
  const experimentSignals = summary?.experimentSignals ?? result.experimentSignals ?? {};
  const collaborationSummary = summary?.collaborationSummary ?? result.collaborationSummary ?? {};
  const vitalitySummary = summary?.vitalitySummary ?? result.vitalitySummary ?? {};
  const learningSummary = summary?.learningSummary ?? {};
  const userIntentSummary = summary?.userIntentSummary ?? {};
  const replicationQualificationEntry = pickEntry(
    learningSummary.replicationQualificationLeaders,
    learningSummary.highestReplicationQualificationFounderOrigin,
  );
  const recoveryQualificationEntry = pickEntry(
    learningSummary.recoveryQualificationLeaders,
    learningSummary.highestRecoveryQualificationFounderOrigin,
  );
  const nicheBalanceEntry = pickEntry(
    learningSummary.nicheBalanceLeaders,
    learningSummary.highestNicheBalanceFounderOrigin,
  );

  return {
    status: result.status ?? null,
    verdict: assessment.verdict ?? null,
    smokeOutputFile: filePath,
    societyLog: result.societyLog ?? null,
    phase: {
      phaseState: experimentSignals.phaseState ?? null,
      runawayRiskScore: experimentSignals.runawayRiskScore ?? null,
      amplificationScore: experimentSignals.amplificationScore ?? null,
      trendState: assessment.trend?.state ?? null,
      riskDirection: assessment.trend?.riskDirection ?? null,
    },
    collaboration: {
      coordinationScore: collaborationSummary.coordinationScore ?? 0,
      collaborationEffectScore: collaborationSummary.collaborationEffectScore ?? 0,
      mobilizedAgentCount: collaborationSummary.mobilizedAgentCount ?? 0,
      averageMobilizedCoverageRatio: collaborationSummary.averageMobilizedCoverageRatio ?? 0,
      averageTargetCoverageRatio: collaborationSummary.averageTargetCoverageRatio ?? 0,
      roleLeaders: {
        lead: pickLeader(
          vitalitySummary.highestLeadCooperationFounderOrigin,
          vitalitySummary.highestLeadCooperationFounderScore,
        ),
        support: pickLeader(
          vitalitySummary.highestSupportCooperationFounderOrigin,
          vitalitySummary.highestSupportCooperationFounderScore,
        ),
        revive: pickLeader(
          vitalitySummary.highestReviveCooperationFounderOrigin,
          vitalitySummary.highestReviveCooperationFounderScore,
        ),
      },
      cooperativeYieldLeader: pickLeader(
        vitalitySummary.highestCooperativeYieldFounderOrigin,
        vitalitySummary.highestCooperativeYieldFounderScore,
      ),
    },
    ecology: {
      replicationQualificationLeader: pickLeader(
        learningSummary.highestReplicationQualificationFounderOrigin,
        learningSummary.highestReplicationQualificationFounderScore,
      ),
      recoveryQualificationLeader: pickLeader(
        learningSummary.highestRecoveryQualificationFounderOrigin,
        learningSummary.highestRecoveryQualificationFounderScore,
      ),
      nicheBalanceLeader: pickLeader(
        learningSummary.highestNicheBalanceFounderOrigin,
        learningSummary.highestNicheBalanceFounderScore,
      ),
      nicheBalanceLeaders:
        (learningSummary.nicheBalanceLeaders ?? []).slice(0, 5).map((entry) => ({
          founder: entry.founderOrigin,
          nicheBalanceScore: Number(entry.nicheBalanceScore ?? 0),
          nicheIrreplaceabilityScore: Number(entry.nicheIrreplaceabilityScore ?? 0),
          nicheDistinctivenessScore: Number(entry.nicheDistinctivenessScore ?? 0),
          nicheResilienceScore: Number(entry.nicheResilienceScore ?? 0),
        })),
      learningVelocityLeader: pickLeader(
        learningSummary.highestLearningVelocityFounderOrigin,
        learningSummary.highestLearningVelocityFounderScore,
      ),
      learningConversionLeader: pickLeader(
        learningSummary.highestLearningConversionFounderOrigin,
        learningSummary.highestLearningConversionFounderScore,
      ),
      learningMomentumLeader: pickLeader(
        learningSummary.highestLearningMomentumFounderOrigin,
        learningSummary.highestLearningMomentumFounderScore,
      ),
      replicationLearningMomentumLeader: pickLeader(
        learningSummary.highestReplicationLearningMomentumFounderOrigin,
        learningSummary.highestReplicationLearningMomentumFounderScore,
      ),
      recoveryLearningMomentumLeader: pickLeader(
        learningSummary.highestRecoveryLearningMomentumFounderOrigin,
        learningSummary.highestRecoveryLearningMomentumFounderScore,
      ),
      inheritanceLeader: pickLeader(
        learningSummary.highestLearningInheritanceFounderOrigin,
        learningSummary.highestLearningInheritanceFounderScore,
      ),
      multigenerationLeader: pickLeader(
        vitalitySummary.highestMultigenerationFounderOrigin,
        vitalitySummary.highestMultigenerationFounderScore,
      ),
      childDegradationLeader: pickLeader(
        vitalitySummary.highestChildDegradationFounderOrigin,
        vitalitySummary.highestChildDegradationFounderScore,
      ),
      superpowerDurabilityLeader: pickLeader(
        vitalitySummary.highestSuperpowerDurabilityFounderOrigin,
        vitalitySummary.highestSuperpowerDurabilityFounderScore,
      ),
      longTermDegradationLeader: pickLeader(
        vitalitySummary.highestLongTermDegradationFounderOrigin,
        vitalitySummary.highestLongTermDegradationFounderScore,
      ),
      longTermRecoveryLeader: pickLeader(
        vitalitySummary.highestLongTermRecoveryFounderOrigin,
        vitalitySummary.highestLongTermRecoveryFounderScore,
      ),
      climateReplicationLeader: pickLeader(
        vitalitySummary.highestClimateReplicationFounderOrigin,
        vitalitySummary.highestClimateReplicationFounderScore,
      ),
      survivalReplicationLeader: pickLeader(
        vitalitySummary.highestSurvivalReplicationFounderOrigin,
        vitalitySummary.highestSurvivalReplicationFounderScore,
      ),
      terminalMortalityLeader: pickLeader(
        vitalitySummary.highestTerminalMortalityFounderOrigin,
        vitalitySummary.highestTerminalMortalityFounderScore,
      ),
      survivalClosureLeader: pickLeader(
        vitalitySummary.highestSurvivalClosureFounderOrigin,
        vitalitySummary.highestSurvivalClosureFounderScore,
      ),
      recoveryChainLeader: pickLeader(
        vitalitySummary.highestRecoveryChainFounderOrigin,
        vitalitySummary.highestRecoveryChainFounderScore,
      ),
      qualificationExplanations: {
        replicationLeader:
          replicationQualificationEntry == null
            ? null
            : {
                founder: replicationQualificationEntry.founderOrigin,
                replicationQualificationScore: Number(
                  replicationQualificationEntry.replicationQualificationScore ?? 0,
                ),
                learningMomentumScore: Number(
                  replicationQualificationEntry.learningMomentumScore ?? 0,
                ),
                replicationLearningMomentumScore: Number(
                  replicationQualificationEntry.replicationLearningMomentumScore ?? 0,
                ),
                learningInheritanceScore: Number(
                  replicationQualificationEntry.learningInheritanceScore ?? 0,
                ),
                replicationValueScore: Number(
                  replicationQualificationEntry.replicationValueScore ?? 0,
                ),
                multiGenerationEffectiveScore: Number(
                  replicationQualificationEntry.multiGenerationEffectiveScore ?? 0,
                ),
                nicheBalanceScore: Number(
                  replicationQualificationEntry.nicheBalanceScore ?? 0,
                ),
                nicheDistinctivenessScore: Number(
                  replicationQualificationEntry.nicheDistinctivenessScore ?? 0,
                ),
                nicheResilienceScore: Number(
                  replicationQualificationEntry.nicheResilienceScore ?? 0,
                ),
                nicheIrreplaceabilityScore: Number(
                  replicationQualificationEntry.nicheIrreplaceabilityScore ?? 0,
                ),
                longTermDegradationScore: Number(
                  replicationQualificationEntry.longTermDegradationScore ?? 0,
                ),
                childDegradationScore: Number(
                  replicationQualificationEntry.childDegradationScore ?? 0,
                ),
                superpowerChildDurabilityPenaltyScore: Number(
                  replicationQualificationEntry.superpowerChildDurabilityPenaltyScore ?? 0,
                ),
                mortalityDebtScore: Number(
                  replicationQualificationEntry.mortalityDebtScore ?? 0,
                ),
              },
        recoveryLeader:
          recoveryQualificationEntry == null
            ? null
            : {
                founder: recoveryQualificationEntry.founderOrigin,
                recoveryQualificationScore: Number(
                  recoveryQualificationEntry.recoveryQualificationScore ?? 0,
                ),
                learningMomentumScore: Number(
                  recoveryQualificationEntry.learningMomentumScore ?? 0,
                ),
                recoveryLearningMomentumScore: Number(
                  recoveryQualificationEntry.recoveryLearningMomentumScore ?? 0,
                ),
                stableRecoveryScore: Number(
                  recoveryQualificationEntry.stableRecoveryScore ?? 0,
                ),
                durableRecoveryScore: Number(
                  recoveryQualificationEntry.durableRecoveryScore ?? 0,
                ),
                recoveryChainScore: Number(
                  recoveryQualificationEntry.recoveryChainScore ?? 0,
                ),
                survivalClosureScore: Number(
                  recoveryQualificationEntry.survivalClosureScore ?? 0,
                ),
                longTermRecoveryScore: Number(
                  recoveryQualificationEntry.longTermRecoveryScore ?? 0,
                ),
                longTermDegradationScore: Number(
                  recoveryQualificationEntry.longTermDegradationScore ?? 0,
                ),
                transientRecoveryRate: Number(
                  recoveryQualificationEntry.transientRecoveryRate ?? 0,
                ),
                stableRecoveryRate: Number(
                  recoveryQualificationEntry.stableRecoveryRate ?? 0,
                ),
                durableRecoveryRate: Number(
                  recoveryQualificationEntry.durableRecoveryRate ?? 0,
                ),
                nicheBalanceScore: Number(
                  recoveryQualificationEntry.nicheBalanceScore ?? 0,
                ),
                nicheDistinctivenessScore: Number(
                  recoveryQualificationEntry.nicheDistinctivenessScore ?? 0,
                ),
                nicheResilienceScore: Number(
                  recoveryQualificationEntry.nicheResilienceScore ?? 0,
                ),
                nicheIrreplaceabilityScore: Number(
                  recoveryQualificationEntry.nicheIrreplaceabilityScore ?? 0,
                ),
              },
        nicheBalanceLeader:
          nicheBalanceEntry == null
            ? null
            : {
                founder: nicheBalanceEntry.founderOrigin,
                nicheBalanceScore: Number(nicheBalanceEntry.nicheBalanceScore ?? 0),
                nicheStrengthScore: Number(nicheBalanceEntry.nicheStrengthScore ?? 0),
                nicheDistinctivenessScore: Number(
                  nicheBalanceEntry.nicheDistinctivenessScore ?? 0,
                ),
                nicheResilienceScore: Number(
                  nicheBalanceEntry.nicheResilienceScore ?? 0,
                ),
                nicheIrreplaceabilityScore: Number(
                  nicheBalanceEntry.nicheIrreplaceabilityScore ?? 0,
                ),
                roleLeadershipBonus: Number(nicheBalanceEntry.roleLeadershipBonus ?? 0),
                scarcityAlignmentBonus: Number(
                  nicheBalanceEntry.scarcityAlignmentBonus ?? 0,
                ),
                dominancePenaltyApplied: Number(
                  nicheBalanceEntry.dominancePenaltyApplied ?? 0,
                ),
                underrepresentedBoost: Number(nicheBalanceEntry.underrepresentedBoost ?? 0),
                dominancePressure: Number(nicheBalanceEntry.dominancePressure ?? 0),
              },
      },
      recoveryStageMap:
        vitalitySummary.recoveryStageMap?.stages?.map((entry) => ({
          stage: entry.stage,
          founder: entry.founderOrigin,
          score: Number(entry.score ?? 0),
          runnerUpFounder: entry.runnerUpFounderOrigin ?? null,
          runnerUpScore: Number(entry.runnerUpScore ?? 0),
          basis: entry.basis,
          lineageCount: Number(entry.lineageCount ?? 0),
          leaderExplanation:
            entry.leaderExplanation == null
              ? null
              : {
                  components: (entry.leaderExplanation.components ?? []).map((component) => ({
                    key: component.key,
                    score: Number(component.score ?? 0),
                  })),
                },
          runnerUpExplanation:
            entry.runnerUpExplanation == null
              ? null
              : {
                  components: (entry.runnerUpExplanation.components ?? []).map((component) => ({
                    key: component.key,
                    score: Number(component.score ?? 0),
                  })),
                },
        })) ?? [],
      recoveryQueue:
        (detailed.recoveryQueueReport ?? []).map((entry) => {
          const stageExplanation =
            vitalitySummary.recoveryStageMap?.stages?.find(
              (stage) => stage.stage === entry.recoveryStage,
            ) ?? null;
          return {
            label: entry.label ?? null,
            founder: entry.founderOrigin ?? null,
            ecologyState: entry.ecologyState ?? null,
            recoveryPhase: entry.recoveryPhase ?? null,
            recoveryStage: entry.recoveryStage ?? null,
            recoveryBasis: entry.recoveryBasis ?? null,
            priority: Number(entry.priority ?? 0),
            recoveryQualificationBias: Number(entry.recoveryQualificationBias ?? 0),
            durableRecoveryBias: Number(entry.durableRecoveryBias ?? 0),
            recoveryStageResponsibilityBias: Number(entry.recoveryStageResponsibilityBias ?? 0),
            recoveryStageResponsibilityRole: entry.recoveryStageResponsibilityRole ?? null,
            mortalityBackslidePenalty: Number(entry.mortalityBackslidePenalty ?? 0),
            superpowerSustainPenalty: Number(entry.superpowerSustainPenalty ?? 0),
            stageLeaderFounder: entry.stageLeaderFounderOrigin ?? null,
            stageRunnerUpFounder: entry.stageRunnerUpFounderOrigin ?? null,
            stageExplanation:
              stageExplanation == null
                ? null
                : {
                    basis: stageExplanation.basis,
                    leaderExplanation:
                      stageExplanation.leaderExplanation == null
                        ? null
                        : {
                            components: (stageExplanation.leaderExplanation.components ?? []).map(
                              (component) => ({
                                key: component.key,
                                score: Number(component.score ?? 0),
                              }),
                            ),
                          },
                    runnerUpExplanation:
                      stageExplanation.runnerUpExplanation == null
                        ? null
                        : {
                            components: (
                              stageExplanation.runnerUpExplanation.components ?? []
                            ).map((component) => ({
                              key: component.key,
                              score: Number(component.score ?? 0),
                            })),
                          },
                  },
          };
        }) ?? [],
    },
    replication: {
      childYieldLeader: vitalitySummary.childYieldLeader ?? null,
      specialtyChildYieldEfficiency: vitalitySummary.specialtyChildYieldEfficiency ?? 0,
      superpowerChildYieldEfficiency: vitalitySummary.superpowerChildYieldEfficiency ?? 0,
      climateChildYieldLeader: vitalitySummary.climateChildYieldLeader ?? null,
      survivalChildYieldLeader: vitalitySummary.survivalChildYieldLeader ?? null,
      replicationTempoLeader: pickLeader(
        vitalitySummary.highestReplicationTempoFounderOrigin,
        vitalitySummary.highestReplicationTempoFounderScore,
      ),
      deepestGenerationDepth: vitalitySummary.deepestGenerationDepth ?? 0,
      secondGenerationChildCount: vitalitySummary.secondGenerationChildCount ?? 0,
      thirdGenerationChildCount: vitalitySummary.thirdGenerationChildCount ?? 0,
    },
    userIntent: {
      highestIntentFounderOrigin: userIntentSummary.highestIntentFounderOrigin ?? null,
      highestLongTermIntentFounderOrigin:
        userIntentSummary.highestLongTermIntentFounderOrigin ?? null,
      strongestTopicCluster: userIntentSummary.strongestTopicCluster ?? null,
      strongestTopicSignalScore: userIntentSummary.strongestTopicSignalScore ?? 0,
      timeWeightedHistorySignalScore: userIntentSummary.timeWeightedHistorySignalScore ?? 0,
      workProfileSignalScore: userIntentSummary.workProfileSignalScore ?? 0,
      interestProfileSignalScore: userIntentSummary.interestProfileSignalScore ?? 0,
    },
    learning: {
      trajectoryRewardLeaderOrigin: learningSummary.trajectoryRewardLeaderOrigin ?? null,
      trajectoryRewardLeaderScore: learningSummary.trajectoryRewardLeaderScore ?? 0,
      metaClawTargetFounderOrigin: learningSummary.metaClawTargetFounderOrigin ?? null,
      metaClawSecondaryFounderOrigin:
        summary?.metaClawSummary?.lastSecondaryFounderOrigin ?? null,
      metaClawOptimizationActive: learningSummary.metaClawOptimizationActive ?? false,
      learningMomentumLeaderOrigin:
        learningSummary.highestLearningMomentumFounderOrigin ?? null,
      learningMomentumLeaderScore:
        learningSummary.highestLearningMomentumFounderScore ?? 0,
      replicationLearningMomentumLeaderOrigin:
        learningSummary.highestReplicationLearningMomentumFounderOrigin ?? null,
      replicationLearningMomentumLeaderScore:
        learningSummary.highestReplicationLearningMomentumFounderScore ?? 0,
      recoveryLearningMomentumLeaderOrigin:
        learningSummary.highestRecoveryLearningMomentumFounderOrigin ?? null,
      recoveryLearningMomentumLeaderScore:
        learningSummary.highestRecoveryLearningMomentumFounderScore ?? 0,
    },
    artifacts: {
      stdoutLog: result.stdoutLog ?? null,
      stderrLog: result.stderrLog ?? null,
    },
  };
}

const targetPath = process.argv[2];

if (!targetPath) {
  console.error("[genesis-verify] missing smoke result path");
  process.exit(1);
}

if (!fs.existsSync(targetPath)) {
  console.error(`[genesis-verify] smoke result not found: ${targetPath}`);
  process.exit(1);
}

const report = buildVerifyReport(targetPath);
console.log(JSON.stringify(report, null, 2));
