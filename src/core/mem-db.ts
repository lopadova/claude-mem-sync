import { Database } from "bun:sqlite";
import { BUSY_TIMEOUT_MS } from "./constants";
import { logger } from "./logger";
import type { Observation } from "../types/observation";

export function openMemDb(dbPath: string): Database {
  const db = new Database(dbPath, { readonly: true });
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return db;
}

export function openMemDbWritable(dbPath: string): Database {
  const db = new Database(dbPath);
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function queryObservations(db: Database, project: string): Observation[] {
  const stmt = db.prepare(
    `SELECT id, sdk_session_id, type, title, narrative, text, facts, concepts, files, created_at_epoch
     FROM observations
     WHERE project = ?
     ORDER BY created_at_epoch DESC`
  );
  return stmt.all(project) as Observation[];
}

export function getObservationCount(db: Database, project?: string): number {
  if (project) {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM observations WHERE project = ?").get(project) as { cnt: number };
    return row.cnt;
  }
  const row = db.prepare("SELECT COUNT(*) as cnt FROM observations").get() as { cnt: number };
  return row.cnt;
}

export function getSessionCount(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM sdk_sessions").get() as { cnt: number };
  return row.cnt;
}

export function getSummaryCount(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM session_summaries").get() as { cnt: number };
  return row.cnt;
}

export function checkDuplicate(
  db: Database,
  sdkSessionId: number,
  title: string,
  createdAtEpoch: number
): boolean {
  const row = db.prepare(
    `SELECT 1 FROM observations
     WHERE sdk_session_id = ? AND title = ? AND created_at_epoch = ?
     LIMIT 1`
  ).get(sdkSessionId, title, createdAtEpoch);
  return row !== null;
}

export function insertObservation(db: Database, obs: Observation, project: string): void {
  db.prepare(
    `INSERT INTO observations (sdk_session_id, type, title, narrative, text, facts, concepts, files, created_at_epoch, project)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    obs.sdk_session_id, obs.type, obs.title, obs.narrative, obs.text,
    obs.facts, obs.concepts, obs.files, obs.created_at_epoch, project
  );
}

/** Hardcoded whitelist of FTS5 table names — prevents SQL injection via table name interpolation */
const ALLOWED_FTS_TABLES: ReadonlySet<string> = new Set([
  "observations_fts",
  "session_summaries_fts",
  "user_prompts_fts",
]);

export function rebuildFts(db: Database): void {
  for (const table of ALLOWED_FTS_TABLES) {
    try {
      // Note: FTS5 rebuild requires table name interpolation (can't use ? for table names).
      // Safety: table is validated against ALLOWED_FTS_TABLES whitelist above.
      db.run(`INSERT INTO ${table}(${table}) VALUES('rebuild')`);
      logger.debug(`Rebuilt FTS5 index: ${table}`);
    } catch (e) {
      logger.warn(`Failed to rebuild FTS5 index ${table}: ${e}`);
    }
  }
}

export function runIntegrityCheck(db: Database): string {
  const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  return row.integrity_check;
}

export function getDbSizeBytes(dbPath: string): number {
  try {
    const file = Bun.file(dbPath);
    return file.size;
  } catch {
    return 0;
  }
}
