import { describe, test, expect } from "bun:test";
import { parseDistillationResponse, getProviderConfig, buildApiRequest, parseApiResponse, computeDateRange } from "../src/core/distiller";
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

  test("computeDateRange normalizes mixed seconds/ms units by real instant", () => {
    // A seconds-based obs that is actually NEWER than a ms-based obs. Raw numeric
    // sorting would put the seconds value (1.77e9) below the ms value (1.58e12)
    // and report the range backwards; normalization must fix the ordering.
    const newerInSeconds = 1767225600; // 2026-01-01T00:00:00Z, seconds
    const olderInMs = 1577836800000; // 2020-01-01T00:00:00Z, ms
    const obs = [
      makeObs({ created_at_epoch: newerInSeconds }),
      makeObs({ created_at_epoch: olderInMs }),
    ];

    const { oldest, newest } = computeDateRange(obs);
    expect(oldest).toBe("2020-01-01T00:00:00.000Z");
    expect(newest).toBe("2026-01-01T00:00:00.000Z");
  });

  test("computeDateRange returns empty strings for no observations", () => {
    expect(computeDateRange([])).toEqual({ oldest: "", newest: "" });
  });

  test("computeDateRange preserves millisecond precision of the bounding instants", () => {
    const preciseMs = 1781024952302; // 2026-06-09T17:09:12.302Z — note sub-second part
    const { oldest, newest } = computeDateRange([makeObs({ created_at_epoch: preciseMs })]);
    expect(oldest).toBe("2026-06-09T17:09:12.302Z");
    expect(newest).toBe("2026-06-09T17:09:12.302Z");
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
    expect(result.provider).toBe("github-copilot");
    expect(result.enabled).toBe(false);
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.schedule).toBe("after-merge");
    expect(result.minObservations).toBe(20);
    expect(result.maxTokenBudget).toBe(100000);
    expect(result.allowExternalApi).toBe(false);
    expect(result.excludeTypes).toEqual([]);
    expect(result.reviewers).toEqual([]);
  });

  test("DistillationConfigSchema accepts anthropic provider", async () => {
    const { DistillationConfigSchema } = await import("../src/types/config");
    const result = DistillationConfigSchema.parse({ provider: "anthropic" });
    expect(result.provider).toBe("anthropic");
  });

  test("DistillationConfigSchema accepts github-copilot provider", async () => {
    const { DistillationConfigSchema } = await import("../src/types/config");
    const result = DistillationConfigSchema.parse({ provider: "github-copilot" });
    expect(result.provider).toBe("github-copilot");
  });

  test("DistillationConfigSchema rejects invalid provider", async () => {
    const { DistillationConfigSchema } = await import("../src/types/config");
    expect(() => DistillationConfigSchema.parse({ provider: "openai" })).toThrow();
  });

  test("GlobalConfigSchema includes profiles and distillation", async () => {
    const { GlobalConfigSchema } = await import("../src/types/config");
    const result = GlobalConfigSchema.parse({ devName: "test-dev" });
    expect(result.profiles.enabled).toBe(false);
    expect(result.distillation.enabled).toBe(false);
  });
});

describe("multi-provider routing", () => {
  test("getProviderConfig returns Anthropic config", () => {
    const config = getProviderConfig("anthropic");
    expect(config.endpoint).toBe("https://api.anthropic.com/v1/messages");
    expect(config.envVar).toBe("ANTHROPIC_API_KEY");
    expect(config.label).toBe("Anthropic");
  });

  test("getProviderConfig returns GitHub Models config", () => {
    const config = getProviderConfig("github-copilot");
    expect(config.endpoint).toBe("https://models.github.ai/inference/chat/completions");
    expect(config.envVar).toBe("GITHUB_TOKEN");
    expect(config.label).toBe("GitHub Models");
  });

  test("getProviderConfig defaults to github-copilot for unknown provider", () => {
    const config = getProviderConfig("unknown");
    expect(config.envVar).toBe("GITHUB_TOKEN");
  });

  test("buildApiRequest returns correct Anthropic structure", () => {
    const req = buildApiRequest("anthropic", "sk-ant-test", "claude-sonnet-4-20250514", "system prompt", "user prompt");
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-ant-test");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    expect((req.body as any).model).toBe("claude-sonnet-4-20250514");
    expect((req.body as any).system).toBe("system prompt");
    expect((req.body as any).messages[0].content).toBe("user prompt");
  });

  test("buildApiRequest returns correct GitHub Models structure", () => {
    const req = buildApiRequest("github-copilot", "ghp_token", "claude-sonnet-4-20250514", "system prompt", "user prompt");
    expect(req.url).toBe("https://models.github.ai/inference/chat/completions");
    expect(req.headers["Authorization"]).toBe("Bearer ghp_token");
    expect((req.body as any).model).toBe("claude-sonnet-4-20250514");
    expect((req.body as any).messages).toHaveLength(2);
    expect((req.body as any).messages[0].role).toBe("system");
    expect((req.body as any).messages[1].role).toBe("user");
  });

  test("parseApiResponse extracts Anthropic text and usage", () => {
    const json = {
      content: [{ type: "text", text: "response text" }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const result = parseApiResponse("anthropic", json);
    expect(result.text).toBe("response text");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  test("parseApiResponse extracts GitHub Models text and usage", () => {
    const json = {
      choices: [{ message: { content: "response text" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };
    const result = parseApiResponse("github-copilot", json);
    expect(result.text).toBe("response text");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
  });

  test("parseApiResponse throws on missing Anthropic text", () => {
    expect(() => parseApiResponse("anthropic", { content: [], usage: {} })).toThrow();
  });

  test("parseApiResponse throws on missing GitHub Models content", () => {
    expect(() => parseApiResponse("github-copilot", { choices: [], usage: {} })).toThrow();
  });
});
