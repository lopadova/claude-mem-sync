import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { logger } from "./logger";
import {
  buildDistillationSystemPrompt,
  buildDistillationUserPrompt,
  estimateTokens,
} from "./prompts/distillation-system";
import type { Observation, ExportFile } from "../types/observation";
import type {
  DistilledRule,
  KnowledgeSection,
  DistillationReport,
  LLMDistillationResponse,
  RuleFeedback,
  RuleFeedbackEntry,
} from "../types/distillation";
import { LLMDistillationResponseSchema } from "../types/distillation";
import type { DistillationConfig } from "../types/config";

// ── Load merged observations ────────────────────────────────────────

export function loadMergedForDistillation(
  mergedDir: string,
  project: string,
): Observation[] {
  const mergedFile = join(mergedDir, project, "latest.json");
  if (!existsSync(mergedFile)) return [];

  try {
    const content = readFileSync(mergedFile, "utf-8");
    const parsed = JSON.parse(content) as ExportFile;
    return parsed.observations;
  } catch {
    return [];
  }
}

// ── Extract unique devs from contribution files ─────────────────────

export function countUniqueDevs(
  contributionsDir: string,
  project: string,
): number {
  const projectDir = join(contributionsDir, project);
  if (!existsSync(projectDir)) return 0;

  try {
    const { readdirSync, statSync } = require("fs");
    const devDirs = readdirSync(projectDir).filter((name: string) => {
      return statSync(join(projectDir, name)).isDirectory();
    });
    return devDirs.length;
  } catch {
    return 0;
  }
}

// ── API Call ────────────────────────────────────────────────────────

interface DistillationResult {
  rules: DistilledRule[];
  knowledgeSections: KnowledgeSection[];
  report: DistillationReport;
}

/**
 * Call the Anthropic API to distill observations into rules and knowledge.
 */
export async function callDistillationAPI(
  observations: Observation[],
  project: string,
  config: DistillationConfig,
  apiKey: string,
  contributionsDir: string,
): Promise<DistillationResult> {
  const systemPrompt = buildDistillationSystemPrompt();
  const userPrompt = buildDistillationUserPrompt(
    observations,
    project,
    config.excludeTypes,
  );

  const inputTokenEstimate = estimateTokens(observations);

  if (inputTokenEstimate > config.maxTokenBudget) {
    throw new Error(
      `Estimated input tokens (${inputTokenEstimate}) exceeds budget (${config.maxTokenBudget}). ` +
      `Reduce observations or increase maxTokenBudget.`,
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const apiResult = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  // Extract text from response
  const textBlock = apiResult.content.find((c) => c.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in API response");
  }

  // Parse JSON response
  const parsed = parseDistillationResponse(textBlock.text);

  // Build report
  const uniqueDevs = countUniqueDevs(contributionsDir, project);
  const typeBreakdown: Record<string, number> = {};
  for (const obs of observations) {
    typeBreakdown[obs.type] = (typeBreakdown[obs.type] ?? 0) + 1;
  }

  const epochs = observations.map((o) => o.created_at_epoch).sort((a, b) => a - b);
  const inputTokens = apiResult.usage.input_tokens;
  const outputTokens = apiResult.usage.output_tokens;

  // Cost estimate: Sonnet 4 pricing ($3/MTok input, $15/MTok output)
  const estimatedCost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  const report: DistillationReport = {
    project,
    generatedAt: new Date().toISOString(),
    generatedAtEpoch: Math.floor(Date.now() / 1000),
    inputStats: {
      totalObservations: observations.length,
      uniqueDevs,
      typeBreakdown,
      dateRange: {
        oldest: epochs.length > 0 ? new Date(epochs[0] * 1000).toISOString() : "",
        newest: epochs.length > 0 ? new Date(epochs[epochs.length - 1] * 1000).toISOString() : "",
      },
    },
    outputStats: {
      rulesGenerated: parsed.rules.length,
      knowledgeSections: parsed.knowledgeSections.length,
      avgConfidence: parsed.rules.length > 0
        ? Math.round((parsed.rules.reduce((s, r) => s + r.confidence, 0) / parsed.rules.length) * 1000) / 1000
        : 0,
    },
    tokenUsage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    },
    model: config.model,
  };

  return { rules: parsed.rules, knowledgeSections: parsed.knowledgeSections, report };
}

/**
 * Parse the LLM's JSON response, validating against the schema.
 */
export function parseDistillationResponse(text: string): LLMDistillationResponse {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned);
  return LLMDistillationResponseSchema.parse(parsed);
}

// ── Write output artifacts ──────────────────────────────────────────

