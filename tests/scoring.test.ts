import { describe, test, expect } from "bun:test";
import {
  calculateTypeWeight,
  calculateRecencyWeight,
  calculateAccessWeight,
  calculateDiffusionWeight,
  calculateScore,
  hasKeepTag,
} from "../src/core/scoring";
import type { Observation } from "../src/types/observation";

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1, memory_session_id: "session-1", type: "decision",
    title: "Test", narrative: null, text: null,
    facts: null, concepts: null, files_read: null, files_modified: null,
    created_at_epoch: Date.now() / 1000,
    ...overrides,
  };
}

describe("calculateTypeWeight", () => {
  test("decision = 1.0", () => expect(calculateTypeWeight("decision")).toBe(1.0));
  test("bugfix = 0.9", () => expect(calculateTypeWeight("bugfix")).toBe(0.9));
  test("feature = 0.7", () => expect(calculateTypeWeight("feature")).toBe(0.7));
  test("discovery = 0.5", () => expect(calculateTypeWeight("discovery")).toBe(0.5));
  test("refactor = 0.4", () => expect(calculateTypeWeight("refactor")).toBe(0.4));
  test("change = 0.3", () => expect(calculateTypeWeight("change")).toBe(0.3));
  test("unknown type = 0.3", () => expect(calculateTypeWeight("unknown")).toBe(0.3));
});

describe("calculateRecencyWeight", () => {
  test("brand new = ~1.0", () => {
    const now = Date.now() / 1000;
    expect(calculateRecencyWeight(now, now)).toBeCloseTo(1.0, 1);
  });

  test("1 week old ~= 0.95", () => {
    const now = Date.now() / 1000;
    const oneWeekAgo = now - 7 * 86400;
    const weight = calculateRecencyWeight(oneWeekAgo, now);
    expect(weight).toBeGreaterThan(0.9);
    expect(weight).toBeLessThan(1.0);
  });

  test("1 month old ~= 0.79", () => {
    const now = Date.now() / 1000;
    const oneMonthAgo = now - 30 * 86400;
    const weight = calculateRecencyWeight(oneMonthAgo, now);
    expect(weight).toBeGreaterThan(0.7);
    expect(weight).toBeLessThan(0.85);
  });

  test("6 months old ~= 0.57", () => {
    const now = Date.now() / 1000;
    const sixMonthsAgo = now - 180 * 86400;
    const weight = calculateRecencyWeight(sixMonthsAgo, now);
    expect(weight).toBeGreaterThan(0.5);
    expect(weight).toBeLessThan(0.65);
  });

  test("decays logarithmically, never reaches 0", () => {
    const now = Date.now() / 1000;
    const threeYearsAgo = now - 1095 * 86400;
    const weight = calculateRecencyWeight(threeYearsAgo, now);
    expect(weight).toBeGreaterThan(0.3);
  });

  // Regression: claude-mem stores created_at_epoch in MILLISECONDS, but nowEpoch
  // is passed in seconds. Without normalization, (nowSecs - createdMs) is hugely
  // negative -> daysOld clamps to 0 -> weight 1.0, so imported observations never
  // decay and are effectively immortal during cap-enforcement eviction.
  test("a 1-year-old observation decays the same whether its epoch is seconds or ms", () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 86400;
    const oldSecs = nowSecs - oneYear;
    const oldMs = oldSecs * 1000;

    const weightFromSeconds = calculateRecencyWeight(oldSecs, nowSecs);
    const weightFromMs = calculateRecencyWeight(oldMs, nowSecs);

    expect(weightFromMs).toBeCloseTo(weightFromSeconds, 5);
    expect(weightFromMs).toBeLessThan(0.6); // genuinely decayed (~0.46), not 1.0
  });

  test("a brand-new millisecond observation scores ~1.0 (not clamped wrongly)", () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    expect(calculateRecencyWeight(nowSecs * 1000, nowSecs)).toBeCloseTo(1.0, 2);
  });

  test("seconds and millisecond epochs give identical recency across many ages", () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    for (const days of [1, 7, 30, 90, 180, 365, 1095]) {
      const oldSecs = nowSecs - days * 86400;
      expect(calculateRecencyWeight(oldSecs * 1000, nowSecs)).toBeCloseTo(
        calculateRecencyWeight(oldSecs, nowSecs),
        6,
      );
    }
  });

  test("nowEpoch passed in milliseconds still produces correct recency", () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const oneMonthAgoSecs = nowSecs - 30 * 86400;
    // Defensive: even if a caller passes nowEpoch in ms, normalization keeps it correct.
    expect(calculateRecencyWeight(oneMonthAgoSecs * 1000, nowSecs * 1000)).toBeCloseTo(
      calculateRecencyWeight(oneMonthAgoSecs, nowSecs),
      6,
    );
  });
});

