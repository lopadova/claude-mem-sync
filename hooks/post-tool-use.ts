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
import { readAllStdin } from "../src/core/compat";
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
 * Extract the project name from the MCP tool input or response.
 * claude-mem tools accept a `project` parameter and observations include a
 * `project` field — use these directly instead of guessing from cwd.
 */
function extractProjectFromInput(
  toolInput?: Record<string, unknown>,
  toolResponse?: string,
): string | null {
  // 1. Check tool_input.project (most reliable — explicitly passed by Claude)
  if (toolInput && typeof toolInput.project === "string" && toolInput.project) {
    return toolInput.project;
  }

  // 2. Check tool_response for a project field in the JSON payload
  if (toolResponse) {
    try {
      const parsed = JSON.parse(toolResponse);
      // Single observation response
      if (typeof parsed.project === "string" && parsed.project) {
        return parsed.project;
      }
      // Array of observations — take the first project found
      const items = parsed.observations ?? parsed.results ?? parsed.data;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item?.project === "string" && item.project) {
            return item.project;
          }
        }
      }
    } catch {
      // not JSON — skip
    }
  }

  return null;
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
  const raw = await readAllStdin();

  if (!raw.trim()) return;

  const input: HookInput = JSON.parse(raw);

  const toolResponse = input.tool_response;
  if (!toolResponse) return;

  const ids = extractObservationIds(toolResponse);
  if (ids.length === 0) return;

  // Priority: tool_input.project (from claude-mem MCP) > cwd-based resolution
  const project =
    extractProjectFromInput(input.tool_input, input.tool_response) ??
    resolveProject(input.cwd ?? process.cwd());
  if (!project) {
    logError("Could not resolve project", { cwd: input.cwd, tool_input: input.tool_input });
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
