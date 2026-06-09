import { loadConfig, resolveProjectConfig, getEnabledProjects } from "../core/config";
import { openMemDb, queryObservations, epochToIsoString } from "../core/mem-db";
import { matchesFilter } from "../core/filter";
import { logger } from "../core/logger";
import type { Observation } from "../types/observation";
import type { ParsedArgs } from "../cli";

export default async function run(args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  const projectNames = resolveProjectNames(args, config);

  if (projectNames.length === 0) {
    logger.warn("No enabled projects found. Nothing to preview.");
    return;
  }

  for (const projectName of projectNames) {
    try {
      previewProject(projectName, config);
    } catch (err) {
      logger.error(`Preview failed for project "${projectName}"`, {
        error: String(err),
      });
    }
  }
}

function resolveProjectNames(
  args: ParsedArgs,
  config: ReturnType<typeof loadConfig>,
): string[] {
  if (args.project) {
    return [args.project];
  }
  return getEnabledProjects(config);
}

function previewProject(
  projectName: string,
  config: ReturnType<typeof loadConfig>,
): void {
  const resolved = resolveProjectConfig(config, projectName);

  // Open claude-mem DB read-only
  const memDb = openMemDb(config.global.claudeMemDbPath);

  try {
    // Query and filter observations
    const allObs = queryObservations(memDb, resolved.memProject);
    const filtered = allObs.filter((obs) => matchesFilter(obs, resolved.export));

    printPreview(projectName, resolved.export, filtered);
  } finally {
    memDb.close();
  }
}

function printPreview(
  projectName: string,
  filters: { types: string[]; keywords: string[]; tags: string[] },
  observations: Observation[],
): void {
  console.log(`\nProject: ${projectName}`);
  console.log(
    `Filters: types=[${filters.types.join(", ")}] keywords=[${filters.keywords.join(", ")}] tags=[${filters.tags.join(", ")}]`,
  );
  console.log(`Matched: ${observations.length} observations\n`);

  const maxDisplay = 20;
  const displayed = observations.slice(0, maxDisplay);

  for (const obs of displayed) {
    const date = epochToIsoString(obs.created_at_epoch).slice(0, 10);
    console.log(`  #${obs.id} [${obs.type}] ${date} "${obs.title}"`);
  }

  if (observations.length > maxDisplay) {
    console.log(`  ... (${observations.length - maxDisplay} more)`);
  }

  const sizeBytes = new TextEncoder().encode(JSON.stringify(observations)).length;
  const sizeKb = (sizeBytes / 1024).toFixed(1);
  console.log(`\nTotal export size: ~${sizeKb} KB`);
}
