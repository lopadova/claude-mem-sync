import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { EXPORT_JSON_VERSION, PACKAGE_VERSION } from "../../src/core/constants";
import { deduplicateObservations, applyEvictionCap } from "../../src/core/merger";
import type { ExportFile, Observation } from "../../src/types/observation";
import type { MergeState } from "../../src/types/merge-state";

const TEST_DIR = join(tmpdir(), "ci-merge-test-" + Date.now());

function makeContribution(devName: string, project: string, observations: Partial<Observation>[]): ExportFile {
  return {
    version: EXPORT_JSON_VERSION,
    exportedBy: devName,
    exportedAt: new Date().toISOString(),
    exportedAtEpoch: Math.floor(Date.now() / 1000),
    project,
    packageVersion: PACKAGE_VERSION,
    filters: { types: [], keywords: [], tags: [] },
    observations: observations.map((obs, i) => ({
      id: obs.id ?? i + 1,
      memory_session_id: obs.memory_session_id ?? `session-${i + 1}`,
      type: obs.type ?? "decision",
      title: obs.title ?? `Observation ${i + 1}`,
      narrative: obs.narrative ?? null,
      text: obs.text ?? null,
      facts: obs.facts ?? null,
      concepts: obs.concepts ?? null,
      files_read: obs.files_read ?? null,
      files_modified: obs.files_modified ?? null,
      created_at_epoch: obs.created_at_epoch ?? 1710000000 + i * 1000,
    })),
    observationCount: observations.length,
  };
}

