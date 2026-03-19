import { z } from "zod";
import {
  DEFAULT_MERGE_CAP,
  DEFAULT_PRUNE_OLDER_THAN_DAYS,
  DEFAULT_PRUNE_SCORE_THRESHOLD,
  DEFAULT_EXPORT_SCHEDULE,
  DEFAULT_MAINTENANCE_SCHEDULE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_CLAUDE_MEM_DB,
  DEFAULT_KEEP_TAGS,
  DEFAULT_ACCESS_WINDOW_MONTHS,
  DEFAULT_CONTRIBUTION_RETENTION_DAYS,
} from "../core/constants";

export const ScoringWeightsSchema = z.object({
  typeWeight: z.number().min(0).max(1).default(0.3),
  recencyWeight: z.number().min(0).max(1).default(0.2),
  thirdWeight: z.number().min(0).max(1).default(0.5),
});

export const EvictionSchema = z.object({
  strategy: z.enum(["hook", "passive"]).default("passive"),
  accessWindowMonths: z.number().int().positive().default(DEFAULT_ACCESS_WINDOW_MONTHS),
  scoring: ScoringWeightsSchema.default({}),
});

export const ExportConfigSchema = z.object({
  types: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  schedule: z.string().default(DEFAULT_EXPORT_SCHEDULE),
});

export const RemoteConfigSchema = z.object({
  type: z.literal("github").default("github"),
  repo: z.string().min(1),
  branch: z.string().default("main"),
  autoMerge: z.boolean().default(true),
});

export const ProjectConfigSchema = z.object({
  enabled: z.boolean().default(true),
  memProject: z.string().optional(),
  remote: RemoteConfigSchema,
  export: ExportConfigSchema.default({}),
  eviction: EvictionSchema.optional(),
});

export const GlobalConfigSchema = z.object({
  devName: z.string().min(1),
  evictionStrategy: z.enum(["hook", "passive"]).default("passive"),
  evictionKeepTagged: z.array(z.string()).default(DEFAULT_KEEP_TAGS),
  maintenanceSchedule: z.enum(["weekly", "biweekly", "monthly"]).default(DEFAULT_MAINTENANCE_SCHEDULE),
  maintenancePruneOlderThanDays: z.number().int().positive().default(DEFAULT_PRUNE_OLDER_THAN_DAYS),
  maintenancePruneScoreThreshold: z.number().min(0).max(1).default(DEFAULT_PRUNE_SCORE_THRESHOLD),
  mergeCapPerProject: z.number().int().positive().default(DEFAULT_MERGE_CAP),
  exportSchedule: z.string().default(DEFAULT_EXPORT_SCHEDULE),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default(DEFAULT_LOG_LEVEL),
  claudeMemDbPath: z.string().default(DEFAULT_CLAUDE_MEM_DB),
  contributionRetentionDays: z.number().int().positive().default(DEFAULT_CONTRIBUTION_RETENTION_DAYS),
});

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  global: GlobalConfigSchema,
  projects: z.record(z.string(), ProjectConfigSchema),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;
export type EvictionConfig = z.infer<typeof EvictionSchema>;
export type ExportConfig = z.infer<typeof ExportConfigSchema>;
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
