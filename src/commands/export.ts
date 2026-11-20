import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { loadConfig, resolveProjectConfig, getEnabledProjects } from "../core/config";
import { openMemDb, queryObservations, epochToIsoString } from "../core/mem-db";
import { openAccessDb, logExport } from "../core/access-db";
import { matchesFilter } from "../core/filter";
import { newSinceLastExport } from "../core/export-delta";
import {
  shallowClone,
  gitAdd,
  gitCommit,
  gitPush,
  gitCheckoutNewBranch,
  gitPushUpstream,
  createPullRequest,
  checkProviderCli,
  getProviderCliInfo,
} from "../core/git";
import { EXPORT_JSON_VERSION, PACKAGE_VERSION } from "../core/constants";
import { logger } from "../core/logger";
import type { Observation, ExportFile } from "../types/observation";
import type { ParsedArgs } from "../cli";

type Config = ReturnType<typeof loadConfig>;

interface Exported {
  projectName: string;
  count: number;
  relativePath: string;
}

export default async function run(args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  const projectNames = args.project ? [args.project] : getEnabledProjects(config);

  if (projectNames.length === 0) {
    logger.warn("No enabled projects found. Nothing to export.");
    return;
  }

  // Group projects by store repo so each store is cloned and pushed once.
  const stores = new Map<string, string[]>();
  for (const name of projectNames) {
    try {
      const r = resolveProjectConfig(config, name).remote;
      const key = JSON.stringify(r); // any remote difference (host, branch, protocol, ...) means a separate store
      stores.set(key, [...(stores.get(key) ?? []), name]);
    } catch (err) {
      logger.error(`Export failed for project "${name}"`, { error: String(err) });
    }
  }

  const accessDb = openAccessDb();
  try {
    for (const names of stores.values()) {
      try {
        await exportStore(names, config, accessDb, args.dryRun ?? false);
      } catch (err) {
        logger.error(`Export failed for store of ${names.join(", ")}`, { error: String(err) });
      }
    }
  } finally {
    accessDb.close();
  }
}

/** Query claude-mem and apply the project's export filters. */
function loadFiltered(projectName: string, config: Config) {
  const resolved = resolveProjectConfig(config, projectName);
  logger.info(`Exporting project "${projectName}"`, {
    memProject: resolved.memProject,
    filters: resolved.export,
  });

  const memDb = openMemDb(config.global.claudeMemDbPath);
  try {
    const allObs = queryObservations(memDb, resolved.memProject);
    const filtered = allObs.filter((obs) => matchesFilter(obs, resolved.export));
    logger.info(`Matched ${filtered.length} of ${allObs.length} observations`, {
      project: projectName,
    });
    return { resolved, filtered };
  } finally {
    memDb.close();
  }
}

/** Export every project that shares one store repo: one clone, one push/PR. */
async function exportStore(
  projectNames: string[],
  config: Config,
  accessDb: ReturnType<typeof openAccessDb>,
  dryRun: boolean,
): Promise<void> {
  const remote = resolveProjectConfig(config, projectNames[0]).remote;

  if (dryRun) {
    for (const name of projectNames) {
      const { resolved, filtered } = loadFiltered(name, config);
      if (filtered.length === 0) {
        logger.info(`No observations match export filters for "${name}". Skipping.`);
        continue;
      }
      printPreview(name, resolved.export, filtered);
    }
    return;
  }

  // Removed in finally so scheduled runs don't leak temp dirs
  const repoDir = await shallowClone(remote);
  try {
    const exported: Exported[] = [];
    for (const name of projectNames) {
      try {
        const e = await stageProject(name, config, repoDir);
        if (e) exported.push(e);
      } catch (err) {
        logger.error(`Export failed for project "${name}"`, { error: String(err) });
      }
    }

    if (exported.length === 0) return;

    const now = new Date();
    const total = exported.reduce((n, e) => n + e.count, 0);
    let pushedTo: string;

    if (remote.autoMerge) {
      await gitPush(repoDir);
      pushedTo = `${remote.repo}@${remote.branch}`;
      logger.info("Pushed directly to remote branch", { pushedTo });
    } else {
      // PR/MR workflow: check provider CLI, create branch, push, open one PR/MR per store
      const cliAvailable = await checkProviderCli(remote.type);
      if (!cliAvailable) {
        const cliInfo = getProviderCliInfo(remote.type);
        throw new Error(
          `${cliInfo.name} is required for PR-based export but was not found. ` +
            `Install it from ${cliInfo.url} or set autoMerge: true.`,
        );
      }

      const dateStr = now.toISOString().slice(0, 10);
      const branchName = `mem-sync/${config.global.devName}/${dateStr}`;

      await gitCheckoutNewBranch(repoDir, branchName);
      await gitPushUpstream(repoDir, branchName);

      pushedTo = await createPullRequest(
        repoDir,
        `mem-sync: ${config.global.devName} export (${exported.length} projects)`,
        [
          `## Memory Export`,
          ``,
          `- **Developer:** ${config.global.devName}`,
          `- **Observations:** ${total}`,
          `- **Exported at:** ${now.toISOString()}`,
          ``,
          ...exported.map((e) => `- ${e.projectName}: ${e.count}`),
          ``,
          `Auto-generated by claude-mem-sync.`,
        ].join("\n"),
        remote,
      );
      logger.info("Created pull request / merge request", { url: pushedTo });
    }

    for (const e of exported) {
      logExport(accessDb, e.projectName, e.count, e.relativePath, pushedTo);
      console.log(`\nExport complete for "${e.projectName}": ${e.count} new observations -> ${pushedTo}`);
    }
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}

/** Write the project's new observations into the clone and commit them (no push). */
async function stageProject(
  projectName: string,
  config: Config,
  repoDir: string,
): Promise<Exported | null> {
  const { resolved, filtered } = loadFiltered(projectName, config);

  if (filtered.length === 0) {
    logger.info(`No observations match export filters for "${projectName}". Skipping.`);
    return null;
  }

  const devDir = join(repoDir, "contributions", projectName, config.global.devName);
  const delta = newSinceLastExport(
    devDir,
    join(repoDir, "merged", projectName, "latest.json"),
    filtered,
  );
  if (delta.length === 0) {
    console.log(`\nNo new observations for "${projectName}". Nothing to push.`);
    return null;
  }

  const now = new Date();
  const exportFile: ExportFile = {
    version: EXPORT_JSON_VERSION,
    exportedBy: config.global.devName,
    exportedAt: now.toISOString(),
    exportedAtEpoch: Math.floor(now.getTime() / 1000),
    project: projectName,
    packageVersion: PACKAGE_VERSION,
    filters: {
      types: resolved.export.types,
      keywords: resolved.export.keywords,
      tags: resolved.export.tags,
    },
    observations: delta,
    observationCount: delta.length,
  };

  const relativePath = join("contributions", projectName, config.global.devName, `${formatTimestamp(now)}.json`);
  mkdirSync(devDir, { recursive: true });
  writeFileSync(join(repoDir, relativePath), JSON.stringify(exportFile, null, 2), "utf-8");
  logger.info(`Wrote export file: ${relativePath}`);

  await gitAdd(repoDir, [relativePath]);
  await gitCommit(
    repoDir,
    `mem-sync: export ${delta.length} observations from ${config.global.devName} (${projectName})`,
  );

  return { projectName, count: delta.length, relativePath };
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
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
