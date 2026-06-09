import { createDatabase, getFileSize, type SqliteDatabase } from "./compat";
import { BUSY_TIMEOUT_MS } from "./constants";
import { logger } from "./logger";
import type { Observation } from "../types/observation";

export type { SqliteDatabase };

export function openMemDb(dbPath: string): SqliteDatabase {
  const db = createDatabase(dbPath, { readonly: true });
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return db;
}

export function openMemDbWritable(dbPath: string): SqliteDatabase {
  const db = createDatabase(dbPath);
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function queryObservations(db: SqliteDatabase, project: string): Observation[] {
  const stmt = db.prepare(
    `SELECT id, memory_session_id, type, title, narrative, text, facts, concepts, files_read, files_modified, created_at_epoch
     FROM observations
     WHERE project = ?
     ORDER BY created_at_epoch DESC`
  );
  return stmt.all(project) as Observation[];
}

export function getObservationCount(db: SqliteDatabase, project?: string): number {
  if (project) {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM observations WHERE project = ?").get(project) as { cnt: number };
    return row.cnt;
  }
  const row = db.prepare("SELECT COUNT(*) as cnt FROM observations").get() as { cnt: number };
  return row.cnt;
}

export function getSessionCount(db: SqliteDatabase): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM sdk_sessions").get() as { cnt: number };
  return row.cnt;
}

export function getSummaryCount(db: SqliteDatabase): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM session_summaries").get() as { cnt: number };
  return row.cnt;
}

export function checkDuplicate(
  db: SqliteDatabase,
  memorySessionId: string,
  title: string,
  createdAtEpoch: number
): boolean {
  const row = db.prepare(
    `SELECT 1 FROM observations
     WHERE memory_session_id = ? AND title = ? AND created_at_epoch = ?
     LIMIT 1`
  ).get(memorySessionId, title, createdAtEpoch);
  return row != null;
}

/**
 * Convert a claude-mem `created_at_epoch` to an ISO-8601 string.
 *
 * The field's unit is not consistent across the ecosystem: the current
 * claude-mem schema stores MILLISECONDS, while older rows and several places in
 * this repo assume SECONDS (display multiplies by 1000, scoring compares against
 * `Date.now()/1000`). Normalize by magnitude — anything below 1e12 (every
 * plausible seconds value; 1e12 ms is the year 2001) is treated as seconds and
 * scaled up. This yields a correct timestamp for both conventions instead of
 * producing a 1970 (seconds read as ms) or year-58408 (ms read as seconds) date.
 */
export function epochToIsoString(epoch: number): string {
  const ms = epoch < 1e12 ? epoch * 1000 : epoch;
  return new Date(ms).toISOString();
}

export function insertObservation(db: SqliteDatabase, obs: Observation, project: string): void {
  // `created_at` is NOT NULL in the current claude-mem schema. When the merged
  // JSON lacks it (export only carries `created_at_epoch`), derive it from the epoch.
  db.prepare(
    `INSERT INTO observations (memory_session_id, type, title, narrative, text, facts, concepts, files_read, files_modified, created_at_epoch, created_at, project)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    obs.memory_session_id, obs.type, obs.title, obs.narrative, obs.text,
    obs.facts, obs.concepts, obs.files_read, obs.files_modified, obs.created_at_epoch,
    obs.created_at ?? epochToIsoString(obs.created_at_epoch), project
  );
}

/**
 * Ensure a parent sdk_sessions row exists for an imported observation.
 *
 * Imported observations carry the source machine's `memory_session_id`, which
 * is absent from the target's `sdk_sessions`. The observations table has a
 * `FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id)`,
 * so inserting without this stub fails with "FOREIGN KEY constraint failed".
 * INSERT OR IGNORE is a no-op when the session already exists.
 */
export function ensureSession(db: SqliteDatabase, obs: Observation, project: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status)
     VALUES (?, ?, ?, ?, ?, 'completed')`
  ).run(
    `imported-${obs.memory_session_id}`, obs.memory_session_id, project,
    obs.created_at ?? epochToIsoString(obs.created_at_epoch), obs.created_at_epoch
  );
}

/** Hardcoded whitelist of FTS5 table names — prevents SQL injection via table name interpolation */
const ALLOWED_FTS_TABLES: ReadonlySet<string> = new Set([
  "observations_fts",
  "session_summaries_fts",
  "user_prompts_fts",
]);

export function rebuildFts(db: SqliteDatabase): void {
  for (const table of ALLOWED_FTS_TABLES) {
    try {
      // FTS5 rebuild requires table name interpolation (can't use ? for table names).
      // Safety: table is validated against ALLOWED_FTS_TABLES whitelist above.
      db.prepare(`INSERT INTO ${table}(${table}) VALUES('rebuild')`).run();
      logger.debug(`Rebuilt FTS5 index: ${table}`);
    } catch (e) {
      logger.warn(`Failed to rebuild FTS5 index ${table}: ${e}`);
    }
  }
}

/**
 * Look up the project for a set of observation IDs.
 * Returns a Map<observationId, projectName>.
 */
export function getObservationProjectMap(
  db: SqliteDatabase,
  ids: number[],
): Map<number, string> {
  const result = new Map<number, string>();
  if (ids.length === 0) return result;

  // Use individual lookups (safe, no SQL interpolation, IDs are validated numbers)
  const stmt = db.prepare("SELECT id, project FROM observations WHERE id = ?");
  for (const id of ids) {
    const row = stmt.get(id) as { id: number; project: string } | null;
    if (row && row.project) {
      result.set(row.id, row.project);
    }
  }
  return result;
}

export function runIntegrityCheck(db: SqliteDatabase): string {
  const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  return row.integrity_check;
}

export function getDbSizeBytes(dbPath: string): number {
  return getFileSize(dbPath);
}