describe("calculateScore with millisecond epochs", () => {
  test("an old ms observation scores below a fresh one (passive mode)", () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const weights = { typeWeight: 0.4, recencyWeight: 0.3, thirdWeight: 0.3 };
    const score = (epochMs: number) =>
      calculateScore({
        typeWeight: calculateTypeWeight("change"),
        recencyWeight: calculateRecencyWeight(epochMs, nowSecs),
        diffusionWeight: 0.5,
        weights,
        mode: "passive",
      });

    const fresh = score(nowSecs * 1000);
    const old = score((nowSecs - 365 * 86400) * 1000);
    expect(fresh).toBeGreaterThan(old);
  });
});

describe("calculateAccessWeight", () => {
  test("max accesses = 1.0", () => {
    expect(calculateAccessWeight(10, 10)).toBe(1.0);
  });

  test("no accesses = 0.0", () => {
    expect(calculateAccessWeight(0, 10)).toBe(0.0);
  });

  test("half of max = 0.5", () => {
    expect(calculateAccessWeight(5, 10)).toBe(0.5);
  });

  test("max is 0 returns 0", () => {
    expect(calculateAccessWeight(0, 0)).toBe(0.0);
  });
});

describe("calculateDiffusionWeight", () => {
  test("all devs have it = 1.0", () => {
    expect(calculateDiffusionWeight(12, 12)).toBe(1.0);
  });

  test("no devs have it = 0.0", () => {
    expect(calculateDiffusionWeight(0, 12)).toBe(0.0);
  });

  test("8 of 12 devs ~= 0.67", () => {
    expect(calculateDiffusionWeight(8, 12)).toBeCloseTo(0.67, 1);
  });
});

describe("calculateScore", () => {
  test("hook mode uses access weight", () => {
    const score = calculateScore({
      typeWeight: 1.0,
      recencyWeight: 1.0,
      accessWeight: 1.0,
      weights: { typeWeight: 0.3, recencyWeight: 0.2, thirdWeight: 0.5 },
      mode: "hook",
    });
    expect(score).toBeCloseTo(1.0, 2);
  });

  test("passive mode uses diffusion weight", () => {
    const score = calculateScore({
      typeWeight: 1.0,
      recencyWeight: 1.0,
      diffusionWeight: 1.0,
      weights: { typeWeight: 0.4, recencyWeight: 0.3, thirdWeight: 0.3 },
      mode: "passive",
    });
    expect(score).toBeCloseTo(1.0, 2);
  });

  test("custom weights are applied correctly", () => {
    const score = calculateScore({
      typeWeight: 0.5,
      recencyWeight: 0.8,
      accessWeight: 0.3,
      weights: { typeWeight: 0.3, recencyWeight: 0.2, thirdWeight: 0.5 },
      mode: "hook",
    });
    // 0.5*0.3 + 0.8*0.2 + 0.3*0.5 = 0.15 + 0.16 + 0.15 = 0.46
    expect(score).toBeCloseTo(0.46, 2);
  });
});

describe("hasKeepTag", () => {
  test("finds #keep in title", () => {
    const obs = makeObs({ title: "#keep this forever" });
    expect(hasKeepTag(obs, ["#keep"])).toBe(true);
  });

  test("finds #keep in narrative", () => {
    const obs = makeObs({ narrative: "Important #keep" });
    expect(hasKeepTag(obs, ["#keep"])).toBe(true);
  });

  test("finds #keep in text", () => {
    const obs = makeObs({ text: "#keep" });
    expect(hasKeepTag(obs, ["#keep"])).toBe(true);
  });

  test("returns false when no keep tag", () => {
    const obs = makeObs({ title: "Normal observation" });
    expect(hasKeepTag(obs, ["#keep"])).toBe(false);
  });

  test("supports custom keep tags", () => {
    const obs = makeObs({ text: "#important decision" });
    expect(hasKeepTag(obs, ["#keep", "#important"])).toBe(true);
  });
});
