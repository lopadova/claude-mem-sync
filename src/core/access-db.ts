import { mkdirSync } from "fs";
import { dirname } from "path";
import { createDatabase, type SqliteDatabase } from "./compat";
import { ACCESS_DB_PATH, BUSY_TIMEOUT_MS } from "./constants";
import { logger } from "./logger";

export type { SqliteDatabase };

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER NOT NULL,
  project TEXT NOT NULL,
  accessed_at INTEGER NOT NULL,
  session_id TEXT,
  tool_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_obs ON access_log(observation_id, project);
CREATE INDEX IF NOT EXISTS idx_access_time ON access_log(project, accessed_at DESC);

CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  observations_count INTEGER,
  source_dev TEXT
);
CREATE INDEX IF NOT EXISTS idx_import_hash ON import_log(project, file_hash);

CREATE TABLE IF NOT EXISTS export_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  exported_at INTEGER NOT NULL,
  observations_count INTEGER,
  file_path TEXT,
  pushed_to TEXT
);
CREATE INDEX IF NOT EXISTS idx_export_time ON export_log(project, exported_at DESC);
`;

export function openAccessDb(dbPath: string = ACCESS_DB_PATH): SqliteDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = createDatabase(dbPath);
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}

export function logAccess(
  db: SqliteDatabase,
  observationId: number,
  project: string,
  sessionId: string | null,
  toolName: string
): void {
  db.prepare(
    `INSERT INTO access_log (observation_id, project, accessed_at, session_id, tool_name)
     VALUES (?, ?, ?, ?, ?)`
  ).run(observationId, project, Math.floor(Date.now() / 1000), sessionId, toolName);
}

export function getAccessCount(
  db: SqliteDatabase,
  observationId: number,
  project: string,
  windowMonths: number
): number {
  const cutoff = Math.floor(Date.now() / 1000) - windowMonths * 30 * 86400;
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM access_log
     WHERE observation_id = ? AND project = ? AND accessed_at >= ?`
  ).get(observationId, project, cutoff) as { cnt: number };
  return row.cnt;
}

export function getMaxAccessCount(db: SqliteDatabase, project: string, windowMonths: number): number {
  const cutoff = Math.floor(Date.now() / 1000) - windowMonths * 30 * 86400;
  const row = db.prepare(
    `SELECT MAX(cnt) as max_cnt FROM (
       SELECT COUNT(*) as cnt FROM access_log
       WHERE project = ? AND accessed_at >= ?
       GROUP BY observation_id
     )`
  ).get(project, cutoff) as { max_cnt: number | null };
  return row.max_cnt ?? 0;
}

export function getTotalAccessLogEntries(db: SqliteDatabase): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM access_log").get() as { cnt: number };
  return row.cnt;
}

export function isFileImported(db: SqliteDatabase, project: string, fileHash: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM import_log WHERE project = ? AND file_hash = ? LIMIT 1`
  ).get(project, fileHash);
  return row !== null;
}

export function logImport(
  db: SqliteDatabase,
  project: string,
  fileHash: string,
  count: number,
  sourceDev: string | null
): void {
  db.prepare(
    `INSERT INTO import_log (project, file_hash, imported_at, observations_count, source_dev)
     VALUES (?, ?, ?, ?, ?)`
  ).run(project, fileHash, Math.floor(Date.now() / 1000), count, sourceDev);
}

export function logExport(
  db: SqliteDatabase,
  project: string,
  count: number,
  filePath: string,
  pushedTo: string
): void {
  db.prepare(
    `INSERT INTO export_log (project, exported_at, observations_count, file_path, pushed_to)
     VALUES (?, ?, ?, ?, ?)`
  ).run(project, Math.floor(Date.now() / 1000), count, filePath, pushedTo);
}

export function getLastExport(db: SqliteDatabase, project: string): { exported_at: number; observations_count: number } | null {
  return db.prepare(
    `SELECT exported_at, observations_count FROM export_log
     WHERE project = ? ORDER BY exported_at DESC LIMIT 1`
  ).get(project) as { exported_at: number; observations_count: number } | null;
}

export function getLastImport(db: SqliteDatabase, project: string): { imported_at: number; observations_count: number } | null {
  return db.prepare(
    `SELECT imported_at, observations_count FROM import_log
     WHERE project = ? ORDER BY imported_at DESC LIMIT 1`
  ).get(project) as { imported_at: number; observations_count: number } | null;
}

export function pruneOldAccessEntries(db: SqliteDatabase, windowMonths: number): number {
  const cutoff = Math.floor(Date.now() / 1000) - windowMonths * 30 * 86400;
  const result = db.prepare(
    `DELETE FROM access_log WHERE accessed_at < ?`
  ).run(cutoff);
  return result.changes;
}
