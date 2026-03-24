import { describe, test, expect } from "bun:test";
import { parseDistillationResponse } from "../src/core/distiller";
import {
  buildDistillationSystemPrompt,
  buildDistillationUserPrompt,
  estimateTokens,
} from "../src/core/prompts/distillation-system";
import type { Observation } from "../src/types/observation";

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    memory_session_id: "session-1",
    type: "decision",
    title: "Test",
    narrative: "Some narrative",
    text: null,
    facts: null,
    concepts: null,
    files_read: null,
    files_modified: null,
    created_at_epoch: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe("distillation prompts", () => {
  test("buildDistillationSystemPrompt returns non-empty string", () => {
    const prompt = buildDistillationSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("rules");
    expect(prompt).toContain("knowledgeSections");
  });

  test("buildDistillationUserPrompt includes observations", () => {
    const obs = [makeObs({ title: "Auth Decision" }), makeObs({ title: "DB Fix" })];
    const prompt = buildDistillationUserPrompt(obs, "test-project", []);

    expect(prompt).toContain("test-project");
    expect(prompt).toContain("Auth Decision");
    expect(prompt).toContain("DB Fix");
    expect(prompt).toContain("2 observations");
  });

  test("buildDistillationUserPrompt filters excluded types", () => {
    const obs = [
      makeObs({ type: "decision", title: "Keep me" }),
      makeObs({ type: "change", title: "Exclude me" }),
    ];
    const prompt = buildDistillationUserPrompt(obs, "proj", ["change"]);

    expect(prompt).toContain("Keep me");
    expect(prompt).not.toContain("Exclude me");
    expect(prompt).toContain("1 observations");
  });

  test("estimateTokens returns reasonable estimate", () => {
    const obs = [makeObs({ narrative: "a".repeat(1000) })];
    const tokens = estimateTokens(obs);
    expect(tokens).toBeGreaterThan(100);
    expect(tokens).toBeLessThan(10000);
  });
});

describe("parseDistillationResponse", () => {
  test("parses valid JSON response", () => {
    const response = JSON.stringify({
      rules: [
        {
          id: "rule-001",
          rule: "Always use parameterized queries",
          rationale: "Prevents SQL injection",
          category: "security",
          confidence: 0.95,
          sourceCount: 5,
          sourceTypes: ["bugfix", "decision"],
          devDiversity: 3,
        },
      ],
      knowledgeSections: [
        {
          title: "Database Patterns",
          concepts: ["sql", "orm"],
          description: "Team patterns for database access",
          patterns: ["Use transactions for writes"],
          antiPatterns: ["String interpolation in queries"],
          sourceCount: 8,
        },
      ],
    });

    const result = parseDistillationResponse(response);

    expect(result.rules.length).toBe(1);
    expect(result.rules[0].id).toBe("rule-001");
    expect(result.rules[0].confidence).toBe(0.95);
    expect(result.knowledgeSections.length).toBe(1);
    expect(result.knowledgeSections[0].title).toBe("Database Patterns");
  });

  test("strips markdown code fences", () => {
    const response = "```json\n" + JSON.stringify({
      rules: [],
      knowledgeSections: [],
    }) + "\n```";

    const result = parseDistillationResponse(response);
    expect(result.rules).toEqual([]);
    expect(result.knowledgeSections).toEqual([]);
  });

  test("throws on invalid JSON", () => {
    expect(() => parseDistillationResponse("not json")).toThrow();
  });

  test("throws on missing required fields", () => {
    expect(() => parseDistillationResponse(JSON.stringify({ rules: [] }))).toThrow();
  });

  test("validates rule confidence range", () => {
    const response = JSON.stringify({
      rules: [{
        id: "r1",
        rule: "test",
        rationale: "test",
        category: "testing",
        confidence: 1.5, // Out of range
        sourceCount: 1,
        sourceTypes: [],
        devDiversity: 1,
      }],
      knowledgeSections: [],
    });

    expect(() => parseDistillationResponse(response)).toThrow();
  });
});

describe("config schema extensions", () => {
  test("ProfilesConfigSchema has correct defaults", async () => {
    const { ProfilesConfigSchema } = await import("../src/types/config");
    const result = ProfilesConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.anonymizeOthers).toBe(true);
  });

  test("DistillationConfigSchema has correct defaults", async () => {
    const { DistillationConfigSchema } = await import("../src/types/config");
    const result = DistillationConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.schedule).toBe("after-merge");
    expect(result.minObservations).toBe(20);
    expect(result.maxTokenBudget).toBe(100000);
    expect(result.allowExternalApi).toBe(false);
    expect(result.excludeTypes).toEqual([]);
    expect(result.reviewers).toEqual([]);
  });

  test("GlobalConfigSchema includes profiles and distillation", async () => {
    const { GlobalConfigSchema } = await import("../src/types/config");
    const result = GlobalConfigSchema.parse({ devName: "test-dev" });
    expect(result.profiles.enabled).toBe(false);
    expect(result.distillation.enabled).toBe(false);
  });
});
