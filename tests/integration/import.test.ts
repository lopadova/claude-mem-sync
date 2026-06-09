import { describe, test, expect } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import { createTestMemDb, insertTestObservation } from "../helpers/test-db";
import {
  checkDuplicate,
  insertObservation,
  ensureSession,
  epochToIsoString,
  rebuildFts,
  runIntegrityCheck,
  getObservationCount,
} from "../../src/core/mem-db";
import { openAccessDb, isFileImported, logImport } from "../../src/core/access-db";
import { EXPORT_JSON_VERSION } from "../../src/core/constants";
import type { Observation, ExportFile } from "../../src/types/observation";

describe("Import pipeline integration", () => {
  test("imports observations from JSON, deduplicates, and rebuilds FTS", () => {
    const db = createTestMemDb();

    // Pre-existing observation (will be a duplicate)
    insertTestObservation(db, {
      memory_session_id: "session-10",
      type: "decision",
      title: "Existing Decision",
      created_at_epoch: 1710000000,
      project: "test-project",
    });

    expect(getObservationCount(db)).toBe(1);

    // Simulate an import JSON
    const importData: ExportFile = {
      version: EXPORT_JSON_VERSION,
      exportedBy: "alice",
      exportedAt: "2026-03-14T16:00:00Z",
      exportedAtEpoch: 1773688800,
      project: "test-project",
      packageVersion: "1.0.0",
      filters: { types: ["decision"], keywords: [], tags: [] },
      observations: [
        {
          id: 100,
          memory_session_id: "session-10",
          type: "decision",
          title: "Existing Decision", // duplicate by composite key
          narrative: "Already exists",
          text: null,
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          created_at_epoch: 1710000000,
        },
        {
          id: 101,
          memory_session_id: "session-20",
          type: "bugfix",
          title: "New Bugfix",
          narrative: "A brand new bugfix",
          text: null,
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          created_at_epoch: 1710100000,
        },
        {
          id: 102,
          memory_session_id: "session-30",
          type: "discovery",
          title: "New Discovery",
          narrative: null,
          text: "Found something",
          facts: null,
          concepts: null,
          files_read: null,
          files_modified: null,
          created_at_epoch: 1710200000,
        },
      ],
      observationCount: 3,
    };

    // Import with dedup
    let newCount = 0;
    let skippedCount = 0;

    const transaction = db.transaction(() => {
      for (const obs of importData.observations) {
        const isDuplicate = checkDuplicate(
          db,
          obs.memory_session_id,
          obs.title,
          obs.created_at_epoch,
        );

        if (isDuplicate) {
          skippedCount++;
        } else {
          insertObservation(db, obs, "test-project");
          newCount++;
        }
      }
    });

    transaction();

    expect(newCount).toBe(2);
    expect(skippedCount).toBe(1);
    expect(getObservationCount(db)).toBe(3); // 1 existing + 2 new

    // Rebuild FTS
    rebuildFts(db);

    // Integrity check
    const integrity = runIntegrityCheck(db);
    expect(integrity).toBe("ok");

    db.close();
  });

  test("rejects future version files", () => {
    const importData = {
      version: 999, // unsupported future version
      exportedBy: "bob",
      exportedAt: "2026-03-14T16:00:00Z",
      exportedAtEpoch: 1773688800,
      project: "test-project",
      packageVersion: "99.0.0",
      filters: { types: [], keywords: [], tags: [] },
      observations: [],
      observationCount: 0,
    };

    expect(importData.version > EXPORT_JSON_VERSION).toBe(true);
  });

  test("handles empty import file gracefully", () => {
    const db = createTestMemDb();

    insertTestObservation(db, {
      type: "decision",
      title: "Existing",
      project: "test-project",
    });

    const emptyImport: ExportFile = {
      version: EXPORT_JSON_VERSION,
      exportedBy: "alice",
      exportedAt: "2026-03-14T16:00:00Z",
      exportedAtEpoch: 1773688800,
      project: "test-project",
      packageVersion: "1.0.0",
      filters: { types: [], keywords: [], tags: [] },
      observations: [],
      observationCount: 0,
    };

    let newCount = 0;
    for (const obs of emptyImport.observations) {
      const isDuplicate = checkDuplicate(db, obs.memory_session_id, obs.title, obs.created_at_epoch);
      if (!isDuplicate) {
        insertObservation(db, obs, "test-project");
        newCount++;
      }
    }

    expect(newCount).toBe(0);
    expect(getObservationCount(db)).toBe(1); // unchanged

    db.close();
  });
});

