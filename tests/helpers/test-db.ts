import { createDatabase, type SqliteDatabase } from "../../src/core/compat";
import type { Observation } from "../../src/types/observation";

/** Create an in-memory DB with claude-mem-like schema for testing */
export function createTestMemDb(): SqliteDatabase {
  const db = createDatabase(":memory:");
  db.exec(`
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
      project TEXT
    );

    CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at_epoch INTEGER,
      status TEXT DEFAULT 'completed'
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
  const result = db.prepare(
    `INSERT INTO observations (memory_session_id, type, title, narrative, text, facts, concepts, files_read, files_modified, created_at_epoch, project)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    obs.created_at_epoch ?? Math.floor(Date.now() / 1000),
    obs.project ?? "test-project"
  );
  return Number(result.lastInsertRowid);
}