function writeContribution(baseDir: string, project: string, devName: string, filename: string, data: ExportFile): string {
  const dir = join(baseDir, "contributions", project, devName);
  mkdirSync(dir, { recursive: true });
  const filepath = join(dir, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  return filepath;
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("CI merge integration", () => {
  test("merges contributions from multiple developers with dedup", () => {
    const contribDir = join(TEST_DIR, "contributions");

    // Alice's contribution
    const alice = makeContribution("alice", "project-alpha", [
      { memory_session_id: "session-1", title: "Shared Decision", created_at_epoch: 1710000000, type: "decision" },
      { memory_session_id: "session-2", title: "Alice Only", created_at_epoch: 1710001000, type: "bugfix" },
    ]);
    writeContribution(TEST_DIR, "project-alpha", "alice", "2026-03-14.json", alice);

    // Bob's contribution (includes a duplicate)
    const bob = makeContribution("bob", "project-alpha", [
      { memory_session_id: "session-1", title: "Shared Decision", created_at_epoch: 1710000000, type: "decision" }, // dup
      { memory_session_id: "session-3", title: "Bob Only", created_at_epoch: 1710002000, type: "discovery" },
    ]);
    writeContribution(TEST_DIR, "project-alpha", "bob", "2026-03-14.json", bob);

    // Simulate the merge logic
    const allObs: Observation[] = [...alice.observations, ...bob.observations];
    const deduped = deduplicateObservations(allObs);

    expect(deduped.length).toBe(3); // "Shared Decision" deduped, + Alice Only + Bob Only
    expect(deduped.find((o) => o.title === "Shared Decision")).toBeDefined();
    expect(deduped.find((o) => o.title === "Alice Only")).toBeDefined();
    expect(deduped.find((o) => o.title === "Bob Only")).toBeDefined();
  });

  test("enforces cap with eviction scoring", () => {
    const cap = 3;
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Create 5 observations, cap at 3
    const observations: Observation[] = [
      { id: 1, memory_session_id: "session-1", type: "decision", title: "Important Decision", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: nowEpoch - 86400 },
      { id: 2, memory_session_id: "session-2", type: "change", title: "Old Change", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: nowEpoch - 86400 * 365 },
      { id: 3, memory_session_id: "session-3", type: "bugfix", title: "Recent Bugfix", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: nowEpoch - 86400 * 7 },
      { id: 4, memory_session_id: "session-4", type: "change", title: "Very Old Change", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: nowEpoch - 86400 * 730 },
      { id: 5, memory_session_id: "session-5", type: "discovery", title: "#keep Protected", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: nowEpoch - 86400 * 1000 },
    ];

    const devCounts = new Map<number, number>([
      [1, 5], [2, 1], [3, 3], [4, 1], [5, 1],
    ]);

    const result = applyEvictionCap({
      observations,
      cap,
      mode: "passive",
      weights: { typeWeight: 0.4, recencyWeight: 0.3, thirdWeight: 0.3 },
      keepTags: ["#keep"],
      nowEpoch,
      devCounts,
      totalDevs: 5,
    });

    // Should have exactly 3 (cap) observations
    expect(result.length).toBe(cap);

    // The #keep observation must survive
    expect(result.find((o) => o.title === "#keep Protected")).toBeDefined();

    // The "Very Old Change" (low type weight + very old) should be evicted
    expect(result.find((o) => o.title === "Very Old Change")).toBeUndefined();
  });

  test("writes valid merged output file", () => {
    const outputDir = join(TEST_DIR, "merged");
    const projectName = "project-alpha";
    const mergedPath = join(outputDir, projectName, "latest.json");

    const observations: Observation[] = [
      { id: 1, memory_session_id: "session-1", type: "decision", title: "Test", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: 1710000000 },
    ];

    const output: ExportFile = {
      version: EXPORT_JSON_VERSION,
      exportedBy: "ci-merge",
      exportedAt: new Date().toISOString(),
      exportedAtEpoch: Math.floor(Date.now() / 1000),
      project: projectName,
      packageVersion: PACKAGE_VERSION,
      filters: { types: [], keywords: [], tags: [] },
      observations,
      observationCount: observations.length,
    };

    mkdirSync(join(outputDir, projectName), { recursive: true });
    writeFileSync(mergedPath, JSON.stringify(output, null, 2), "utf-8");

    // Verify the file
    expect(existsSync(mergedPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(mergedPath, "utf-8")) as ExportFile;
    expect(parsed.version).toBe(EXPORT_JSON_VERSION);
    expect(parsed.observationCount).toBe(1);
    expect(parsed.observations[0].title).toBe("Test");
  });

  test("merge state tracks processed files", () => {
    const state: MergeState = {
      lastMergedAt: 0,
      schemaVersion: 1,
      projects: {},
    };

    // Simulate processing a file
    const projectName = "project-alpha";
    if (!state.projects[projectName]) {
      state.projects[projectName] = {
        processedFiles: {},
        totalObservations: 0,
        cap: 500,
        lastEvictionAt: null,
      };
    }

    state.projects[projectName].processedFiles["contributions/project-alpha/alice/2026-03-14.json"] = {
      hash: "sha256:abc123",
      processedAt: Math.floor(Date.now() / 1000),
      observationsCount: 5,
    };
    state.projects[projectName].totalObservations = 5;
    state.lastMergedAt = Math.floor(Date.now() / 1000);

    // Serialize and verify
    const json = JSON.stringify(state, null, 2);
    const parsed = JSON.parse(json) as MergeState;

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.lastMergedAt).toBeGreaterThan(0);
    expect(Object.keys(parsed.projects[projectName].processedFiles).length).toBe(1);
    expect(parsed.projects[projectName].totalObservations).toBe(5);
  });

  test("merges with existing latest.json", () => {
    // Existing merged observations
    const existing: Observation[] = [
      { id: 1, memory_session_id: "session-1", type: "decision", title: "Old Decision", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: 1709000000 },
      { id: 2, memory_session_id: "session-2", type: "bugfix", title: "Old Bugfix", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: 1709001000 },
    ];

    // New contribution
    const newObs: Observation[] = [
      { id: 1, memory_session_id: "session-1", type: "decision", title: "Old Decision", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: 1709000000 }, // dup
      { id: 3, memory_session_id: "session-3", type: "discovery", title: "New Discovery", narrative: null, text: null, facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: 1710000000 },
    ];

    const combined = [...existing, ...newObs];
    const deduped = deduplicateObservations(combined);

    expect(deduped.length).toBe(3);
    expect(deduped.find((o) => o.title === "New Discovery")).toBeDefined();
  });
});
