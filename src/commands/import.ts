import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { sha256 } from "../core/compat";
import { loadConfig, resolveProjectConfig, getEnabledProjects } from "../core/config";
import { openMemDbWritable, checkDuplicate, insertObservation, rebuildFts, runIntegrityCheck } from "../core/mem-db";
import { openAccessDb, isFileImported, logImport } from "../core/access-db";
import { shallowClone } from "../core/git";
import { EXPORT_JSON_VERSION } from "../core/constants";
import { logger } from "../core/logger";
import type { ExportFile } from "../types/observation";
import type { ParsedArgs } from "../cli";

export default async function run(args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  const projectNames = resolveProjectNames(args, config);

  if (projectNames.length === 0) {
    logger.warn("No enabled projects found. Nothing to import.");
    return;
  }

  const accessDb = openAccessDb();

  for (const projectName of projectNames) {
    try {
      await importProject(projectName, config, accessDb);
    } catch (err) {
      logger.error(`Import failed for project "${projectName}"`, {
        error: String(err),
      });
    }
  }

  accessDb.close();
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

async function importProject(
  projectName: string,
  config: ReturnType<typeof loadConfig>,
  accessDb: ReturnType<typeof openAccessDb>,
): Promise<void> {
  const resolved = resolveProjectConfig(config, projectName);

  logger.info(`Importing project "${projectName}"`, {
    memProject: resolved.memProject,
    remote: resolved.remote,
  });

  // Clone/pull remote repo
  const repoDir = await shallowClone(resolved.remote);

  // Read merged file
  const mergedPath = join(repoDir, "merged", projectName, "latest.json");

  if (!existsSync(mergedPath)) {
    logger.info(`No merged file found for "${projectName}" at merged/${projectName}/latest.json. Skipping.`);
    console.log(`Project "${projectName}": no merged file found. Skipping.`);
    return;
  }

  const fileContent = readFileSync(mergedPath, "utf-8");

  // Compute SHA-256 hash using Node.js crypto (works in both Bun and Node)
  const fileHash = sha256(fileContent);

  // Check if already imported
  if (isFileImported(accessDb, projectName, fileHash)) {
    logger.info(`Project "${projectName}" is up to date (file hash ${fileHash} already imported).`);
    console.log(`Project "${projectName}": already up to date.`);
    return;
  }

  // Parse JSON and validate version
  let exportFile: ExportFile;
  try {
    exportFile = JSON.parse(fileContent) as ExportFile;
  } catch (err) {
    logger.error(`Failed to parse merged file for "${projectName}"`, {
      error: String(err),
    });
    return;
  }

  if (exportFile.version > EXPORT_JSON_VERSION) {
    logger.warn(
      `Merged file for "${projectName}" has version ${exportFile.version}, ` +
        `but this tool only supports version ${EXPORT_JSON_VERSION}. ` +
        `Please update claude-mem-sync. Skipping this project.`,
    );
    console.log(
      `Project "${projectName}": file version ${exportFile.version} is newer than supported ` +
        `(${EXPORT_JSON_VERSION}). Please update claude-mem-sync.`,
    );
    return;
  }

  // Open claude-mem DB writable
  const memDb = openMemDbWritable(config.global.claudeMemDbPath);

  let newCount = 0;
  let skippedCount = 0;

  try {
    // Import in a transaction
    const importTransaction = memDb.transaction(() => {
      for (const obs of exportFile.observations) {
        const isDuplicate = checkDuplicate(
          memDb,
          obs.memory_session_id,
          obs.title,
          obs.created_at_epoch,
        );

        if (isDuplicate) {
          skippedCount++;
        } else {
          insertObservation(memDb, obs, resolved.memProject);
          newCount++;
        }
      }
    });

    importTransaction();

    // Post-transaction maintenance
    if (newCount > 0) {
      rebuildFts(memDb);
    }

    const integrityResult = runIntegrityCheck(memDb);
    if (integrityResult !== "ok") {
      logger.warn(`Integrity check returned "${integrityResult}" after import for "${projectName}"`);
    }
  } finally {
    memDb.close();
  }

  // Log to import_log
  logImport(accessDb, projectName, fileHash, newCount, exportFile.exportedBy);

  const summary = `Imported ${newCount} new observations (${skippedCount} skipped as duplicates)`;
  logger.info(summary, { project: projectName });
  console.log(`Project "${projectName}": ${summary}`);
}
