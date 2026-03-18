/**
 * PostToolUse hook for Claude Code.
 *
 * Reads hook payload from stdin, extracts observation IDs from the tool
 * response, and logs each access to access.db so the eviction scorer
 * can reward frequently-used observations.
 *
 * Safety: wrapped entirely in try/catch — never throws, never blocks Claude,
 * never writes to stdout (stdout goes back to Claude Code).
 */

import { openAccessDb, logAccess } from "../src/core/access-db";
import { loadConfig, getEnabledProjects } from "../src/core/config";
import { LOGS_DIR } from "../src/core/constants";
import { mkdirSync, appendFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface HookInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function logError(msg: string, data?: unknown): void {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
    const ts = new Date().toISOString();
    const line = `[${ts}] [HOOK-ERROR] ${msg}${data ? " " + JSON.stringify(data) : ""}\n`;
    appendFileSync(join(LOGS_DIR, "hook-errors.log"), line);
  } catch {
    // absolutely nothing — we must not fail
  }
}

/**
 * Extract observation IDs from the tool response text.
 *
 * Strategies (in order):
 *  1. JSON-parse the response and walk for `"id": <number>` fields
 *  2. Regex fallback for `"id": 123`, `#123`, `id=123` patterns
 */
function extractObservationIds(response: string): number[] {
  const ids = new Set<number>();

  // Strategy 1: parse as JSON (response may be a JSON string or JSON object)
  try {
    const parsed = JSON.parse(response);
    walkForIds(parsed, ids);
  } catch {
    // not valid JSON — fall through to regex
  }

  // Strategy 2: regex patterns
  const patterns = [
    /"id"\s*:\s*(\d+)/g,
    /\bid[=:]\s*(\d+)/g,
    /#(\d+)\b/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(response)) !== null) {
      const n = Number(match[1]);
      if (n > 0 && Number.isInteger(n)) {
        ids.add(n);
      }
    }
  }

  return [...ids];
}

/** Recursively walk a parsed JSON value collecting numeric `id` fields. */
function walkForIds(value: unknown, ids: Set<number>): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) walkForIds(item, ids);
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "number" && Number.isInteger(obj.id) && obj.id > 0) {
      ids.add(obj.id);
    }
    for (const key of Object.keys(obj)) {
      walkForIds(obj[key], ids);
    }
  }
}

/**
 * Determine the project name from `cwd` by matching against enabled projects
 * in the config.  Heuristic: check if cwd path contains the project name or
 * the project's `memProject` value.
 */
function resolveProject(cwd: string): string | null {
  try {
    const config = loadConfig();
    const enabled = getEnabledProjects(config);
    const normalizedCwd = cwd.replace(/\\/g, "/").toLowerCase();

    for (const name of enabled) {
      const project = config.projects[name];
      const memProject = project.memProject ?? name;

      if (
        normalizedCwd.includes(name.toLowerCase()) ||
        normalizedCwd.includes(memProject.toLowerCase())
      ) {
        return memProject;
      }
    }

    // Fallback: return the first enabled project's memProject if only one exists
    if (enabled.length === 1) {
      const name = enabled[0];
      return config.projects[name].memProject ?? name;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Read all stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");

  if (!raw.trim()) return;

  const input: HookInput = JSON.parse(raw);

  const toolResponse = input.tool_response;
  if (!toolResponse) return;

  const ids = extractObservationIds(toolResponse);
  if (ids.length === 0) return;

  const project = resolveProject(input.cwd ?? process.cwd());
  if (!project) {
    logError("Could not resolve project from cwd", { cwd: input.cwd });
    return;
  }

  const sessionId = input.session_id ?? null;
  const toolName = input.tool_name ?? "unknown";

  const db = openAccessDb();
  try {
    for (const obsId of ids) {
      logAccess(db, obsId, project, sessionId, toolName);
    }
  } finally {
    db.close();
  }
}

try {
  await main();
} catch (err) {
  logError("Unhandled error in post-tool-use hook", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
}

// Always exit cleanly
process.exit(0);
