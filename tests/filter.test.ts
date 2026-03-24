import { describe, test, expect } from "bun:test";
import { matchesFilter } from "../src/core/filter";
import type { Observation } from "../src/types/observation";

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    memory_session_id: "session-1",
    type: "decision",
    title: "Test Observation",
    narrative: "Some narrative text",
    text: "Some body text",
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    created_at_epoch: Date.now() / 1000,
    ...overrides,
  };
}

describe("matchesFilter", () => {
  test("empty filters match nothing", () => {
    const obs = makeObs();
    expect(matchesFilter(obs, { types: [], keywords: [], tags: [] })).toBe(false);
  });

  test("matches by type", () => {
    const obs = makeObs({ type: "bugfix" });
    expect(matchesFilter(obs, { types: ["bugfix"], keywords: [], tags: [] })).toBe(true);
  });

  test("does not match wrong type", () => {
    const obs = makeObs({ type: "change" });
    expect(matchesFilter(obs, { types: ["bugfix"], keywords: [], tags: [] })).toBe(false);
  });

  test("matches by keyword in title", () => {
    const obs = makeObs({ title: "Architecture decision for auth" });
    expect(matchesFilter(obs, { types: [], keywords: ["architecture"], tags: [] })).toBe(true);
  });

  test("matches by keyword in narrative", () => {
    const obs = makeObs({ narrative: "This involves a breaking change" });
    expect(matchesFilter(obs, { types: [], keywords: ["breaking"], tags: [] })).toBe(true);
  });

  test("matches by keyword in text", () => {
    const obs = makeObs({ text: "migration step required" });
    expect(matchesFilter(obs, { types: [], keywords: ["migration"], tags: [] })).toBe(true);
  });

  test("keyword match is case-insensitive", () => {
    const obs = makeObs({ title: "ARCHITECTURE review" });
    expect(matchesFilter(obs, { types: [], keywords: ["architecture"], tags: [] })).toBe(true);
  });

  test("matches by tag in text", () => {
    const obs = makeObs({ text: "This should be #shared with team" });
    expect(matchesFilter(obs, { types: [], keywords: [], tags: ["#shared"] })).toBe(true);
  });

  test("matches by tag in narrative", () => {
    const obs = makeObs({ narrative: "#shared observation" });
    expect(matchesFilter(obs, { types: [], keywords: [], tags: ["#shared"] })).toBe(true);
  });

  test("matches by tag in title", () => {
    const obs = makeObs({ title: "#shared: Auth Pattern" });
    expect(matchesFilter(obs, { types: [], keywords: [], tags: ["#shared"] })).toBe(true);
  });

  test("OR logic: matches if ANY filter matches", () => {
    const obs = makeObs({ type: "change", title: "minor update", text: "#shared" });
    expect(matchesFilter(obs, { types: ["decision"], keywords: ["architecture"], tags: ["#shared"] })).toBe(true);
  });

  test("handles null fields gracefully", () => {
    const obs = makeObs({ title: "Auth Pattern", narrative: null, text: null });
    expect(matchesFilter(obs, { types: [], keywords: ["test"], tags: [] })).toBe(false);
  });
});
