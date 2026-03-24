import type { ParsedArgs } from "../cli";
import { loadConfig, getEnabledProjects, resolveProjectConfig } from "../core/config";
import { copyFile } from "../core/compat";
import {
  openMemDbWritable,
  queryObservations,
  rebuildFts,
  runIntegrityCheck,
  getDbSizeBytes,
} from "../core/mem-db";
import {
  openAccessDb,
  pruneOldAccessEntries,
} from "../core/access-db";
import {
  calculateTypeWeight,
  calculateRecencyWeight,
  calculateScore,
  hasKeepTag,
} from "../core/scoring";
import {
  ACCESS_DB_PATH,
  DEFAULT_ACCESS_WINDOW_MONTHS,
} from "../core/constants";
import { logger } from "../core/logger";

export default async function run(_args: ParsedArgs): Promise<void> {
  // 1. Load config
  const config = loadConfig();
  const dbPath = config.global.claudeMemDbPath;
  const pruneOlderThanDays = config.global.maintenancePruneOlderThanDays;
  const pruneScoreThreshold = config.global.maintenancePruneScoreThreshold;
  const keepTags = config.global.evictionKeepTagged;

  // 2. Record size before
  const sizeBefore = getDbSizeBytes(dbPath);

  // 3. Backup: copy DB file to {dbPath}.backup
  const backupPath = `${dbPath}.backup`;
  copyFile(dbPath, backupPath);
  logger.info(`Backup created: ${backupPath}`);

  // 4. Open DB writable
  const db = openMemDbWritable(dbPath);

  try {
    // 5. Prune: score all observations across enabled projects, remove low-scorers
    const nowEpoch = Math.floor(Date.now() / 1000);
    const cutoffEpoch = nowEpoch - pruneOlderThanDays * 86400;
    const enabledProjects = getEnabledProjects(config);
    const idsToPrune: number[] = [];

    for (const projectName of enabledProjects) {
      const resolved = resolveProjectConfig(config, projectName);
      const observations = queryObservations(db, resolved.memProject);

      for (const obs of observations) {
        // Never prune keep-tagged observations
        if (hasKeepTag(obs, keepTags)) continue;

        // Only consider observations older than the threshold
        if (obs.created_at_epoch >= cutoffEpoch) continue;

        const typeW = calculateTypeWeight(obs.type);
        const recencyW = calculateRecencyWeight(obs.created_at_epoch, nowEpoch);
        const score = calculateScore({
          typeWeight: typeW,
          recencyWeight: recencyW,
          weights: resolved.scoringWeights,
          mode: "passive",
        });

        if (score < pruneScoreThreshold) {
          idsToPrune.push(obs.id);
        }
      }
    }

    // Also score observations that have no project / belong to non-configured projects
    // by querying all observations and filtering out those already processed
    const allObs = db.prepare(
      `SELECT id, memory_session_id, type, title, narrative, text, facts, concepts, files_read, files_modified, created_at_epoch, project
       FROM observations
       WHERE created_at_epoch < ?`
    ).all(cutoffEpoch) as Array<{ id: number; memory_session_id: string; type: string; title: string; narrative: string | null; text: string | null; facts: string | null; concepts: string | null; files_read: string | null; files_modified: string | null; created_at_epoch: number; project?: string }>;

    const alreadyConsidered = new Set(idsToPrune);
    // We need to also track IDs already processed but not pruned
    const processedProjects = new Set(
      enabledProjects.map((p) => resolveProjectConfig(config, p).memProject)
    );

    for (const obs of allObs) {
      if (obs.project && processedProjects.has(obs.project)) continue;

      // Never prune keep-tagged observations
      if (hasKeepTag(obs, keepTags)) continue;

      const typeW = calculateTypeWeight(obs.type);
      const recencyW = calculateRecencyWeight(obs.created_at_epoch, nowEpoch);
      const score = calculateScore({
        typeWeight: typeW,
        recencyWeight: recencyW,
        weights: { typeWeight: 0.3, recencyWeight: 0.2, thirdWeight: 0.5 },
        mode: "passive",
      });

      if (score < pruneScoreThreshold && !alreadyConsidered.has(obs.id)) {
        idsToPrune.push(obs.id);
      }
    }

    // Execute pruning
    let pruneCount = 0;
    if (idsToPrune.length > 0) {
      // Batch delete in chunks to avoid overly long SQL
      const CHUNK_SIZE = 500;
      for (let i = 0; i < idsToPrune.length; i += CHUNK_SIZE) {
        const chunk = idsToPrune.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(",");
        const result = db.prepare(
          `DELETE FROM observations WHERE id IN (${placeholders})`
        ).run(...chunk);
        pruneCount += result.changes;
      }
    }

    // 6. Rebuild FTS5 indexes
    rebuildFts(db);

    // 7. ANALYZE
    db.exec("ANALYZE");

    // 8. VACUUM
    db.exec("VACUUM");

    // 9. Integrity check
    const integrity = runIntegrityCheck(db);

    // 10. Record size after
    const sizeAfter = getDbSizeBytes(dbPath);

    // 11. Prune access.db
    const accessDb = openAccessDb(ACCESS_DB_PATH);
    let accessPruned = 0;
    try {
      const windowMonths = config.global.evictionStrategy === "hook"
        ? DEFAULT_ACCESS_WINDOW_MONTHS
        : DEFAULT_ACCESS_WINDOW_MONTHS;
      accessPruned = pruneOldAccessEntries(accessDb, windowMonths);
    } finally {
      accessDb.close();
    }

    // 12. Report
    const sizeBeforeMB = (sizeBefore / 1024 / 1024).toFixed(1);
    const sizeAfterMB = (sizeAfter / 1024 / 1024).toFixed(1);

    console.log(`
Maintenance complete:
  Observations pruned: ${pruneCount}
  DB size: before ${sizeBeforeMB} MB → after ${sizeAfterMB} MB
  Integrity: ${integrity}
  Access log entries pruned: ${accessPruned}`);
  } finally {
    db.close();
  }
}
