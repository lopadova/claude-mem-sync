import { join, relative } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { sha256 } from "../core/compat";
import { deduplicateObservations, applyEvictionCap } from "../core/merger";
import { logger } from "../core/logger";
import { EXPORT_JSON_VERSION, PACKAGE_VERSION, DEFAULT_MERGE_CAP, DEFAULT_KEEP_TAGS, DEFAULT_CONTRIBUTION_RETENTION_DAYS } from "../core/constants";
import type { Observation, ExportFile } from "../types/observation";
import type { MergeState, ProjectMergeState, ProcessedFile } from "../types/merge-state";
import type { ParsedArgs } from "../cli";

export default async function run(args: ParsedArgs): Promise<void> {
  const contributionsDir = args.contributionsDir ?? "contributions";
  const outputDir = args.outputDir ?? "merged";
  const stateFilePath = args.stateFile ?? ".merge-state.json";
  const cap = args.cap ?? DEFAULT_MERGE_CAP;
  const retentionDays = args.retentionDays ?? DEFAULT_CONTRIBUTION_RETENTION_DAYS;

  if (!existsSync(contributionsDir)) {
    logger.info(`No contributions directory found at "${contributionsDir}". Nothing to merge.`);
    return;
  }

  // Load existing merge state
  let mergeState = loadMergeState(stateFilePath);

  // Discover project directories under contributions/
  const projectDirs = listDirectories(contributionsDir);

  if (projectDirs.length === 0) {
    logger.info("No project directories found under contributions/.");
    return;
  }

  let totalNewFiles = 0;

  for (const projectName of projectDirs) {
    const projectContribDir = join(contributionsDir, projectName);
    const newFiles = discoverNewFiles(projectContribDir, mergeState, projectName);

    if (newFiles.length === 0) {
      logger.info(`Project "${projectName}": no new contribution files.`);
      continue;
    }

    logger.info(`Project "${projectName}": found ${newFiles.length} new contribution file(s).`);

    // Load all new observations and track dev names
    const { observations: newObservations, devExportMap } = loadContributionFiles(newFiles);

    // Load existing merged file (if any)
    const mergedFilePath = join(outputDir, projectName, "latest.json");
    const existingObservations = loadExistingMerged(mergedFilePath);

    // Merge: combine existing + new, then dedup
    const combined = [...existingObservations, ...newObservations];
    const deduped = deduplicateObservations(combined);

    logger.info(
      `Project "${projectName}": ${combined.length} total -> ${deduped.length} after dedup`,
    );

    // Apply eviction cap if needed (passive mode — no access.db in CI)
    let finalObservations: Observation[];

    if (deduped.length > cap) {
      logger.info(
        `Project "${projectName}": ${deduped.length} exceeds cap ${cap}, running eviction.`,
      );

      // Compute diffusion: how many unique devs have each observation
      const { devCounts, totalDevs } = computeDiffusion(deduped, devExportMap, existingObservations);

      const scored = applyEvictionCap({
        observations: deduped,
        cap,
        mode: "passive",
        weights: { typeWeight: 0.4, recencyWeight: 0.3, thirdWeight: 0.3 },
        keepTags: DEFAULT_KEEP_TAGS,
        nowEpoch: Math.floor(Date.now() / 1000),
        devCounts,
        totalDevs,
      });

      finalObservations = scored;

      // Update eviction timestamp
      ensureProjectState(mergeState, projectName, cap).lastEvictionAt = Math.floor(
        Date.now() / 1000,
      );

      logger.info(
        `Project "${projectName}": evicted ${deduped.length - scored.length} observations.`,
      );
    } else {
      finalObservations = deduped;
    }

    // Write merged output
    const mergedOutput: ExportFile = {
      version: EXPORT_JSON_VERSION,
      exportedBy: "ci-merge",
      exportedAt: new Date().toISOString(),
      exportedAtEpoch: Math.floor(Date.now() / 1000),
      project: projectName,
      packageVersion: PACKAGE_VERSION,
      filters: { types: [], keywords: [], tags: [] },
      observations: finalObservations,
      observationCount: finalObservations.length,
    };

    mkdirSync(join(outputDir, projectName), { recursive: true });
    writeFileSync(mergedFilePath, JSON.stringify(mergedOutput, null, 2), "utf-8");

    logger.info(`Wrote ${mergedFilePath} (${finalObservations.length} observations)`);

    // Update merge state with processed files
    const projectState = ensureProjectState(mergeState, projectName, cap);
    const nowEpoch = Math.floor(Date.now() / 1000);

    for (const filePath of newFiles) {
      const content = readFileSync(filePath, "utf-8");
      const hash = computeHash(content);
      const parsed = JSON.parse(content) as ExportFile;
      const relPath = relative(".", filePath);

      projectState.processedFiles[relPath] = {
        hash: `sha256:${hash}`,
        processedAt: nowEpoch,
        observationsCount: parsed.observationCount,
      };
    }

    projectState.totalObservations = finalObservations.length;
    totalNewFiles += newFiles.length;
  }

  // Save merge state
  mergeState.lastMergedAt = Math.floor(Date.now() / 1000);
  writeMergeState(stateFilePath, mergeState);

  // Cleanup old processed contribution files beyond retention period
  const cleanedUp = cleanupOldContributions(mergeState, retentionDays);
  if (cleanedUp.length > 0) {
    logger.info(`Cleaned up ${cleanedUp.length} old contribution file(s) beyond ${retentionDays}-day retention:`);
    for (const filePath of cleanedUp) {
      logger.info(`  deleted: ${filePath}`);
    }
    // Re-save merge state with cleaned-up entries removed
    writeMergeState(stateFilePath, mergeState);
  }

  console.log(
    `\nMerge complete: processed ${totalNewFiles} new contribution file(s) across ${projectDirs.length} project(s).`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadMergeState(path: string): MergeState {
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8")) as MergeState;
  }
  return {
    lastMergedAt: 0,
    schemaVersion: 1,
    projects: {},
  };
}

function writeMergeState(path: string, state: MergeState): void {
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

function ensureProjectState(
  state: MergeState,
  projectName: string,
  cap: number,
): ProjectMergeState {
  if (!state.projects[projectName]) {
    state.projects[projectName] = {
      processedFiles: {},
      totalObservations: 0,
      cap,
      lastEvictionAt: null,
    };
  }
  return state.projects[projectName];
}

function listDirectories(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory();
    });
  } catch {
    return [];
  }
}