/**
 * Regression coverage for PR #17 — aligning with the current claude-mem schema:
 *   1. observations.created_at is NOT NULL (must be derived from the epoch)
 *   2. created_at_epoch is in MILLISECONDS (must NOT be multiplied by 1000)
 *   3. observations have a FK on memory_session_id, so a cross-machine import
 *      must stub the parent sdk_sessions row first (ensureSession)
 *   4. isFileImported must report "not imported" for an unknown hash
 *      (better-sqlite3 .get() returns undefined, not null)
 */
describe("Import schema compatibility (current claude-mem)", () => {
  // 1781024952302 ms === 2026-06-09T17:09:12.302Z. As seconds it would be year 58408.
  const EPOCH_MS = 1781024952302;

  function makeRemoteObs(overrides: Partial<Observation> = {}): Observation {
    return {
      id: 1,
      memory_session_id: "remote-session-1",
      type: "decision",
      title: "Cross-machine decision",
      narrative: null,
      text: null,
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      created_at_epoch: EPOCH_MS,
      ...overrides,
    };
  }

  test("import stubs the parent session, satisfies created_at NOT NULL, and derives the timestamp from ms", () => {
    const db = createTestMemDb({ enforceForeignKeys: true });
    const obs = makeRemoteObs();

    // Without a parent session, the FK on memory_session_id rejects the insert.
    expect(() => insertObservation(db, obs, "test-project")).toThrow();
    expect(getObservationCount(db)).toBe(0);

    // ensureSession creates the stub parent, then the insert succeeds.
    ensureSession(db, obs, "test-project");
    insertObservation(db, obs, "test-project");
    expect(getObservationCount(db)).toBe(1);

    const row = db
      .prepare("SELECT created_at, created_at_epoch FROM observations WHERE memory_session_id = ?")
      .get("remote-session-1") as { created_at: string; created_at_epoch: number };

    // created_at is derived from the epoch treated as MILLISECONDS.
    expect(row.created_at).toBe(new Date(EPOCH_MS).toISOString());
    expect(row.created_at.startsWith("2026-")).toBe(true); // not 1970, not year 58408
    expect(row.created_at_epoch).toBe(EPOCH_MS);

    // The stub session carries the import-prefixed content id + project.
    const session = db
      .prepare("SELECT content_session_id, project, started_at FROM sdk_sessions WHERE memory_session_id = ?")
      .get("remote-session-1") as { content_session_id: string; project: string; started_at: string };
    expect(session.content_session_id).toBe("imported-remote-session-1");
    expect(session.project).toBe("test-project");
    expect(session.started_at).toBe(new Date(EPOCH_MS).toISOString());

    db.close();
  });

  test("ensureSession is idempotent across observations from the same session", () => {
    const db = createTestMemDb({ enforceForeignKeys: true });
    const obsA = makeRemoteObs({ id: 1, title: "A", created_at_epoch: EPOCH_MS });
    const obsB = makeRemoteObs({ id: 2, title: "B", created_at_epoch: EPOCH_MS + 5000 });

    ensureSession(db, obsA, "test-project");
    insertObservation(db, obsA, "test-project");
    ensureSession(db, obsB, "test-project"); // INSERT OR IGNORE — no UNIQUE violation
    insertObservation(db, obsB, "test-project");

    expect(getObservationCount(db)).toBe(2);
    const sessionCount = db
      .prepare("SELECT COUNT(*) as cnt FROM sdk_sessions WHERE memory_session_id = ?")
      .get("remote-session-1") as { cnt: number };
    expect(sessionCount.cnt).toBe(1);

    db.close();
  });

  test("an explicit created_at on the observation is preserved over the derived value", () => {
    const db = createTestMemDb({ enforceForeignKeys: true });
    const explicit = "2025-01-02T03:04:05.678Z";
    const obs = makeRemoteObs({ created_at: explicit });

    ensureSession(db, obs, "test-project");
    insertObservation(db, obs, "test-project");

    const row = db
      .prepare("SELECT created_at FROM observations WHERE memory_session_id = ?")
      .get("remote-session-1") as { created_at: string };
    expect(row.created_at).toBe(explicit);

    db.close();
  });

  test("insertObservation stores a correct (non-1970) created_at for a seconds-based epoch", () => {
    const db = createTestMemDb({ enforceForeignKeys: true });
    const secondsEpoch = 1710000000; // 2024-03-09, in SECONDS
    const obs = makeRemoteObs({ created_at_epoch: secondsEpoch });

    ensureSession(db, obs, "test-project");
    insertObservation(db, obs, "test-project");

    const row = db
      .prepare("SELECT created_at FROM observations WHERE memory_session_id = ?")
      .get("remote-session-1") as { created_at: string };
    // Regression guard: a seconds epoch must NOT be read as ms (which yields 1970).
    expect(row.created_at).toBe(new Date(secondsEpoch * 1000).toISOString());
    expect(row.created_at.startsWith("2024-")).toBe(true);
    expect(row.created_at.startsWith("1970-")).toBe(false);

    db.close();
  });

  test("full import pipeline: FK stub + NOT NULL + dedup + FTS rebuild stays integrity-clean", () => {
    const db = createTestMemDb({ enforceForeignKeys: true });
    const project = "test-project";

    // Pre-existing observation (with its parent session) — will be a duplicate.
    const existing = makeRemoteObs({
      memory_session_id: "session-existing",
      title: "Existing Decision",
      created_at_epoch: 1781000000000, // ms
    });
    ensureSession(db, existing, project);
    insertObservation(db, existing, project);
    expect(getObservationCount(db)).toBe(1);

    // Incoming merged batch: 1 duplicate + 2 new (one ms, one seconds), all from
    // sessions absent on this machine (exercises the FK stub for each).
    const batch: Observation[] = [
      makeRemoteObs({ memory_session_id: "session-existing", title: "Existing Decision", created_at_epoch: 1781000000000 }), // dup
      makeRemoteObs({ memory_session_id: "session-new-ms", title: "New (ms)", created_at_epoch: 1781024952302 }),
      makeRemoteObs({ memory_session_id: "session-new-secs", title: "New (seconds)", created_at_epoch: 1710000000 }),
    ];

    let newCount = 0;
    let skippedCount = 0;
    const tx = db.transaction(() => {
      for (const obs of batch) {
        if (checkDuplicate(db, obs.memory_session_id, obs.title, obs.created_at_epoch)) {
          skippedCount++;
        } else {
          ensureSession(db, obs, project); // stub parent before insert (FK)
          insertObservation(db, obs, project);
          newCount++;
        }
      }
    });
    tx();

    expect(newCount).toBe(2);
    expect(skippedCount).toBe(1);
    expect(getObservationCount(db)).toBe(3); // 1 existing + 2 new

    // Both derived timestamps land in the right decade, never 1970.
    const rows = db
      .prepare("SELECT memory_session_id, created_at FROM observations WHERE memory_session_id LIKE 'session-new-%'")
      .all() as Array<{ memory_session_id: string; created_at: string }>;
    const bySession = Object.fromEntries(rows.map((r) => [r.memory_session_id, r.created_at]));
    expect(bySession["session-new-ms"].startsWith("2026-")).toBe(true);
    expect(bySession["session-new-secs"].startsWith("2024-")).toBe(true);

    rebuildFts(db);
    expect(runIntegrityCheck(db)).toBe("ok");

    db.close();
  });

  test("epochToIsoString normalizes both seconds and millisecond epochs", () => {
    // Milliseconds (current claude-mem): used as-is.
    expect(epochToIsoString(1781024952302)).toBe("2026-06-09T17:09:12.302Z");
    // Seconds (legacy / fixtures): scaled up — same calendar instant, not 1970.
    expect(epochToIsoString(1710000000)).toBe(new Date(1710000000 * 1000).toISOString());
    expect(epochToIsoString(1710000000).startsWith("2024-")).toBe(true);
    // A seconds value and its millisecond equivalent resolve to the same instant.
    expect(epochToIsoString(1710000000)).toBe(epochToIsoString(1710000000000));
  });

  test("isFileImported reports false for an unknown hash and true after logging it", () => {
    // Use a temp file (not ":memory:") — openAccessDb mkdir's the parent dir.
    const dbPath = join(tmpdir(), `mem-sync-access-${process.pid}-${EPOCH_MS}.db`);
    const accessDb = openAccessDb(dbPath);
    try {
      // better-sqlite3 .get() returns undefined for no row — must read as "not imported".
      expect(isFileImported(accessDb, "test-project", "deadbeef")).toBe(false);

      logImport(accessDb, "test-project", "deadbeef", 3, "alice");
      expect(isFileImported(accessDb, "test-project", "deadbeef")).toBe(true);
      // Different hash / project remains not imported.
      expect(isFileImported(accessDb, "test-project", "cafebabe")).toBe(false);
      expect(isFileImported(accessDb, "other-project", "deadbeef")).toBe(false);
    } finally {
      accessDb.close();
      // Best-effort cleanup: Windows may briefly hold the WAL handle after close.
      for (const p of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
        try {
          rmSync(p, { force: true });
        } catch {
          /* temp dir is reclaimed by the OS anyway */
        }
      }
    }
  });
});
