import { describe, test, expect } from "bun:test";
import {
  deduplicateObservations,
  applyEvictionCap,
} from "../src/core/merger";
import type { Observation, ScoredObservation } from "../src/types/observation";
import type { EvictionCapOptions } from "../src/core/merger";

const NOW = 1700000000; // fixed epoch for deterministic tests

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    memory_session_id: "session-1",
    type: "decision",
    title: "Test",
    narrative: null,
    text: null,
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    created_at_epoch: NOW,
    ...overrides,
  };
}

const DEFAULT_WEIGHTS = { typeWeight: 0.3, recencyWeight: 0.2, thirdWeight: 0.5 };

describe("deduplicateObservations", () => {
  test("removes duplicates by composite key (memory_session_id + title + created_at_epoch)", () => {
    const obs1 = makeObs({ id: 1, memory_session_id: "session-10", title: "A", created_at_epoch: 100 });
    const obs2 = makeObs({ id: 2, memory_session_id: "session-10", title: "A", created_at_epoch: 100 });
    const obs3 = makeObs({ id: 3, memory_session_id: "session-20", title: "B", created_at_epoch: 200 });

    const result = deduplicateObservations([obs1, obs2, obs3]);
    expect(result).toHaveLength(2);
    expect(result.map((o) => o.id)).toEqual([1, 3]);
  });

  test("keeps first occurrence when duplicates exist", () => {
    const obs1 = makeObs({
      id: 1, memory_session_id: "session-10", title: "A", created_at_epoch: 100,
      narrative: "First version",
    });
    const obs2 = makeObs({
      id: 2, memory_session_id: "session-10", title: "A", created_at_epoch: 100,
      narrative: "Second version",
    });

    const result = deduplicateObservations([obs1, obs2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].narrative).toBe("First version");
  });

  test("handles empty array", () => {
    const result = deduplicateObservations([]);
    expect(result).toEqual([]);
  });

  test("handles no duplicates (returns all)", () => {
    const obs1 = makeObs({ id: 1, memory_session_id: "session-1", title: "A", created_at_epoch: 100 });
    const obs2 = makeObs({ id: 2, memory_session_id: "session-2", title: "B", created_at_epoch: 200 });
    const obs3 = makeObs({ id: 3, memory_session_id: "session-3", title: "C", created_at_epoch: 300 });

    const result = deduplicateObservations([obs1, obs2, obs3]);
    expect(result).toHaveLength(3);
    expect(result.map((o) => o.id)).toEqual([1, 2, 3]);
  });

  test("considers different memory_session_id as distinct even if title and epoch match", () => {
    const obs1 = makeObs({ id: 1, memory_session_id: "session-10", title: "A", created_at_epoch: 100 });
    const obs2 = makeObs({ id: 2, memory_session_id: "session-20", title: "A", created_at_epoch: 100 });

    const result = deduplicateObservations([obs1, obs2]);
    expect(result).toHaveLength(2);
  });
});

