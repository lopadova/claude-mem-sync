import { join } from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import type { ServerResponse } from "node:http";
import type { SqliteDatabase } from "./compat";
import type { Config } from "../types/config";
import {
  loadContributions,
  loadMergedObservations,
  generateProfile,
  generateTeamOverview,
  generateTeamConcepts,
  getDevNames,
} from "./profiler";

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJson(res, { error: message }, status);
}

/**
 * Try to load a pre-generated profile from profiles/{project}/{devName}/profile.json.
 * Falls back to live computation from contribution files.
 */
export function handleProfileDev(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
  devName: string,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";
  if (!project) {
    sendError(res, "No project specified", 400);
    return;
  }

  // Try pre-generated profile first
  const profilePath = join("profiles", project, devName, "profile.json");
  if (existsSync(profilePath)) {
    try {
      const data = JSON.parse(readFileSync(profilePath, "utf-8"));
      sendJson(res, data);
      return;
    } catch { /* fall through to live computation */ }
  }

  // Live computation from contribution files
  const contributionsDir = "contributions";
  const mergedDir = "merged";
  const contributions = loadContributions(contributionsDir, project);

  if (contributions.length === 0) {
    sendError(res, `No contributions found for project "${project}"`, 404);
    return;
  }

  const mergedObs = loadMergedObservations(mergedDir, project);
  const profile = generateProfile(devName, project, contributions, mergedObs, contributions);
  sendJson(res, profile);
}

export function handleProfileDevs(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";

  // Try pre-generated profiles dir
  const profilesDir = join("profiles", project);
  if (existsSync(profilesDir)) {
    try {
      const devDirs = readdirSync(profilesDir).filter((name) => {
        const full = join(profilesDir, name);
        return statSync(full).isDirectory();
      });
      sendJson(res, { devNames: devDirs.sort(), project });
      return;
    } catch { /* fall through */ }
  }

  // Discover from contributions
  const contributions = loadContributions("contributions", project);
  const devNames = getDevNames(contributions);
  sendJson(res, { devNames, project });
}

export function handleTeamOverview(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";

  // Try pre-generated team overview
  const overviewPath = join("profiles", project, "team-overview.json");
  if (existsSync(overviewPath)) {
    try {
      const data = JSON.parse(readFileSync(overviewPath, "utf-8"));
      sendJson(res, data);
      return;
    } catch { /* fall through */ }
  }

  // Live computation
  const contributions = loadContributions("contributions", project);
  if (contributions.length === 0) {
    sendJson(res, { totalDevs: 0, avgObservationsPerDev: 0, avgSurvivalRate: 0, avgConceptDiversity: 0, typeDistribution: [] });
    return;
  }

  const mergedObs = loadMergedObservations("merged", project);
  const devNames = getDevNames(contributions);
  const profiles = devNames.map((name) =>
    generateProfile(name, project, contributions, mergedObs, contributions),
  );

  const overview = generateTeamOverview(project, profiles, contributions);
  sendJson(res, overview);
}

export function handleTeamConcepts(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const contributions = loadContributions("contributions", project);

  if (contributions.length === 0) {
    sendJson(res, { project, concepts: [], knowledgeGaps: [] });
    return;
  }

  const result = generateTeamConcepts(project, contributions);
  sendJson(res, result);
}