/**
 * Discover JSON files under a project's contribution directory that
 * have not yet been processed (not in merge state).
 */
function discoverNewFiles(
  projectContribDir: string,
  mergeState: MergeState,
  projectName: string,
): string[] {
  const processedFiles = mergeState.projects[projectName]?.processedFiles ?? {};
  const processedHashes = new Set(Object.values(processedFiles).map((f) => f.hash));
  const processedPaths = new Set(Object.keys(processedFiles));

  const files: string[] = [];

  // Walk dev directories
  const devDirs = listDirectories(projectContribDir);
  for (const devDir of devDirs) {
    const devPath = join(projectContribDir, devDir);
    try {
      const jsonFiles = readdirSync(devPath).filter((f) => f.endsWith(".json"));
      for (const jsonFile of jsonFiles) {
        const fullPath = join(devPath, jsonFile);
        const relPath = relative(".", fullPath);

        // Skip if path is already processed
        if (processedPaths.has(relPath)) continue;

        // Double-check by hash
        const content = readFileSync(fullPath, "utf-8");
        const hash = `sha256:${computeHash(content)}`;
        if (processedHashes.has(hash)) continue;

        files.push(fullPath);
      }
    } catch {
      // Skip unreadable directories
    }
  }

  return files;
}

interface LoadResult {
  observations: Observation[];
  /** Map: observation dedup key -> set of devNames who exported it */
  devExportMap: Map<string, Set<string>>;
}

