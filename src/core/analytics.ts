import type { SqliteDatabase } from "./compat";
import type { Observation } from "../types/observation";
import {
  calculateTypeWeight,
  calculateRecencyWeight,
  calculateScore,
  hasKeepTag,
} from "./scoring";

// ── Type distribution ────────────────────────────────────────────────

/** Count observations by type, optionally filtered by project */
export function getTypeDistribution(
  db: SqliteDatabase,
  project?: string,
): Record<string, number> {
  const rows = project
    ? (db
        .prepare(
          "SELECT type, COUNT(*) as count FROM observations WHERE project = ? GROUP BY type",
        )
        .all(project) as Array<{ type: string; count: number }>)
    : (db
        .prepare(
          "SELECT type, COUNT(*) as count FROM observations GROUP BY type",
        )
        .all() as Array<{ type: string; count: number }>);

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.type] = row.count;
  }
  return result;
}

// ── Top accessed observations ────────────────────────────────────────

export function getTopAccessed(
  accessDb: SqliteDatabase,
  memDb: SqliteDatabase,
  project: string | null,
  limit: number,
): Array<{
  id: number;
  title: string;
  type: string;
  project: string;
  accessCount: number;
  lastAccessed: number;
}> {
  // Build the access aggregation query
  const accessRows = project
    ? (accessDb
        .prepare(
          `SELECT observation_id, project, COUNT(*) as access_count, MAX(accessed_at) as last_accessed
           FROM access_log
           WHERE project = ?
           GROUP BY observation_id, project
           ORDER BY access_count DESC
           LIMIT ?`,
        )
        .all(project, limit) as Array<{
        observation_id: number;
        project: string;
        access_count: number;
        last_accessed: number;
      }>)
    : (accessDb
        .prepare(
          `SELECT observation_id, project, COUNT(*) as access_count, MAX(accessed_at) as last_accessed
           FROM access_log
           GROUP BY observation_id, project
           ORDER BY access_count DESC
           LIMIT ?`,
        )
        .all(limit) as Array<{
        observation_id: number;
        project: string;
        access_count: number;
        last_accessed: number;
      }>);

  const results: Array<{
    id: number;
    title: string;
    type: string;
    project: string;
    accessCount: number;
    lastAccessed: number;
  }> = [];

  for (const row of accessRows) {
    const obs = memDb
      .prepare("SELECT id, title, type FROM observations WHERE id = ?")
      .get(row.observation_id) as
      | { id: number; title: string; type: string }
      | undefined;

    if (obs) {
      results.push({
        id: obs.id,
        title: obs.title,
        type: obs.type,
        project: row.project,
        accessCount: row.access_count,
        lastAccessed: row.last_accessed,
      });
    }
  }

  return results;
}

// ── Access heatmap ───────────────────────────────────────────────────

export function getAccessHeatmap(
  accessDb: SqliteDatabase,
  months: number,
): Array<{ date: string; count: number }> {
  const cutoff = Math.floor(Date.now() / 1000) - months * 30 * 86400;
  return accessDb
    .prepare(
      `SELECT DATE(accessed_at, 'unixepoch') as date, COUNT(*) as count
       FROM access_log
       WHERE accessed_at >= ?
       GROUP BY date ORDER BY date`,
    )
    .all(cutoff) as Array<{ date: string; count: number }>;
}

// ── Sync timeline ────────────────────────────────────────────────────

export function getSyncTimeline(
  accessDb: SqliteDatabase,
  memDb?: SqliteDatabase,
): Array<{
  month: string;
  exports: number;
  imports: number;
  exportedObs: number;
  importedObs: number;
}> {
  const exportRows = accessDb
    .prepare(
      `SELECT strftime('%Y-%m', exported_at, 'unixepoch') as month,
              COUNT(*) as exports,
              SUM(observations_count) as exportedObs
       FROM export_log GROUP BY month ORDER BY month`,
    )
    .all() as Array<{ month: string; exports: number; exportedObs: number }>;

  const importRows = accessDb
    .prepare(
      `SELECT strftime('%Y-%m', imported_at, 'unixepoch') as month,
              COUNT(*) as imports,
              SUM(observations_count) as importedObs
       FROM import_log GROUP BY month ORDER BY month`,
    )
    .all() as Array<{ month: string; imports: number; importedObs: number }>;

  // Merge by month
  const monthMap = new Map<
    string,
    {
      month: string;
      exports: number;
      imports: number;
      exportedObs: number;
      importedObs: number;
    }
  >();

  for (const row of exportRows) {
    monthMap.set(row.month, {
      month: row.month,
      exports: row.exports,
      imports: 0,
      exportedObs: row.exportedObs ?? 0,
      importedObs: 0,
    });
  }

  for (const row of importRows) {
    const existing = monthMap.get(row.month);
    if (existing) {
      existing.imports = row.imports;
      existing.importedObs = row.importedObs ?? 0;
    } else {
      monthMap.set(row.month, {
        month: row.month,
        exports: 0,
        imports: row.imports,
        exportedObs: 0,
        importedObs: row.importedObs ?? 0,
      });
    }
  }

  const result = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  // Fallback: if no export/import logs, derive timeline from observation creation dates
  if (result.length === 0 && memDb) {
    const obsRows = memDb
      .prepare(
        `SELECT strftime('%Y-%m', created_at_epoch, 'unixepoch') as month,
                COUNT(*) as count
         FROM observations GROUP BY month ORDER BY month`,
      )
      .all() as Array<{ month: string; count: number }>;

    for (const row of obsRows) {
      result.push({
        month: row.month,
        exports: 0,
        imports: 0,
        exportedObs: row.count,
        importedObs: 0,
      });
    }
  }

  return result;
}

