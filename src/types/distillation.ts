import { z } from "zod";

// ── Distilled Rule ──────────────────────────────────────────────────

export const DistilledRuleSchema = z.object({
  id: z.string(),
  rule: z.string(),
  rationale: z.string(),
  category: z.string(),
  confidence: z.number().min(0).max(1),
  sourceCount: z.number().int().nonnegative(),
  sourceTypes: z.array(z.string()),
  devDiversity: z.number().int().nonnegative(),
});

// ── Knowledge Section ───────────────────────────────────────────────

export const KnowledgeSectionSchema = z.object({
  title: z.string(),
  concepts: z.array(z.string()),
  description: z.string(),
  patterns: z.array(z.string()),
  antiPatterns: z.array(z.string()),
  sourceCount: z.number().int().nonnegative(),
});

// ── Distillation Report ─────────────────────────────────────────────

export const DistillationReportSchema = z.object({
  project: z.string(),
  generatedAt: z.string(),
  generatedAtEpoch: z.number().int(),
  inputStats: z.object({
    totalObservations: z.number().int().nonnegative(),
    uniqueDevs: z.number().int().nonnegative(),
    typeBreakdown: z.record(z.string(), z.number().int()),
    dateRange: z.object({
      oldest: z.string(),
      newest: z.string(),
    }),
  }),
  outputStats: z.object({
    rulesGenerated: z.number().int().nonnegative(),
    knowledgeSections: z.number().int().nonnegative(),
    avgConfidence: z.number().min(0).max(1),
  }),
  tokenUsage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative(),
  }),
  model: z.string(),
});

// ── Rule Feedback ───────────────────────────────────────────────────

export const RuleFeedbackEntrySchema = z.object({
  ruleId: z.string(),
  status: z.enum(["proposed", "accepted", "rejected", "modified"]),
  modifiedRule: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
});

export const RuleFeedbackSchema = z.object({
  project: z.string(),
  updatedAt: z.string(),
  entries: z.array(RuleFeedbackEntrySchema),
});

// ── LLM Response (expected structured output) ───────────────────────

export const LLMDistillationResponseSchema = z.object({
  rules: z.array(DistilledRuleSchema),
  knowledgeSections: z.array(KnowledgeSectionSchema),
});

// ── TS Types ────────────────────────────────────────────────────────

export type DistilledRule = z.infer<typeof DistilledRuleSchema>;
export type KnowledgeSection = z.infer<typeof KnowledgeSectionSchema>;
export type DistillationReport = z.infer<typeof DistillationReportSchema>;
export type RuleFeedbackEntry = z.infer<typeof RuleFeedbackEntrySchema>;
export type RuleFeedback = z.infer<typeof RuleFeedbackSchema>;
export type LLMDistillationResponse = z.infer<typeof LLMDistillationResponseSchema>;
