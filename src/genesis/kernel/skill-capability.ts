import path from "node:path";
import { buildWorkspaceSkillStatus } from "../../agents/skills-status.js";
import { loadConfig } from "../../config/config.js";
import type { GenesisSkillCapabilitySummary } from "./state.js";

const FOUNDERS = ["scout", "builder", "creator", "auditor", "negotiator"] as const;
type FounderOrigin = (typeof FOUNDERS)[number];

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveWorkspaceDir(): string {
  return process.cwd();
}

function inferFounderSkillAffinity(params: {
  name: string;
  description: string;
}): Record<FounderOrigin, number> {
  const text = `${normalizeText(params.name)} ${normalizeText(params.description)}`;
  const base: Record<FounderOrigin, number> = {
    scout: 0,
    builder: 0,
    creator: 0,
    auditor: 0,
    negotiator: 0,
  };

  if (/search|research|scrape|browser|crawl|rss|intel|signal|fetch|web/.test(text)) {
    base.scout += 3;
  }
  if (/skill|tool|workflow|automation|executor|deploy|build|sandbox|code/.test(text)) {
    base.builder += 3;
  }
  if (/publish|content|image|video|social|copy|creative|narrative|draft/.test(text)) {
    base.creator += 3;
  }
  if (/audit|security|risk|lint|check|verify|monitor|vulnerability/.test(text)) {
    base.auditor += 3;
  }
  if (/channel|message|email|telegram|slack|discord|qq|coordination|communication/.test(text)) {
    base.negotiator += 3;
  }

  if (Object.values(base).every((score) => score === 0)) {
    base.builder = 1;
  }
  return base;
}

function hasCapability(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function readGenesisSkillCapabilitySummarySync(
  env: NodeJS.ProcessEnv = process.env,
): GenesisSkillCapabilitySummary {
  const workspaceDir = resolveWorkspaceDir();
  const config = loadConfig();
  const report = buildWorkspaceSkillStatus(workspaceDir, { config });
  const founderScores = new Map<
    FounderOrigin,
    { readyScore: number; gapScore: number; readySkillCount: number; degradedSkillCount: number; installableSkillCount: number }
  >(
    FOUNDERS.map((founder) => [
      founder,
      { readyScore: 0, gapScore: 0, readySkillCount: 0, degradedSkillCount: 0, installableSkillCount: 0 },
    ]),
  );

  let publishCapableSkillCount = 0;
  let researchCapableSkillCount = 0;
  let automationCapableSkillCount = 0;

  for (const skill of report.skills) {
    const text = `${normalizeText(skill.name)} ${normalizeText(skill.description)} ${normalizeText(skill.skillKey)}`;
    if (hasCapability(text, [/publish|social|video|image|content|post|message|qq|telegram|discord|slack/])) {
      publishCapableSkillCount += 1;
    }
    if (hasCapability(text, [/search|research|scrape|browser|crawl|rss|fetch|intel|signal|web/])) {
      researchCapableSkillCount += 1;
    }
    if (hasCapability(text, [/tool|workflow|automation|executor|sandbox|build|deploy|code/])) {
      automationCapableSkillCount += 1;
    }

    const affinity = inferFounderSkillAffinity({
      name: skill.name,
      description: skill.description,
    });
    for (const founder of FOUNDERS) {
      const bucket = founderScores.get(founder)!;
      const weight = affinity[founder];
      if (skill.eligible) {
        bucket.readyScore += weight;
        bucket.readySkillCount += weight > 0 ? 1 : 0;
      } else if (!skill.disabled && !skill.blockedByAllowlist) {
        bucket.gapScore += weight;
        bucket.degradedSkillCount += weight > 0 ? 1 : 0;
        if (skill.install.length > 0) {
          bucket.installableSkillCount += weight > 0 ? 1 : 0;
        }
      }
    }
  }

  const founderSkillLeaders = FOUNDERS.map((founder) => ({
    founderOrigin: founder,
    ...founderScores.get(founder)!,
  })).sort(
    (left, right) =>
      right.readyScore - left.readyScore ||
      right.gapScore - left.gapScore ||
      left.founderOrigin.localeCompare(right.founderOrigin),
  );

  const readyLeader = [...founderSkillLeaders].sort(
    (left, right) => right.readyScore - left.readyScore || left.founderOrigin.localeCompare(right.founderOrigin),
  )[0];
  const gapLeader = [...founderSkillLeaders].sort(
    (left, right) => right.gapScore - left.gapScore || left.founderOrigin.localeCompare(right.founderOrigin),
  )[0];

  const degradedSkills = report.skills.filter(
    (skill) => !skill.eligible && !skill.disabled && !skill.blockedByAllowlist,
  );

  return {
    workspaceDir: path.resolve(report.workspaceDir),
    totalSkillCount: report.skills.length,
    readySkillCount: report.skills.filter((skill) => skill.eligible).length,
    degradedSkillCount: degradedSkills.length,
    blockedSkillCount: report.skills.filter((skill) => skill.disabled || skill.blockedByAllowlist).length,
    installableSkillCount: degradedSkills.filter((skill) => skill.install.length > 0).length,
    alwaysOnSkillCount: report.skills.filter((skill) => skill.always).length,
    publishCapableSkillCount,
    researchCapableSkillCount,
    automationCapableSkillCount,
    highestSkillCapabilityFounderOrigin: readyLeader?.readyScore ? readyLeader.founderOrigin : null,
    highestSkillGapFounderOrigin: gapLeader?.gapScore ? gapLeader.founderOrigin : null,
    readySkillNames: report.skills.filter((skill) => skill.eligible).slice(0, 8).map((skill) => skill.name),
    degradedSkillNames: degradedSkills.slice(0, 8).map((skill) => skill.name),
    installableSkillNames: degradedSkills
      .filter((skill) => skill.install.length > 0)
      .slice(0, 8)
      .map((skill) => skill.name),
    founderSkillLeaders,
  };
}