// ── Developer contributions ──────────────────────────────────────────

export function getDevContributions(
  accessDb: SqliteDatabase,
): Array<{ dev: string; exports: number; observations: number }> {
  // Extract dev name from file_path: contributions/{project}/{devName}/{date}.json
  const rows = accessDb
    .prepare(
      `SELECT file_path, COUNT(*) as exports, SUM(observations_count) as observations
       FROM export_log
       WHERE file_path IS NOT NULL
       GROUP BY file_path`,
    )
    .all() as Array<{
    file_path: string;
    exports: number;
    observations: number;
  }>;

  // Aggregate by dev name extracted from the path
  const devMap = new Map<
    string,
    { dev: string; exports: number; observations: number }
  >();

  for (const row of rows) {
    const parts = row.file_path.replace(/\\/g, "/").split("/");
    // contributions/{project}/{devName}/{date}.json -> devName is at index 2
    let devName = "unknown";
    if (parts.length >= 3) {
      devName = parts[2];
    }

    const existing = devMap.get(devName);
    if (existing) {
      existing.exports += row.exports;
      existing.observations += row.observations ?? 0;
    } else {
      devMap.set(devName, {
        dev: devName,
        exports: row.exports,
        observations: row.observations ?? 0,
      });
    }
  }

  return Array.from(devMap.values());
}

// ── Observation scores ───────────────────────────────────────────────

export function getObservationScores(
  memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  project: string,
  keepTags: string[],
): Array<{
  id: number;
  title: string;
  type: string;
  score: number;
  created: number;
  accessCount: number;
}> {
  const observations = memDb
    .prepare(
      `SELECT id, type, title, narrative, text, facts, concepts, created_at_epoch
       FROM observations WHERE project = ?
       ORDER BY created_at_epoch DESC`,
    )
    .all(project) as Observation[];

  if (observations.length === 0) return [];

  // Get access counts for all observations in the project
  const accessRows = accessDb
    .prepare(
      `SELECT observation_id, COUNT(*) as cnt
       FROM access_log WHERE project = ?
       GROUP BY observation_id`,
    )
    .all(project) as Array<{ observation_id: number; cnt: number }>;

  const accessMap = new Map<number, number>();
  let maxAccess = 0;
  for (const row of accessRows) {
    accessMap.set(row.observation_id, row.cnt);
    if (row.cnt > maxAccess) maxAccess = row.cnt;
  }

  const nowEpoch = Math.floor(Date.now() / 1000);

  return observations.map((obs) => {
    const accessCount = accessMap.get(obs.id) ?? 0;
    const typeWeight = calculateTypeWeight(obs.type);
    const recencyWeight = calculateRecencyWeight(
      obs.created_at_epoch,
      nowEpoch,
    );
    const accessWeight = maxAccess > 0 ? accessCount / maxAccess : 0;

    let score = calculateScore({
      typeWeight,
      recencyWeight,
      accessWeight,
      weights: { typeWeight: 0.3, recencyWeight: 0.2, thirdWeight: 0.5 },
      mode: "hook",
    });

    // Keep-tagged observations get a boosted score
    if (hasKeepTag(obs, keepTags)) {
      score = Math.max(score, 1.0);
    }

    return {
      id: obs.id,
      title: obs.title,
      type: obs.type,
      score: Math.round(score * 1000) / 1000,
      created: obs.created_at_epoch,
      accessCount,
    };
  });
}

// ── Overview stats ───────────────────────────────────────────────────

export function getOverviewStats(
  memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  config: {
    global: { devName: string; evictionStrategy: string; claudeMemDbPath: string };
    projects: Record<string, { enabled?: boolean }>;
  },
): {
  totalObservations: number;
  totalProjects: number;
  enabledProjects: number;
  totalExports: number;
  totalImports: number;
  totalAccessEvents: number;
  devName: string;
  evictionStrategy: string;
} {
  const obsRow = memDb
    .prepare("SELECT COUNT(*) as cnt FROM observations")
    .get() as { cnt: number };

  const exportRow = accessDb
    .prepare("SELECT COUNT(*) as cnt FROM export_log")
    .get() as { cnt: number };

  const importRow = accessDb
    .prepare("SELECT COUNT(*) as cnt FROM import_log")
    .get() as { cnt: number };

  const accessRow = accessDb
    .prepare("SELECT COUNT(*) as cnt FROM access_log")
    .get() as { cnt: number };

  const projectNames = Object.keys(config.projects);
  const enabledProjects = projectNames.filter(
    (name) => config.projects[name].enabled !== false,
  );

  return {
    totalObservations: obsRow.cnt,
    totalProjects: projectNames.length,
    enabledProjects: enabledProjects.length,
    totalExports: exportRow.cnt,
    totalImports: importRow.cnt,
    totalAccessEvents: accessRow.cnt,
    devName: config.global.devName,
    evictionStrategy: config.global.evictionStrategy,
  };
}