function loadContributionFiles(filePaths: string[]): LoadResult {
  const observations: Observation[] = [];
  const devExportMap = new Map<string, Set<string>>();

  for (const filePath of filePaths) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const exportFile = JSON.parse(content) as ExportFile;
      const devName = exportFile.exportedBy;

      for (const obs of exportFile.observations) {
        observations.push(obs);
        const key = `${obs.memory_session_id}|${obs.title}|${obs.created_at_epoch}`;
        if (!devExportMap.has(key)) {
          devExportMap.set(key, new Set());
        }
        devExportMap.get(key)!.add(devName);
      }
    } catch (err) {
      logger.warn(`Failed to read contribution file: ${filePath}`, { error: String(err) });
    }
  }

  return { observations, devExportMap };
}

function loadExistingMerged(mergedFilePath: string): Observation[] {
  if (!existsSync(mergedFilePath)) return [];

  try {
    const content = readFileSync(mergedFilePath, "utf-8");
    const parsed = JSON.parse(content) as ExportFile;
    return parsed.observations;
  } catch {
    return [];
  }
}

/**
 * Compute diffusion weight data: how many unique devs have each observation.
 */
function computeDiffusion(
  deduped: Observation[],
  devExportMap: Map<string, Set<string>>,
  existingObservations: Observation[],
): { devCounts: Map<number, number>; totalDevs: number } {
  // Collect all unique dev names from contribution files
  const allDevs = new Set<string>();
  for (const devSet of devExportMap.values()) {
    for (const dev of devSet) {
      allDevs.add(dev);
    }
  }
  // If there were existing merged observations, count "ci-merge" as having contributed them
  if (existingObservations.length > 0) {
    allDevs.add("__existing__");
  }

  const totalDevs = Math.max(allDevs.size, 1);
  const devCounts = new Map<number, number>();

  for (const obs of deduped) {
    const key = `${obs.memory_session_id}|${obs.title}|${obs.created_at_epoch}`;
    const devSet = devExportMap.get(key);
    let count = devSet ? devSet.size : 0;

    // If the observation existed in the previously merged file, add 1
    const wasExisting = existingObservations.some(
      (e) =>
        e.memory_session_id === obs.memory_session_id &&
        e.title === obs.title &&
        e.created_at_epoch === obs.created_at_epoch,
    );
    if (wasExisting && !devSet) {
      count = 1; // At least one dev previously contributed it
    } else if (wasExisting) {
      count += 1; // existing merged counts as additional source
    }

    devCounts.set(obs.id, Math.min(count, totalDevs));
  }

  return { devCounts, totalDevs };
}

function computeHash(content: string): string {
  return sha256(content);
}

/**
 * Remove processed contribution files older than the retention period.
 * Only deletes files that are tracked in the merge state's processedFiles.
 */
function cleanupOldContributions(mergeState: MergeState, retentionDays: number): string[] {
  const cutoffEpoch = Math.floor(Date.now() / 1000) - retentionDays * 86400;
  const deleted: string[] = [];

  for (const projectName of Object.keys(mergeState.projects)) {
    const projectState = mergeState.projects[projectName];
    const toDelete: string[] = [];

    for (const [relPath, fileInfo] of Object.entries(projectState.processedFiles)) {
      if (fileInfo.processedAt < cutoffEpoch) {
        toDelete.push(relPath);
      }
    }

    for (const relPath of toDelete) {
      try {
        if (existsSync(relPath)) {
          unlinkSync(relPath);
          deleted.push(relPath);
        }
        // Remove from merge state regardless (file may already be gone)
        delete projectState.processedFiles[relPath];
      } catch (err) {
        logger.warn(`Failed to delete old contribution file: ${relPath}`, { error: String(err) });
      }
    }
  }

  return deleted;
}