export function writeDistillationOutput(
  outputDir: string,
  project: string,
  result: DistillationResult,
): void {
  const distilledDir = join(outputDir, project);
  mkdirSync(distilledDir, { recursive: true });

  // Write rules.md
  const rulesMarkdown = renderRulesMarkdown(result.rules, result.report);
  writeFileSync(join(distilledDir, "rules.md"), rulesMarkdown, "utf-8");

  // Write knowledge-base.md
  const kbMarkdown = renderKnowledgeBaseMarkdown(result.knowledgeSections);
  writeFileSync(join(distilledDir, "knowledge-base.md"), kbMarkdown, "utf-8");

  // Write distillation-report.json
  writeFileSync(
    join(distilledDir, "distillation-report.json"),
    JSON.stringify(result.report, null, 2),
    "utf-8",
  );

  // Initialize feedback.json if not exists
  const feedbackPath = join(distilledDir, "feedback.json");
  if (!existsSync(feedbackPath)) {
    const feedback: RuleFeedback = {
      project,
      updatedAt: new Date().toISOString(),
      entries: result.rules.map((r) => ({
        ruleId: r.id,
        status: "proposed" as const,
      })),
    };
    writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), "utf-8");
  }
}

// ── Load existing feedback ──────────────────────────────────────────

export function loadFeedback(distilledDir: string, project: string): RuleFeedback | null {
  const feedbackPath = join(distilledDir, project, "feedback.json");
  if (!existsSync(feedbackPath)) return null;
  try {
    return JSON.parse(readFileSync(feedbackPath, "utf-8")) as RuleFeedback;
  } catch {
    return null;
  }
}

export function saveFeedback(distilledDir: string, project: string, feedback: RuleFeedback): void {
  const dir = join(distilledDir, project);
  mkdirSync(dir, { recursive: true });
  feedback.updatedAt = new Date().toISOString();
  writeFileSync(join(dir, "feedback.json"), JSON.stringify(feedback, null, 2), "utf-8");
}

// ── Markdown Rendering ──────────────────────────────────────────────

function renderRulesMarkdown(rules: DistilledRule[], report: DistillationReport): string {
  const lines: string[] = [];

  lines.push(`# Distilled Rules — ${report.project}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Source: ${report.inputStats.totalObservations} observations from ${report.inputStats.uniqueDevs} developer(s)`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Group by category
  const byCategory = new Map<string, DistilledRule[]>();
  for (const rule of rules) {
    const cat = rule.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(rule);
  }

  for (const [category, catRules] of byCategory) {
    lines.push(`## ${capitalize(category)}`);
    lines.push("");

    for (const rule of catRules.sort((a, b) => b.confidence - a.confidence)) {
      lines.push(`### ${rule.rule}`);
      lines.push("");
      lines.push(`> ${rule.rationale}`);
      lines.push("");
      lines.push(`- **Confidence:** ${(rule.confidence * 100).toFixed(0)}%`);
      lines.push(`- **Evidence:** ${rule.sourceCount} observations (${rule.sourceTypes.join(", ")})`);
      lines.push(`- **Dev diversity:** ${rule.devDiversity}`);
      lines.push("");
    }
  }

  // Provenance
  lines.push("---");
  lines.push("");
  lines.push("## Provenance");
  lines.push("");
  lines.push(`- Model: ${report.model}`);
  lines.push(`- Input: ${report.inputStats.totalObservations} observations`);
  lines.push(`- Date range: ${report.inputStats.dateRange.oldest.slice(0, 10)} to ${report.inputStats.dateRange.newest.slice(0, 10)}`);
  lines.push(`- Token usage: ${report.tokenUsage.totalTokens} (est. cost: $${report.tokenUsage.estimatedCost.toFixed(4)})`);
  lines.push("");
  lines.push("*This file was auto-generated by claude-mem-sync. Rules are suggestions requiring human review before adoption into CLAUDE.md.*");

  return lines.join("\n");
}

function renderKnowledgeBaseMarkdown(sections: KnowledgeSection[]): string {
  const lines: string[] = [];

  lines.push("# Knowledge Base");
  lines.push("");

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(`**Concepts:** ${section.concepts.join(", ")}`);
    lines.push(`**Source observations:** ${section.sourceCount}`);
    lines.push("");
    lines.push(section.description);
    lines.push("");

    if (section.patterns.length > 0) {
      lines.push("### Patterns");
      for (const p of section.patterns) {
        lines.push(`- ${p}`);
      }
      lines.push("");
    }

    if (section.antiPatterns.length > 0) {
      lines.push("### Anti-Patterns");
      for (const ap of section.antiPatterns) {
        lines.push(`- ${ap}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*Auto-generated by claude-mem-sync knowledge distillation.*");

  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
