import { createDatabase, type SqliteDatabase } from "../../src/core/compat";
import { epochToIsoString } from "../../src/core/mem-db";
import type { Observation } from "../../src/types/observation";

/**
 * Create an in-memory DB mirroring the current claude-mem schema for testing.
 *
 * Mirrors the real schema's invariants that the import pipeline depends on:
 * `observations.created_at` is NOT NULL, `sdk_sessions` carries the columns
 * `ensureSession()` writes, and observations have a FOREIGN KEY on
 * `memory_session_id`. Foreign keys are OFF by default (SQLite default) so the
 * many tests that insert observations without a parent session keep working;
 * pass `{ enforceForeignKeys: true }` to reproduce the cross-machine FK case.
 */
export function createTestMemDb(opts: { enforceForeignKeys?: boolean } = {}): SqliteDatabase {
  const db = createDatabase(":memory:");
  if (opts.enforceForeignKeys) {
    db.exec("PRAGMA foreign_keys = ON");
  }
  db.exec(`
    CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_session_id TEXT UNIQUE NOT NULL,
      memory_session_id TEXT UNIQUE,
      project TEXT NOT NULL,
      started_at TEXT NOT NULL,
      started_at_epoch INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at_epoch INTEGER
    );

    CREATE TABLE observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      narrative TEXT,
      text TEXT,
      facts TEXT,
      concepts TEXT,
      files_read TEXT,
      files_modified TEXT,
      created_at_epoch INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      project TEXT,
      FOREIGN KEY(memory_session_id) REFERENCES sdk_sessions(memory_session_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_text TEXT,
      created_at_epoch INTEGER
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
      title, narrative, text, content=observations, content_rowid=id
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
      content_text, content=session_summaries, content_rowid=id
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS user_prompts_fts USING fts5(
      content_text
    );
  `);
  return db;
}

/** Insert a test observation and return its ID */
export function insertTestObservation(db: SqliteDatabase, obs: Partial<Observation> & { project?: string }): number {
  const epoch = obs.created_at_epoch ?? Math.floor(Date.now() / 1000);
  const result = db.prepare(
    `INSERT INTO observations (memory_session_id, type, title, narrative, text, facts, concepts, files_read, files_modified, created_at_epoch, created_at, project)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    obs.memory_session_id ?? "session-1",
    obs.type ?? "decision",
    obs.title ?? "Test Observation",
    obs.narrative ?? null,
    obs.text ?? null,
    obs.facts ?? null,
    obs.concepts ?? null,
    obs.files_read ?? null,
    obs.files_modified ?? null,
    epoch,
    obs.created_at ?? epochToIsoString(epoch),
    obs.project ?? "test-project"
  );
  return Number(result.lastInsertRowid);
}
