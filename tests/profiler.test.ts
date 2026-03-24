import { describe, test, expect } from "bun:test";
import {
  generateProfile,
  generateTeamOverview,
  generateTeamConcepts,
  getDevNames,
  renderProfileMarkdown,
} from "../src/core/profiler";
import type { Observation } from "../src/types/observation";

let obsCounter = 0;

function makeObs(overrides: Partial<Observation> = {}): Observation {
  obsCounter++;
  return {
    id: obsCounter,
    memory_session_id: `session-${obsCounter}`,
    type: "decision",
    title: `Test Observation ${obsCounter}`,
    narrative: "Some narrative",
    text: null,
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    created_at_epoch: Math.floor(Date.now() / 1000) + obsCounter,
    ...overrides,
  };
}

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

function makeContrib(devName: string, observations: Observation[]) {
  return { devName, observations, exportedAt: NOW };
}

describe("profiler", () => {
  describe("generateProfile", () => {
    test("produces valid profile for a single dev", () => {
      const obs = [
        makeObs({ id: 1, type: "decision", title: "Auth decision", concepts: '["auth","security"]', files_read: '["src/auth/login.ts"]', created_at_epoch: NOW - DAY }),
        makeObs({ id: 2, type: "bugfix", title: "Fix crash", concepts: '["error-handling"]', files_read: '["src/api/handler.ts"]', created_at_epoch: NOW - DAY * 7 }),
        makeObs({ id: 3, type: "feature", title: "Add dashboard", concepts: '["dashboard","ui"]', files_read: '["src/dashboard/index.html"]', created_at_epoch: NOW - DAY * 14 }),
      ];

      const contribs = [makeContrib("alice", obs)];
      const merged = obs; // All survived

      const profile = generateProfile("alice", "test-project", contribs, merged, contribs);

      expect(profile.devName).toBe("alice");
      expect(profile.project).toBe("test-project");
      expect(profile.knowledgeSpectrum.total).toBe(3);
      expect(profile.knowledgeSpectrum.types.length).toBeGreaterThan(0);
      expect(profile.conceptMap.totalUniqueConcepts).toBe(5);
      expect(profile.fileCoverage.totalFiles).toBe(3);
      expect(profile.temporalPattern.weekly.length).toBeGreaterThan(0);
      expect(profile.survivalRate.exported).toBe(3);
      expect(profile.survivalRate.survived).toBe(3);
      expect(profile.survivalRate.rate).toBe(1);
    });

    test("computes survival rate correctly when some observations not in merged", () => {
      const devObs = [
        makeObs({ id: 1, memory_session_id: "session-1", title: "Obs A", created_at_epoch: NOW }),
        makeObs({ id: 2, memory_session_id: "session-2", title: "Obs B", created_at_epoch: NOW }),
        makeObs({ id: 3, memory_session_id: "session-3", title: "Obs C", created_at_epoch: NOW }),
      ];

      const merged = [devObs[0]]; // Only first survived
      const contribs = [makeContrib("bob", devObs)];

      const profile = generateProfile("bob", "proj", contribs, merged, contribs);

      expect(profile.survivalRate.exported).toBe(3);
      expect(profile.survivalRate.survived).toBe(1);
      expect(profile.survivalRate.rate).toBeCloseTo(0.333, 2);
    });

    test("handles empty observations", () => {
      const contribs = [makeContrib("empty-dev", [])];
      const profile = generateProfile("empty-dev", "proj", contribs, [], contribs);

      expect(profile.knowledgeSpectrum.total).toBe(0);
      expect(profile.conceptMap.totalUniqueConcepts).toBe(0);
      expect(profile.fileCoverage.totalFiles).toBe(0);
      expect(profile.temporalPattern.weekly).toEqual([]);
      expect(profile.survivalRate.rate).toBe(0);
    });

    test("knowledge spectrum compares dev vs team", () => {
      const aliceObs = [
        makeObs({ type: "decision" }),
        makeObs({ type: "decision" }),
        makeObs({ type: "bugfix" }),
      ];
      const bobObs = [
        makeObs({ type: "feature" }),
        makeObs({ type: "feature" }),
        makeObs({ type: "feature" }),
      ];

      const allContribs = [makeContrib("alice", aliceObs), makeContrib("bob", bobObs)];

      const profile = generateProfile("alice", "proj", allContribs, [], allContribs);

      // Alice has 2 decisions (66.7%) but team avg should be lower since bob has none
      const decisionType = profile.knowledgeSpectrum.types.find((t) => t.type === "decision");
      expect(decisionType).toBeDefined();
      expect(decisionType!.count).toBe(2);
      expect(decisionType!.percentage).toBeGreaterThan(50);
    });

    test("concept map identifies gaps", () => {
      const aliceObs = [makeObs({ concepts: '["auth"]' })];
      const bobObs = [
        makeObs({ concepts: '["auth","testing"]' }),
        makeObs({ concepts: '["testing"]' }),
      ];

      const allContribs = [makeContrib("alice", aliceObs), makeContrib("bob", bobObs)];
      const profile = generateProfile("alice", "proj", allContribs, [], allContribs);

      const testingConcept = profile.conceptMap.concepts.find((c) => c.concept === "testing");
      expect(testingConcept).toBeDefined();
      expect(testingConcept!.isGap).toBe(true);
      expect(testingConcept!.devCount).toBe(0);
    });

    test("file coverage computes specialization", () => {
      const obs = [
        makeObs({ files_read: '["src/api/a.ts","src/api/b.ts","src/api/c.ts"]' }),
        makeObs({ files_read: '["src/auth/login.ts"]' }),
      ];
      const contribs = [makeContrib("dev", obs)];
      const profile = generateProfile("dev", "proj", contribs, [], contribs);

      expect(profile.fileCoverage.totalFiles).toBe(4);
      expect(profile.fileCoverage.directories.length).toBe(2);
      // Should have high specialization (concentrated in api dir)
      expect(profile.fileCoverage.specializationIndex).toBeGreaterThan(0);
    });

    test("temporal pattern computes consistency", () => {
      // Use a fixed Wednesday so all 3 days (Wed, Tue, Mon) fall in the same ISO week
      const wednesday = (() => {
        const d = new Date(NOW * 1000);
        // Shift to Wednesday of current week (day 3 in ISO, enough room for -2 days)
        const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
        const daysToWed = (3 - dayOfWeek + 7) % 7 || 7; // next Wednesday
        d.setUTCDate(d.getUTCDate() + daysToWed);
        d.setUTCHours(12, 0, 0, 0);
        return Math.floor(d.getTime() / 1000);
      })();

      // All 3 observations within Mon-Wed of the same ISO week
      const obs = [
        makeObs({ created_at_epoch: wednesday }),
        makeObs({ created_at_epoch: wednesday - DAY }),
        makeObs({ created_at_epoch: wednesday - DAY * 2 }),
      ];
      const contribs = [makeContrib("dev", obs)];
      const profile = generateProfile("dev", "proj", contribs, [], contribs);

      expect(profile.temporalPattern.consistency).toBe(1);
    });
  });

  describe("generateTeamOverview", () => {
    test("computes team averages", () => {
      const aliceObs = [makeObs(), makeObs(), makeObs()];
      const bobObs = [makeObs()];
      const allContribs = [makeContrib("alice", aliceObs), makeContrib("bob", bobObs)];

      const aliceProfile = generateProfile("alice", "proj", allContribs, aliceObs, allContribs);
      const bobProfile = generateProfile("bob", "proj", allContribs, bobObs, allContribs);

      const overview = generateTeamOverview("proj", [aliceProfile, bobProfile], allContribs);

      expect(overview.totalDevs).toBe(2);
      expect(overview.avgObservationsPerDev).toBe(2);
    });
  });

  describe("generateTeamConcepts", () => {
    test("identifies knowledge gaps (single contributor)", () => {
      const aliceObs = [makeObs({ concepts: '["auth","db"]' }), makeObs({ concepts: '["db"]' })];
      const bobObs = [makeObs({ concepts: '["auth"]' })];

      const contribs = [makeContrib("alice", aliceObs), makeContrib("bob", bobObs)];
      const result = generateTeamConcepts("proj", contribs);

      // "db" is only contributed by alice -> knowledge gap
      const dbGap = result.knowledgeGaps.find((g) => g.concept === "db");
      expect(dbGap).toBeDefined();
      expect(dbGap!.contributorCount).toBe(1);
    });
  });

  describe("getDevNames", () => {
    test("returns unique sorted dev names", () => {
      const contribs = [
        makeContrib("charlie", []),
        makeContrib("alice", []),
        makeContrib("alice", []),
        makeContrib("bob", []),
      ];
      expect(getDevNames(contribs)).toEqual(["alice", "bob", "charlie"]);
    });
  });

  describe("renderProfileMarkdown", () => {
    test("renders valid markdown", () => {
      const obs = [
        makeObs({ type: "decision", concepts: '["auth"]', files_read: '["src/a.ts"]' }),
      ];
      const contribs = [makeContrib("dev", obs)];
      const profile = generateProfile("dev", "proj", contribs, obs, contribs);

      const md = renderProfileMarkdown(profile);

      expect(md).toContain("# Developer Profile: dev");
      expect(md).toContain("## Knowledge Spectrum");
      expect(md).toContain("## Concept Map");
      expect(md).toContain("## File Coverage");
      expect(md).toContain("## Temporal Pattern");
      expect(md).toContain("## Contribution Survival Rate");
    });
  });
});
