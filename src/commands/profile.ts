import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { loadConfig, getEnabledProjects } from "../core/config";
import { logger } from "../core/logger";
import {
  loadContributions,
  loadMergedObservations,
  generateProfile,
  generateTeamOverview,
  getDevNames,
  renderProfileMarkdown,
} from "../core/profiler";
import type { ParsedArgs } from "../cli";

export default async function run(args: ParsedArgs): Promise<void> {
  const config = loadConfig();

  if (!config.global.profiles.enabled) {
    console.log("Profiles are disabled. Enable with: profiles.enabled = true in config.");
    return;
  }

  const projectNames = resolveProjectNames(args, config);
  if (projectNames.length === 0) {
    logger.warn("No enabled projects found.");
    return;
  }

  // Extract --dev and --format from rest args
  const devFilter = extractFlag(args.rest, "--dev");
  const format = extractFlag(args.rest, "--format") ?? "json";

  // Determine base dirs (default to current working directory)
  const contributionsDir = args.contributionsDir ?? "contributions";
  const mergedDir = args.outputDir ?? "merged";
  const profilesDir = "profiles";

  for (const project of projectNames) {
    try {
      await profileProject(project, contributionsDir, mergedDir, profilesDir, devFilter, format, args.dryRun);
    } catch (err) {
      logger.error(`Profile generation failed for "${project}"`, { error: String(err) });
    }
  }
}

async function profileProject(
  project: string,
  contributionsDir: string,
  mergedDir: string,
  profilesDir: string,
  devFilter: string | null,
  format: string,
  dryRun: boolean,
): Promise<void> {
  const contributions = loadContributions(contributionsDir, project);
  if (contributions.length === 0) {
    logger.info(`No contributions found for project "${project}".`);
    return;
  }

  const mergedObs = loadMergedObservations(mergedDir, project);
  const devNames = devFilter ? [devFilter] : getDevNames(contributions);

  logger.info(`Project "${project}": generating profiles for ${devNames.length} dev(s)`);

  const profiles = [];

  for (const devName of devNames) {
    const profile = generateProfile(devName, project, contributions, mergedObs, contributions);
    profiles.push(profile);

    if (dryRun) {
      console.log(`\n[DRY RUN] Would generate profile for "${devName}" in "${project}"`);
      console.log(`  Observations: ${profile.knowledgeSpectrum.total}`);
      console.log(`  Concepts covered: ${profile.conceptMap.devCoverage}%`);
      console.log(`  Survival rate: ${(profile.survivalRate.rate * 100).toFixed(1)}%`);
      continue;
    }

    const devProfileDir = join(profilesDir, project, devName);
    mkdirSync(devProfileDir, { recursive: true });

    // Write JSON
    const jsonPath = join(devProfileDir, "profile.json");
    writeFileSync(jsonPath, JSON.stringify(profile, null, 2), "utf-8");

    // Write markdown
    if (format === "md" || format === "both") {
      const mdPath = join(devProfileDir, "profile.md");
      writeFileSync(mdPath, renderProfileMarkdown(profile), "utf-8");
    }

    console.log(`  Profile written: ${jsonPath}`);
  }

  if (!dryRun && profiles.length > 1) {
    // Write team overview
    const teamOverview = generateTeamOverview(project, profiles, contributions);
    const teamDir = join(profilesDir, project);
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(
      join(teamDir, "team-overview.json"),
      JSON.stringify(teamOverview, null, 2),
      "utf-8",
    );
    console.log(`  Team overview: ${join(teamDir, "team-overview.json")}`);
  }

  console.log(`\nProfile generation complete for "${project}": ${profiles.length} profile(s).`);
}

function resolveProjectNames(
  args: ParsedArgs,
  config: ReturnType<typeof loadConfig>,
): string[] {
  if (args.project) return [args.project];
  if (args.all) return getEnabledProjects(config);
  return getEnabledProjects(config);
}

function extractFlag(rest: string[], flag: string): string | null {
  const idx = rest.indexOf(flag);
  if (idx === -1 || idx + 1 >= rest.length) return null;
  return rest[idx + 1];
}
