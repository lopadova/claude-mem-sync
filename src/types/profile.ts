import { z } from "zod";

// ── Knowledge Spectrum ──────────────────────────────────────────────

export const TypeCountSchema = z.object({
  type: z.string(),
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
  teamAverage: z.number().min(0).max(100),
});

export const KnowledgeSpectrumSchema = z.object({
  types: z.array(TypeCountSchema),
  total: z.number().int().nonnegative(),
});

// ── Concept Map ─────────────────────────────────────────────────────

export const ConceptEntrySchema = z.object({
  concept: z.string(),
  devCount: z.number().int().nonnegative(),
  teamCount: z.number().int().nonnegative(),
  isGap: z.boolean(),
});

export const ConceptMapSchema = z.object({
  concepts: z.array(ConceptEntrySchema),
  totalUniqueConcepts: z.number().int().nonnegative(),
  devCoverage: z.number().min(0).max(100),
});

// ── File Coverage ───────────────────────────────────────────────────

export const DirectoryEntrySchema = z.object({
  directory: z.string(),
  count: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});

export const FileCoverageSchema = z.object({
  directories: z.array(DirectoryEntrySchema),
  totalFiles: z.number().int().nonnegative(),
  specializationIndex: z.number().min(0).max(1),
});

// ── Temporal Pattern ────────────────────────────────────────────────

export const WeeklyEntrySchema = z.object({
  week: z.string(), // ISO week: "2026-W12"
  count: z.number().int().nonnegative(),
});

export const MonthlyEntrySchema = z.object({
  month: z.string(), // "2026-03"
  count: z.number().int().nonnegative(),
});

export const TemporalPatternSchema = z.object({
  weekly: z.array(WeeklyEntrySchema),
  monthly: z.array(MonthlyEntrySchema),
  averagePerWeek: z.number().nonnegative(),
  consistency: z.number().min(0).max(1),
});

// ── Survival Rate ───────────────────────────────────────────────────

export const SurvivalRateSchema = z.object({
  exported: z.number().int().nonnegative(),
  survived: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
});

// ── Developer Profile ───────────────────────────────────────────────

export const DeveloperProfileSchema = z.object({
  devName: z.string(),
  project: z.string(),
  generatedAt: z.string(),
  generatedAtEpoch: z.number().int(),
  knowledgeSpectrum: KnowledgeSpectrumSchema,
  conceptMap: ConceptMapSchema,
  fileCoverage: FileCoverageSchema,
  temporalPattern: TemporalPatternSchema,
  survivalRate: SurvivalRateSchema,
});

// ── Team Aggregates ─────────────────────────────────────────────────

export const TeamOverviewSchema = z.object({
  project: z.string(),
  generatedAt: z.string(),
  totalDevs: z.number().int().nonnegative(),
  avgObservationsPerDev: z.number().nonnegative(),
  avgSurvivalRate: z.number().min(0).max(1),
  avgConceptDiversity: z.number().nonnegative(),
  typeDistribution: z.array(TypeCountSchema),
});

export const KnowledgeGapSchema = z.object({
  concept: z.string(),
  contributorCount: z.number().int().nonnegative(),
  totalTeamCount: z.number().int().nonnegative(),
});

export const TeamConceptsSchema = z.object({
  project: z.string(),
  concepts: z.array(ConceptEntrySchema),
  knowledgeGaps: z.array(KnowledgeGapSchema),
});

// ── TS Types ────────────────────────────────────────────────────────

export type TypeCount = z.infer<typeof TypeCountSchema>;
export type KnowledgeSpectrum = z.infer<typeof KnowledgeSpectrumSchema>;
export type ConceptEntry = z.infer<typeof ConceptEntrySchema>;
export type ConceptMap = z.infer<typeof ConceptMapSchema>;
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;
export type FileCoverage = z.infer<typeof FileCoverageSchema>;
export type WeeklyEntry = z.infer<typeof WeeklyEntrySchema>;
export type MonthlyEntry = z.infer<typeof MonthlyEntrySchema>;
export type TemporalPattern = z.infer<typeof TemporalPatternSchema>;
export type SurvivalRate = z.infer<typeof SurvivalRateSchema>;
export type DeveloperProfile = z.infer<typeof DeveloperProfileSchema>;
export type TeamOverview = z.infer<typeof TeamOverviewSchema>;
export type KnowledgeGap = z.infer<typeof KnowledgeGapSchema>;
export type TeamConcepts = z.infer<typeof TeamConceptsSchema>;
