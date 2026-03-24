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
