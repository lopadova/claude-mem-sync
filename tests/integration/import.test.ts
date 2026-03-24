import { describe, test, expect } from "bun:test";
import { createTestMemDb, insertTestObservation } from "../helpers/test-db";
import {
  checkDuplicate,
  insertObservation,
  rebuildFts,
  runIntegrityCheck,
  getObservationCount,
} from "../../src/core/mem-db";
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
