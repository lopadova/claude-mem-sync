import { join } from "path";
import { tmpdir } from "os";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import type { ServerResponse } from "node:http";
import type { SqliteDatabase } from "./compat";
import { sha256 } from "./compat";
import type { Config } from "../types/config";
import {
  loadContributions,
  loadMergedObservations,
  generateProfile,
  generateTeamOverview,
  generateTeamConcepts,
  getDevNames,
} from "./profiler";
import { cloneOrPull } from "./git";
import { logger } from "./logger";

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

// Cache of cloned repo directories per project
const repoCache: Record<string, string> = {};

/**
 * Resolve the base directory for a project's contributions/merged/profiles.
 * Checks CWD first (for when dashboard is run from repo dir or CI).
 * Falls back to cloning the remote repo.
 */
export async function resolveRepoDir(config: Config, project: string): Promise<string> {
  // Check if contributions exist in CWD (user is in the repo dir)
  const cwdContribs = join("contributions", project);
  const cwdMerged = join("merged", project);
  const cwdProfiles = join("profiles", project);
  const cwdDistilled = join("distilled", project);
  if (existsSync(cwdContribs) || existsSync(cwdMerged) || existsSync(cwdProfiles) || existsSync(cwdDistilled)) {
    return ".";
  }

  // Check in-memory cache (avoids repeated git pull within the same process run)
  if (repoCache[project]) {
    return repoCache[project];
  }

  // Clone the repo (if configured)
  const projConfig = config.projects?.[project];
  if (!project || !projConfig?.remote) {
    // If the project is empty or not configured with a remote, fall back to CWD.
    // Callers will typically interpret the absence of data as empty results / 404,
    // which matches the behavior of the previous implementation.
    return ".";
  }

  // Use a deterministic directory per remote repo so clones accumulate.
  // If the directory already exists, git pull refreshes it; otherwise we clone fresh.
  const dirHash = sha256(`${projConfig.remote.type}:${projConfig.remote.repo}`).slice(0, 32);
  const repoDir = join(tmpdir(), `claude-mem-sync-${dirHash}`);
  logger.info("Syncing repo for dashboard profiles", { project, repo: projConfig.remote.repo, dir: repoDir });
  await cloneOrPull(projConfig.remote, repoDir);
  repoCache[project] = repoDir;
  return repoDir;
}

/**
 * Try to load a pre-generated profile from profiles/{project}/{devName}/profile.json.
 * Falls back to live computation from contribution files.
 */
export async function handleProfileDev(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
  devName: string,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";
  if (!project) {
    sendError(res, "No project specified", 400);
    return;
  }

  try {
    const repoDir = await resolveRepoDir(config, project);

    // Try pre-generated profile first
    const profilePath = join(repoDir, "profiles", project, devName, "profile.json");
    if (existsSync(profilePath)) {
      try {
        const data = JSON.parse(readFileSync(profilePath, "utf-8"));
        sendJson(res, data);
        return;
      } catch { /* fall through to live computation */ }
    }

    // Live computation from contribution files
    const contributionsDir = join(repoDir, "contributions");
    const mergedDir = join(repoDir, "merged");
    const contributions = loadContributions(contributionsDir, project);

    if (contributions.length === 0) {
      sendError(res, `No contributions found for project "${project}"`, 404);
      return;
    }

    const mergedObs = loadMergedObservations(mergedDir, project);
    const profile = generateProfile(devName, project, contributions, mergedObs, contributions);
    sendJson(res, profile);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, message, 500);
  }
}

export async function handleProfileDevs(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";

  try {
    const repoDir = await resolveRepoDir(config, project);

    // Try pre-generated profiles dir
    const profilesDir = join(repoDir, "profiles", project);
    if (existsSync(profilesDir)) {
      try {
        const devDirs = readdirSync(profilesDir).filter((name) => {
          const full = join(profilesDir, name);
          return statSync(full).isDirectory();
        });
        if (devDirs.length > 0) {
          sendJson(res, { devNames: devDirs.sort(), project });
          return;
        }
      } catch { /* fall through */ }
    }

    // Discover from contributions
    const contributions = loadContributions(join(repoDir, "contributions"), project);
    const devNames = getDevNames(contributions);
    sendJson(res, { devNames, project });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, message, 500);
  }
}

export async function handleTeamOverview(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";

  try {
    const repoDir = await resolveRepoDir(config, project);

    // Try pre-generated team overview
    const overviewPath = join(repoDir, "profiles", project, "team-overview.json");
    if (existsSync(overviewPath)) {
      try {
        const data = JSON.parse(readFileSync(overviewPath, "utf-8"));
        sendJson(res, data);
        return;
      } catch { /* fall through */ }
    }

    // Live computation
    const contributions = loadContributions(join(repoDir, "contributions"), project);
    if (contributions.length === 0) {
      sendJson(res, { totalDevs: 0, avgObservationsPerDev: 0, avgSurvivalRate: 0, avgConceptDiversity: 0, typeDistribution: [] });
      return;
    }

    const mergedObs = loadMergedObservations(join(repoDir, "merged"), project);
    const devNames = getDevNames(contributions);
    const profiles = devNames.map((name) =>
      generateProfile(name, project, contributions, mergedObs, contributions),
    );

    const overview = generateTeamOverview(project, profiles, contributions);
    sendJson(res, overview);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, message, 500);
  }
}

export async function handleTeamConcepts(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";

  try {
    const repoDir = await resolveRepoDir(config, project);
    const contributions = loadContributions(join(repoDir, "contributions"), project);

    if (contributions.length === 0) {
      sendJson(res, { project, concepts: [], knowledgeGaps: [] });
      return;
    }

    const result = generateTeamConcepts(project, contributions);
    sendJson(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, message, 500);
  }
}
