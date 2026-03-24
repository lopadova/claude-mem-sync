import { join } from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import type { Observation, ExportFile } from "../types/observation";
import type {
  DeveloperProfile,
  KnowledgeSpectrum,
  ConceptMap,
  FileCoverage,
  TemporalPattern,
  SurvivalRate,
  TypeCount,
  ConceptEntry,
  DirectoryEntry,
  TeamOverview,
  TeamConcepts,
  KnowledgeGap,
} from "../types/profile";
import { TYPE_WEIGHTS } from "./constants";

// ── Contribution Loading ────────────────────────────────────────────

interface DevContribution {
  devName: string;
  observations: Observation[];
  exportedAt: number;
}

/**
 * Load all contribution files from contributions/{project}/{devName}/*.json
 */
export function loadContributions(
  contributionsDir: string,
  project: string,
): DevContribution[] {
  const projectDir = join(contributionsDir, project);
  if (!existsSync(projectDir)) return [];

  const contributions: DevContribution[] = [];
  const devDirs = listDirectories(projectDir);

  for (const devName of devDirs) {
    const devPath = join(projectDir, devName);
    const jsonFiles = listJsonFiles(devPath);

    for (const jsonFile of jsonFiles) {
      try {
        const content = readFileSync(join(devPath, jsonFile), "utf-8");
        const exportFile = JSON.parse(content) as ExportFile;
        contributions.push({
          devName: exportFile.exportedBy || devName,
          observations: exportFile.observations,
          exportedAt: exportFile.exportedAtEpoch,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  return contributions;
}

/**
 * Load merged observations from merged/{project}/latest.json
 */
export function loadMergedObservations(
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

// ── Profile Generation ──────────────────────────────────────────────

/**
 * Generate a developer profile from contribution and merged data.
 */
export function generateProfile(
  devName: string,
  project: string,
  contributions: DevContribution[],
  mergedObservations: Observation[],
  allContributions: DevContribution[],
): DeveloperProfile {
  // Collect this dev's observations from all their contributions
  const devContribs = contributions.filter((c) => c.devName === devName);
  const devObservations = deduplicateByKey(
    devContribs.flatMap((c) => c.observations),
  );

  // Team observations = all contributions from all devs
  const allDevObservations = deduplicateByKey(
    allContributions.flatMap((c) => c.observations),
  );

  const now = new Date();

  return {
    devName,
    project,
    generatedAt: now.toISOString(),
    generatedAtEpoch: Math.floor(now.getTime() / 1000),
    knowledgeSpectrum: computeKnowledgeSpectrum(devObservations, allDevObservations),
    conceptMap: computeConceptMap(devObservations, allDevObservations),
    fileCoverage: computeFileCoverage(devObservations),
    temporalPattern: computeTemporalPattern(devObservations),
    survivalRate: computeSurvivalRate(devObservations, mergedObservations),
  };
}

// ── Metric Computation ──────────────────────────────────────────────

function computeKnowledgeSpectrum(
  devObs: Observation[],
  teamObs: Observation[],
): KnowledgeSpectrum {
  const devTypes = countByField(devObs, "type");
  const teamTypes = countByField(teamObs, "type");
  const devTotal = devObs.length;
  const teamTotal = teamObs.length;

  // Include all known types
  const allTypes = new Set([
    ...Object.keys(TYPE_WEIGHTS),
    ...Object.keys(devTypes),
    ...Object.keys(teamTypes),
  ]);

  const types: TypeCount[] = Array.from(allTypes)
    .map((type) => ({
      type,
      count: devTypes[type] ?? 0,
      percentage: devTotal > 0 ? round(((devTypes[type] ?? 0) / devTotal) * 100) : 0,
      teamAverage: teamTotal > 0 ? round(((teamTypes[type] ?? 0) / teamTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { types, total: devTotal };
}

function computeConceptMap(
  devObs: Observation[],
  teamObs: Observation[],
): ConceptMap {
  const devConcepts = extractConcepts(devObs);
  const teamConcepts = extractConcepts(teamObs);

  const allConcepts = new Set([...devConcepts.keys(), ...teamConcepts.keys()]);
  const totalUnique = allConcepts.size;

  const concepts: ConceptEntry[] = Array.from(allConcepts)
    .map((concept) => ({
      concept,
      devCount: devConcepts.get(concept) ?? 0,
      teamCount: teamConcepts.get(concept) ?? 0,
      isGap: !devConcepts.has(concept) && (teamConcepts.get(concept) ?? 0) >= 2,
    }))
    .sort((a, b) => b.teamCount - a.teamCount);

  const devCoverage = totalUnique > 0 ? round((devConcepts.size / totalUnique) * 100) : 0;

  return { concepts, totalUniqueConcepts: totalUnique, devCoverage };
}

function getObservationFiles(obs: Observation): string | null {
  const parts: string[] = [];
  if (obs.files_read) {
    const parsed = parseJsonArray(obs.files_read);
    parts.push(...parsed);
  }
  if (obs.files_modified) {
    const parsed = parseJsonArray(obs.files_modified);
    parts.push(...parsed);
  }
  return parts.length > 0 ? JSON.stringify([...new Set(parts)]) : null;
}

function computeFileCoverage(devObs: Observation[]): FileCoverage {
  const dirCounts = new Map<string, number>();
  let totalFiles = 0;

  for (const obs of devObs) {
    const combinedFiles = getObservationFiles(obs);
    if (!combinedFiles) continue;
    const files = parseJsonArray(combinedFiles);
    for (const file of files) {
      totalFiles++;
      const dir = getDirectory(file);
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
  }

  const directories: DirectoryEntry[] = Array.from(dirCounts.entries())
    .map(([directory, count]) => ({
      directory,
      count,
      percentage: totalFiles > 0 ? round((count / totalFiles) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Specialization index: 1 - Shannon entropy normalized
  // High value = concentrated in few dirs, low value = spread across many
  const specializationIndex = computeSpecialization(directories, totalFiles);

  return { directories, totalFiles, specializationIndex };
}

function computeTemporalPattern(devObs: Observation[]): TemporalPattern {
  if (devObs.length === 0) {
    return { weekly: [], monthly: [], averagePerWeek: 0, consistency: 0 };
  }

  const weeklyCounts = new Map<string, number>();
  const monthlyCounts = new Map<string, number>();

  for (const obs of devObs) {
    const date = new Date(obs.created_at_epoch * 1000);
    const weekKey = getISOWeek(date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) ?? 0) + 1);
    monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) ?? 0) + 1);
  }

  const weekly = Array.from(weeklyCounts.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  const monthly = Array.from(monthlyCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const weeklyValues = weekly.map((w) => w.count);
  const averagePerWeek = weeklyValues.length > 0
    ? round(weeklyValues.reduce((a, b) => a + b, 0) / weeklyValues.length)
    : 0;

  // Consistency: 1 - CV (coefficient of variation), clamped to [0, 1]
  const consistency = computeConsistency(weeklyValues);

  return { weekly, monthly, averagePerWeek, consistency };
}

function computeSurvivalRate(
  devObs: Observation[],
  mergedObs: Observation[],
): SurvivalRate {
  const exported = devObs.length;
  if (exported === 0) return { exported: 0, survived: 0, rate: 0 };

  // Build a set of dedup keys from merged observations
  const mergedKeys = new Set(
    mergedObs.map((obs) => `${obs.memory_session_id}|${obs.title}|${obs.created_at_epoch}`),
  );

  let survived = 0;
  for (const obs of devObs) {
    const key = `${obs.memory_session_id}|${obs.title}|${obs.created_at_epoch}`;
    if (mergedKeys.has(key)) survived++;
  }

  return { exported, survived, rate: round(survived / exported, 3) };
}

// ── Team Aggregates ─────────────────────────────────────────────────

export function generateTeamOverview(
  project: string,
  profiles: DeveloperProfile[],
  allContributions: DevContribution[],
): TeamOverview {
  const totalDevs = profiles.length;
  const allObs = deduplicateByKey(allContributions.flatMap((c) => c.observations));

  const avgObservationsPerDev = totalDevs > 0
    ? round(profiles.reduce((sum, p) => sum + p.knowledgeSpectrum.total, 0) / totalDevs)
    : 0;

  const avgSurvivalRate = totalDevs > 0
    ? round(profiles.reduce((sum, p) => sum + p.survivalRate.rate, 0) / totalDevs, 3)
    : 0;

  const avgConceptDiversity = totalDevs > 0
    ? round(profiles.reduce((sum, p) => sum + p.conceptMap.devCoverage, 0) / totalDevs)
    : 0;

  // Team type distribution
  const teamTypes = countByField(allObs, "type");
  const teamTotal = allObs.length;
  const allTypeNames = new Set([...Object.keys(TYPE_WEIGHTS), ...Object.keys(teamTypes)]);

  const typeDistribution: TypeCount[] = Array.from(allTypeNames)
    .map((type) => ({
      type,
      count: teamTypes[type] ?? 0,
      percentage: teamTotal > 0 ? round(((teamTypes[type] ?? 0) / teamTotal) * 100) : 0,
      teamAverage: teamTotal > 0 ? round(((teamTypes[type] ?? 0) / teamTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    project,
    generatedAt: new Date().toISOString(),
    totalDevs,
    avgObservationsPerDev,
    avgSurvivalRate,
    avgConceptDiversity,
    typeDistribution,
  };
}

export function generateTeamConcepts(
  project: string,
  contributions: DevContribution[],
): TeamConcepts {
  // Build per-concept: which devs contributed it
  const conceptDevs = new Map<string, Set<string>>();
  const conceptCounts = new Map<string, number>();

  for (const contrib of contributions) {
    for (const obs of contrib.observations) {
      const concepts = parseConcepts(obs.concepts);
      for (const concept of concepts) {
        if (!conceptDevs.has(concept)) conceptDevs.set(concept, new Set());
        conceptDevs.get(concept)!.add(contrib.devName);
        conceptCounts.set(concept, (conceptCounts.get(concept) ?? 0) + 1);
      }
    }
  }

  const uniqueDevs = new Set(contributions.map((c) => c.devName));
  const totalDevCount = uniqueDevs.size;

  const concepts: ConceptEntry[] = Array.from(conceptCounts.entries())
    .map(([concept, teamCount]) => ({
      concept,
      devCount: conceptDevs.get(concept)?.size ?? 0,
      teamCount,
      isGap: (conceptDevs.get(concept)?.size ?? 0) < 2,
    }))
    .sort((a, b) => b.teamCount - a.teamCount);

  const knowledgeGaps: KnowledgeGap[] = concepts
    .filter((c) => c.isGap && c.teamCount >= 2)
    .map((c) => ({
      concept: c.concept,
      contributorCount: c.devCount,
      totalTeamCount: totalDevCount,
    }));

  return { project, concepts, knowledgeGaps };
}

/**
 * Get list of unique dev names from contributions for a project.
 */
export function getDevNames(contributions: DevContribution[]): string[] {
  return [...new Set(contributions.map((c) => c.devName))].sort();
}

// ── Markdown Rendering ──────────────────────────────────────────────

export function renderProfileMarkdown(profile: DeveloperProfile): string {
  const lines: string[] = [];

  lines.push(`# Developer Profile: ${profile.devName}`);
  lines.push(`**Project:** ${profile.project}`);
  lines.push(`**Generated:** ${profile.generatedAt}`);
  lines.push("");

  // Knowledge Spectrum
  lines.push("## Knowledge Spectrum");
  lines.push(`Total observations: ${profile.knowledgeSpectrum.total}`);
  lines.push("");
  lines.push("| Type | Count | Dev % | Team Avg % |");
  lines.push("|------|-------|-------|------------|");
  for (const t of profile.knowledgeSpectrum.types) {
    if (t.count > 0 || t.teamAverage > 0) {
      lines.push(`| ${t.type} | ${t.count} | ${t.percentage}% | ${t.teamAverage}% |`);
    }
  }
  lines.push("");

  // Concept Map
  lines.push("## Concept Map");
  lines.push(`Unique concepts covered: ${profile.conceptMap.concepts.filter((c) => c.devCount > 0).length} / ${profile.conceptMap.totalUniqueConcepts} (${profile.conceptMap.devCoverage}%)`);
  lines.push("");
  const topConcepts = profile.conceptMap.concepts.filter((c) => c.devCount > 0).slice(0, 20);
  if (topConcepts.length > 0) {
    lines.push("### Top Concepts");
    lines.push("| Concept | Dev Count | Team Count |");
    lines.push("|---------|-----------|------------|");
    for (const c of topConcepts) {
      lines.push(`| ${c.concept} | ${c.devCount} | ${c.teamCount} |`);
    }
    lines.push("");
  }
  const gaps = profile.conceptMap.concepts.filter((c) => c.isGap).slice(0, 10);
  if (gaps.length > 0) {
    lines.push("### Knowledge Gaps (team concepts not yet covered)");
    for (const g of gaps) {
      lines.push(`- ${g.concept} (team count: ${g.teamCount})`);
    }
    lines.push("");
  }

  // File Coverage
  lines.push("## File Coverage");
  lines.push(`Total files touched: ${profile.fileCoverage.totalFiles}`);
  lines.push(`Specialization index: ${profile.fileCoverage.specializationIndex} (1=focused, 0=spread)`);
  lines.push("");
  if (profile.fileCoverage.directories.length > 0) {
    lines.push("| Directory | Count | % |");
    lines.push("|-----------|-------|---|");
    for (const d of profile.fileCoverage.directories.slice(0, 15)) {
      lines.push(`| ${d.directory} | ${d.count} | ${d.percentage}% |`);
    }
    lines.push("");
  }

  // Temporal Pattern
  lines.push("## Temporal Pattern");
  lines.push(`Average per week: ${profile.temporalPattern.averagePerWeek}`);
  lines.push(`Consistency: ${profile.temporalPattern.consistency} (1=steady, 0=sporadic)`);
  lines.push("");
  if (profile.temporalPattern.monthly.length > 0) {
    lines.push("| Month | Observations |");
    lines.push("|-------|-------------|");
    for (const m of profile.temporalPattern.monthly) {
      lines.push(`| ${m.month} | ${m.count} |`);
    }
    lines.push("");
  }

  // Survival Rate
  lines.push("## Contribution Survival Rate");
  lines.push(`${profile.survivalRate.survived}/${profile.survivalRate.exported} (${round(profile.survivalRate.rate * 100)}%) survived into merged set`);
  lines.push("");

  return lines.join("\n");
}

// ── Helpers ─────────────────────────────────────────────────────────

function listDirectories(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory();
    });
  } catch {
    return [];
  }
}

function listJsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

function countByField(obs: Observation[], field: keyof Observation): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const o of obs) {
    const val = String(o[field] ?? "unknown");
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

function extractConcepts(obs: Observation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of obs) {
    const concepts = parseConcepts(o.concepts);
    for (const c of concepts) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return counts;
}

function parseConcepts(concepts: string | null): string[] {
  if (!concepts) return [];
  // Concepts can be JSON array or comma-separated
  try {
    const parsed = JSON.parse(concepts);
    if (Array.isArray(parsed)) return parsed.map((c: unknown) => String(c).trim()).filter(Boolean);
  } catch {
    // Fall through to comma-separated
  }
  return concepts.split(",").map((c) => c.trim()).filter(Boolean);
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v));
  } catch {
    // Fall through
  }
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function getDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  return normalized.slice(0, lastSlash);
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function computeSpecialization(dirs: DirectoryEntry[], total: number): number {
  if (total === 0 || dirs.length <= 1) return 1;
  // Normalized Shannon entropy: 0 = max disorder, 1 = max focus
  const maxEntropy = Math.log2(dirs.length);
  if (maxEntropy === 0) return 1;

  let entropy = 0;
  for (const d of dirs) {
    const p = d.count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return round(1 - entropy / maxEntropy, 3);
}

function computeConsistency(values: number[]): number {
  if (values.length <= 1) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return round(Math.max(0, Math.min(1, 1 - cv)), 3);
}

function deduplicateByKey(obs: Observation[]): Observation[] {
  const seen = new Set<string>();
  const result: Observation[] = [];
  for (const o of obs) {
    const key = `${o.memory_session_id}|${o.title}|${o.created_at_epoch}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(o);
    }
  }
  return result;
}

function round(n: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
