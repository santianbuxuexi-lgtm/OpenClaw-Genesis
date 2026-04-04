import type { GenesisSocietySummary } from "./state.js";

export function buildGenesisAutonomyHeartbeatSummary(
  summary: GenesisSocietySummary | null | undefined,
): string {
  const userIntent = summary?.userIntentSummary;
  const loginPool = summary?.loginStatePoolSummary;
  const skillSummary = summary?.skillCapabilitySummary;
  const proactive = summary?.proactiveWorkSummary;
  const opencli = summary?.openCliCapabilitySummary;

  const intentKeywords = (userIntent?.recentKeywords ?? [])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);
  const strongestCluster = userIntent?.strongestTopicCluster?.trim();
  const dominantHistoryKind = userIntent?.dominantHistoryKind?.trim();
  const focusDescriptor =
    intentKeywords.length > 0
      ? intentKeywords.join(" ")
      : strongestCluster ||
        (userIntent?.profileVisible
          ? "ongoing work profile, preferences, and explicit interests"
          : "ongoing user work, preferences, and attention priorities");

  const readyPlatforms = (loginPool?.platformLeaders ?? [])
    .filter((entry) => entry.readyCount > 0)
    .map((entry) => entry.platform)
    .slice(0, 3);

  const degradedSkills = (skillSummary?.degradedSkillNames ?? []).slice(0, 3);
  const inProgressWork = (proactive?.recentEntries ?? [])
    .filter((entry) => entry.status === "in_progress")
    .map((entry) => `${entry.founderOrigin}:${entry.workType}`)
    .slice(0, 4);
  const hotspotDescriptor = opencli?.latestScoutTitle?.trim()
    ? `promote hotspot "${opencli.latestScoutTitle.trim()}"`
    : opencli?.latestScoutSource
      ? `continue hotspot scouting from ${opencli.latestScoutSource}`
      : null;

  const segments = [
    `Re-evaluate proactive work around ${focusDescriptor}`,
    dominantHistoryKind ? `follow dominant ${dominantHistoryKind} behavior` : "no dominant history kind yet",
    strongestCluster ? `prioritize cluster ${strongestCluster}` : "no strong topic cluster yet",
    hotspotDescriptor ?? "no strong live hotspot yet",
    readyPlatforms.length > 0
      ? `prefer ready platforms ${readyPlatforms.join(", ")}`
      : "no ready publish platforms yet",
    degradedSkills.length > 0
      ? `close skill gaps ${degradedSkills.join(", ")}`
      : "skill coverage currently usable",
    inProgressWork.length > 0
      ? `continue active lanes ${inProgressWork.join(", ")}`
      : "resume scouting, drafting, audit, and coordination as needed",
  ];

  return segments.join("; ");
}

export function shouldRunGenesisAutonomyHeartbeat(params: {
  now: number;
  lastTickAt?: number;
  minIntervalMs: number;
}): boolean {
  const minIntervalMs = Math.max(0, params.minIntervalMs || 0);
  if (!params.lastTickAt) {
    return true;
  }
  return params.now - params.lastTickAt >= minIntervalMs;
}
