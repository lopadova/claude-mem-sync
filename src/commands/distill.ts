import { loadConfig, getEnabledProjects } from "../core/config";
import { logger } from "../core/logger";
import {
  loadMergedForDistillation,
  callDistillationAPI,
  writeDistillationOutput,
  countUniqueDevs,
} from "../core/distiller";
import { estimateTokens } from "../core/prompts/distillation-system";
import type { ParsedArgs } from "../cli";

export default async function run(args: ParsedArgs): Promise<void> {
  const config = loadConfig();

  if (!config.global.distillation.enabled) {
    console.log("Distillation is disabled. Enable with: distillation.enabled = true in config.");
    return;
  }

  if (!config.global.distillation.allowExternalApi) {
    console.log(
      "External API calls are disabled. Set distillation.allowExternalApi = true to allow sending data to the Anthropic API.",
    );
    return;
  }

  const projectNames = resolveProjectNames(args, config);
  if (projectNames.length === 0) {
    logger.warn("No enabled projects found.");
    return;
  }

  // Get API key from args, env, or fail
  const apiKey = extractFlag(args.rest, "--api-key") ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !args.dryRun) {
    console.error("No API key provided. Use --api-key KEY or set ANTHROPIC_API_KEY env var.");
    process.exit(1);
  }

  const mergedDir = args.outputDir ?? "merged";
  const contributionsDir = args.contributionsDir ?? "contributions";
  const distilledDir = "distilled";

  for (const project of projectNames) {
    try {
      await distillProject(project, mergedDir, contributionsDir, distilledDir, config.global.distillation, apiKey ?? "", args.dryRun);
    } catch (err) {
      logger.error(`Distillation failed for "${project}"`, { error: String(err) });
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function distillProject(
  project: string,
  mergedDir: string,
  contributionsDir: string,
  distilledDir: string,
  distillConfig: ReturnType<typeof loadConfig>["global"]["distillation"],
  apiKey: string,
  dryRun: boolean,
): Promise<void> {
  const observations = loadMergedForDistillation(mergedDir, project);

  if (observations.length === 0) {
    logger.info(`No merged observations for "${project}". Skipping.`);
    return;
  }

  if (observations.length < distillConfig.minObservations) {
    logger.info(
      `Project "${project}": ${observations.length} observations below minimum (${distillConfig.minObservations}). Skipping.`,
    );
    return;
  }

  // Filter excluded types
  const filtered = distillConfig.excludeTypes.length > 0
    ? observations.filter((obs) => !distillConfig.excludeTypes.includes(obs.type))
    : observations;

  const estimatedTokens = estimateTokens(filtered);
  const uniqueDevs = countUniqueDevs(contributionsDir, project);

  console.log(`\nProject: ${project}`);
  console.log(`  Observations: ${filtered.length} (of ${observations.length} total)`);
  console.log(`  Unique devs: ${uniqueDevs}`);
  console.log(`  Estimated tokens: ~${estimatedTokens.toLocaleString()}`);
  console.log(`  Model: ${distillConfig.model}`);

  if (dryRun) {
    console.log("\n  [DRY RUN] Would send to Anthropic API for distillation.");
    console.log(`  Estimated cost: ~$${((estimatedTokens * 3 + 8192 * 15) / 1_000_000).toFixed(4)}`);
    return;
  }

  console.log("  Calling API...");

  const result = await callDistillationAPI(
    filtered,
    project,
    distillConfig,
    apiKey,
    contributionsDir,
  );

  writeDistillationOutput(distilledDir, project, result);

  console.log(`  Rules generated: ${result.rules.length}`);
  console.log(`  Knowledge sections: ${result.knowledgeSections.length}`);
  console.log(`  Avg confidence: ${(result.report.outputStats.avgConfidence * 100).toFixed(1)}%`);
  console.log(`  Token usage: ${result.report.tokenUsage.totalTokens.toLocaleString()}`);
  console.log(`  Cost: $${result.report.tokenUsage.estimatedCost.toFixed(4)}`);
  console.log(`  Output: distilled/${project}/`);
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