describe("applyEvictionCap", () => {
  test("returns all when count is under cap (hook mode)", () => {
    const observations = [
      makeObs({ id: 1, type: "decision", created_at_epoch: NOW }),
      makeObs({ id: 2, type: "bugfix", created_at_epoch: NOW - 86400 }),
    ];

    const result = applyEvictionCap({
      observations,
      cap: 10,
      mode: "hook",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      accessCounts: new Map([[1, 5], [2, 3]]),
      maxAccess: 5,
    });

    expect(result).toHaveLength(2);
    // Should be sorted by score descending
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  test("evicts lowest-scoring observations when over cap", () => {
    // Create 5 observations with different scores (via type and recency)
    const observations = [
      makeObs({ id: 1, type: "decision", created_at_epoch: NOW }),       // high score
      makeObs({ id: 2, type: "change", created_at_epoch: NOW - 365 * 86400 }), // low score
      makeObs({ id: 3, type: "bugfix", created_at_epoch: NOW }),          // medium-high
      makeObs({ id: 4, type: "change", created_at_epoch: NOW - 180 * 86400 }), // low-medium
      makeObs({ id: 5, type: "decision", created_at_epoch: NOW - 7 * 86400 }), // high
    ];

    const result = applyEvictionCap({
      observations,
      cap: 3,
      mode: "hook",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      accessCounts: new Map([[1, 5], [2, 1], [3, 4], [4, 1], [5, 3]]),
      maxAccess: 5,
    });

    expect(result).toHaveLength(3);
    // The two low-scoring change observations (ids 2, 4) should be evicted
    const resultIds = result.map((o) => o.id);
    expect(resultIds).not.toContain(2);
    expect(resultIds).not.toContain(4);
    // Remaining should be sorted by score desc
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    expect(result[1].score).toBeGreaterThanOrEqual(result[2].score);
  });

  test("preserves #keep tagged observations even when they would be evicted", () => {
    // A low-scoring observation with #keep tag should survive
    const observations = [
      makeObs({ id: 1, type: "decision", created_at_epoch: NOW }),
      makeObs({ id: 2, type: "change", created_at_epoch: NOW - 365 * 86400, title: "#keep important" }),
      makeObs({ id: 3, type: "bugfix", created_at_epoch: NOW }),
    ];

    const result = applyEvictionCap({
      observations,
      cap: 2,
      mode: "hook",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      accessCounts: new Map([[1, 5], [2, 0], [3, 4]]),
      maxAccess: 5,
    });

    // All 3 would exceed cap=2, but the #keep observation must survive
    // So we keep: the #keep obs + the top 1 scored non-keep obs = 2 survivors min
    // Actually with cap=2, we keep 2 total: #keep obs always survives,
    // then fill remaining with top-scored non-keep
    expect(result).toHaveLength(2);
    const resultIds = result.map((o) => o.id);
    expect(resultIds).toContain(2); // #keep survives
    // The #keep observation should have Infinity score
    const keepObs = result.find((o) => o.id === 2)!;
    expect(keepObs.score).toBe(Infinity);
  });

  test("handles passive mode with diffusion-based scoring", () => {
    const observations = [
      makeObs({ id: 1, type: "decision", created_at_epoch: NOW }),
      makeObs({ id: 2, type: "change", created_at_epoch: NOW - 180 * 86400 }),
      makeObs({ id: 3, type: "bugfix", created_at_epoch: NOW }),
    ];

    const result = applyEvictionCap({
      observations,
      cap: 2,
      mode: "passive",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      devCounts: new Map([[1, 8], [2, 1], [3, 6]]),
      totalDevs: 10,
    });

    expect(result).toHaveLength(2);
    // The low-scoring change observation should be evicted
    const resultIds = result.map((o) => o.id);
    expect(resultIds).not.toContain(2);
    // Should be sorted by score desc
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  test("handles hook mode with access-based scoring", () => {
    const observations = [
      makeObs({ id: 1, type: "decision", created_at_epoch: NOW }),
      makeObs({ id: 2, type: "decision", created_at_epoch: NOW }),
      makeObs({ id: 3, type: "decision", created_at_epoch: NOW }),
    ];

    // All same type and recency, so third weight (access) differentiates
    const result = applyEvictionCap({
      observations,
      cap: 2,
      mode: "hook",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      accessCounts: new Map([[1, 10], [2, 1], [3, 5]]),
      maxAccess: 10,
    });

    expect(result).toHaveLength(2);
    const resultIds = result.map((o) => o.id);
    // id=2 has lowest access, should be evicted
    expect(resultIds).toContain(1);
    expect(resultIds).toContain(3);
    expect(resultIds).not.toContain(2);
  });

  test("keep-tagged observations count toward cap", () => {
    // If cap=2 and we have 3 #keep observations, all 3 survive (keep always wins)
    const observations = [
      makeObs({ id: 1, title: "#keep first" }),
      makeObs({ id: 2, title: "#keep second" }),
      makeObs({ id: 3, title: "#keep third" }),
    ];

    const result = applyEvictionCap({
      observations,
      cap: 2,
      mode: "hook",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      accessCounts: new Map(),
      maxAccess: 0,
    });

    // All #keep observations survive even if over cap
    expect(result).toHaveLength(3);
    expect(result.every((o) => o.score === Infinity)).toBe(true);
  });

  test("returns empty array for empty input", () => {
    const result = applyEvictionCap({
      observations: [],
      cap: 10,
      mode: "hook",
      weights: DEFAULT_WEIGHTS,
      keepTags: ["#keep"],
      nowEpoch: NOW,
      accessCounts: new Map(),
      maxAccess: 0,
    });

    expect(result).toEqual([]);
  });
});
