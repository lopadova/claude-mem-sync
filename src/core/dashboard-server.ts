import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { loadConfig, getEnabledProjects } from "./config";
import { openMemDb, queryObservations, getObservationCount } from "./mem-db";
import { openAccessDb } from "./access-db";
import { type SqliteDatabase } from "./compat";
import { DASHBOARD_HTML } from "../dashboard/html";
import {
  getOverviewStats,
  getTypeDistribution,
  getTopAccessed,
  getAccessHeatmap,
  getSyncTimeline,
  getDevContributions,
  getObservationScores,
} from "./analytics";
import {
  handleProfileDev,
  handleProfileDevs,
  handleTeamOverview,
  handleTeamConcepts,
} from "./dashboard-profiles";
import {
  handleDistilledRules,
  handleDistilledKB,
  handleDistilledReport,
  handleDistilledFeedback,
} from "./dashboard-distilled";

// -- Helpers --

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf("?");
  if (idx === -1) return {};
  const params: Record<string, string> = {};
  const qs = url.slice(idx + 1);
  for (const pair of qs.split("&")) {
    const [key, val] = pair.split("=");
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(val ?? "");
    }
  }
  return params;
}

function getPathname(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

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

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(html);
}

function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJson(res, { error: message }, status);
}

// -- Route handlers --

function handleOverview(
  memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  config: ReturnType<typeof loadConfig>,
  _query: Record<string, string>,
  res: ServerResponse,
): void {
  const stats = getOverviewStats(memDb, accessDb, config);

  // Build per-project details for the frontend
  const projects: Array<Record<string, unknown>> = [];
  for (const [name, proj] of Object.entries(config.projects)) {
    const memProject = proj.memProject ?? name;
    const obsCountRow = memDb.prepare(
      "SELECT COUNT(*) as cnt FROM observations WHERE project = ?",
    ).get(memProject) as { cnt: number };

    // Last export/import from access.db
    const lastExp = accessDb.prepare(
      "SELECT exported_at, observations_count FROM export_log WHERE project = ? ORDER BY exported_at DESC LIMIT 1",
    ).get(name) as { exported_at: number; observations_count: number } | null;
    const lastImp = accessDb.prepare(
      "SELECT imported_at, observations_count FROM import_log WHERE project = ? ORDER BY imported_at DESC LIMIT 1",
    ).get(name) as { imported_at: number; observations_count: number } | null;

    projects.push({
      name,
      enabled: proj.enabled !== false,
      remote: proj.remote?.repo ?? "-",
      provider: proj.remote?.type ?? "github",
      observationCount: obsCountRow.cnt,
      cap: config.global.mergeCapPerProject,
      lastExport: lastExp,
      lastImport: lastImp,
    });
  }

  // DB sizes
  const { getFileSize } = require("./compat");
  const dbSize = getFileSize(config.global.claudeMemDbPath);
  const accessDbSize = getFileSize(
    require("./constants").ACCESS_DB_PATH,
  );

  // Session + summary counts (may fail if table doesn't exist)
  let sessionCount = 0;
  let summaryCount = 0;
  try {
    const sRow = memDb.prepare("SELECT COUNT(*) as cnt FROM sdk_sessions").get() as { cnt: number };
    sessionCount = sRow.cnt;
  } catch { /* table may not exist */ }
  try {
    const sumRow = memDb.prepare("SELECT COUNT(*) as cnt FROM session_summaries").get() as { cnt: number };
    summaryCount = sumRow.cnt;
  } catch { /* table may not exist */ }

  sendJson(res, {
    ...stats,
    observationCount: stats.totalObservations,
    sessionCount,
    summaryCount,
    accessLogEntries: stats.totalAccessEvents,
    dbSize,
    accessDbSize,
    projects,
  });
}

function handleObservations(
  memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || null;
  const type = query.type || null;
  const search = query.search || null;
  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit || "50", 10) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (project) {
    conditions.push("project = ?");
    params.push(project);
  }
  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }
  if (search) {
    conditions.push("(title LIKE ? OR narrative LIKE ?)");
    params.push("%" + search + "%", "%" + search + "%");
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countSql = "SELECT COUNT(*) as total FROM observations " + whereClause;
  const countRow = memDb.prepare(countSql).get(...params) as { total: number };

  const dataSql = "SELECT id, type, title, narrative, text, facts, concepts, created_at_epoch, project FROM observations " + whereClause + " ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?";
  const dataParams = [...params, limit, offset];
  const rows = memDb.prepare(dataSql).all(...dataParams);

  sendJson(res, {
    observations: rows,
    total: countRow.total,
    page,
    limit,
    totalPages: Math.ceil(countRow.total / limit),
  });
}

function handleTopAccessed(
  memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10) || 20));
  const project = query.project || null;
  const data = getTopAccessed(accessDb, memDb, project, limit);
  sendJson(res, data);
}

function handleHeatmap(
  _memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const months = Math.min(24, Math.max(1, parseInt(query.months || "6", 10) || 6));
  const data = getAccessHeatmap(accessDb, months);
  sendJson(res, { heatmap: data });
}

function handleSyncHistory(
  _memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  _query: Record<string, string>,
  res: ServerResponse,
): void {
  const exportRows = accessDb
    .prepare(
      "SELECT id, project, exported_at, observations_count, file_path, pushed_to FROM export_log ORDER BY exported_at DESC LIMIT 100",
    )
    .all();

  const importRows = accessDb
    .prepare(
      "SELECT id, project, imported_at, observations_count, file_hash, source_dev FROM import_log ORDER BY imported_at DESC LIMIT 100",
    )
    .all();

  sendJson(res, { exports: exportRows, imports: importRows });
}

function handleTypeDistribution(
  memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || undefined;
  const data = getTypeDistribution(memDb, project);
  sendJson(res, { distribution: data });
}

function handleTimeline(
  _memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  _query: Record<string, string>,
  res: ServerResponse,
): void {
  const data = getSyncTimeline(accessDb);
  sendJson(res, { timeline: data });
}

function handleScores(
  memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const enabledNames = Object.keys(config.projects).filter(
    (n) => config.projects[n].enabled !== false,
  );
  const project = query.project || enabledNames[0] || null;
  if (!project) {
    sendJson(res, { scores: [] });
    return;
  }
  const keepTags = config.global.evictionKeepTagged ?? ["#keep"];
  const allScores = getObservationScores(memDb, accessDb, project, keepTags);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit || "50", 10) || 50));
  sendJson(res, { scores: allScores.slice(0, limit) });
}

function handleDevContributions(
  _memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  _query: Record<string, string>,
  res: ServerResponse,
): void {
  const data = getDevContributions(accessDb);
  sendJson(res, { contributions: data });
}

// -- Observation detail --

function handleObservationDetail(
  memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  _query: Record<string, string>,
  res: ServerResponse,
  id: number,
): void {
  const row = memDb.prepare(
    "SELECT * FROM observations WHERE id = ?",
  ).get(id);
  if (!row) {
    sendError(res, "Observation not found", 404);
    return;
  }
  sendJson(res, row);
}

// -- FTS5 Search --

function handleSearch(
  memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  _config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const q = query.q || "";
  if (!q.trim()) {
    sendJson(res, { results: [], total: 0, query: q });
    return;
  }

  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10) || 20));
  const offset = (page - 1) * limit;
  const project = query.project || null;
  const type = query.type || null;

  // Use FTS5 search on observations_fts
  // observations_fts indexes: title, subtitle, narrative, text, facts, concepts
  try {
    // Build FTS5 match query - escape special chars for safety
    const ftsQuery = q.replace(/['"]/g, "");

    // Build WHERE clause for reuse in count + data queries
    let whereClause = "WHERE observations_fts MATCH ?";
    const filterParams: (string | number)[] = [ftsQuery];

    if (project) {
      whereClause += " AND o.project = ?";
      filterParams.push(project);
    }
    if (type) {
      whereClause += " AND o.type = ?";
      filterParams.push(type);
    }

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM observations_fts fts JOIN observations o ON o.id = fts.rowid ${whereClause}`;
    const countRow = memDb.prepare(countSql).get(...filterParams) as { total: number } | null;
    const total = countRow?.total ?? 0;

    // Paginated results
    const dataSql = `SELECT o.id, o.type, o.title, o.subtitle, o.narrative, o.project, o.created_at_epoch,
               snippet(observations_fts, 2, '<mark>', '</mark>', '...', 40) as snippet
               FROM observations_fts fts
               JOIN observations o ON o.id = fts.rowid
               ${whereClause} ORDER BY rank LIMIT ? OFFSET ?`;
    const rows = memDb.prepare(dataSql).all(...filterParams, limit, offset);

    sendJson(res, {
      results: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query: q,
    });
  } catch (err) {
    // FTS5 query syntax error - fall back to LIKE search
    const likeParam = "%" + q + "%";
    let whereClauseFb = "WHERE (title LIKE ? OR narrative LIKE ? OR text LIKE ?)";
    const fbParams: (string | number)[] = [likeParam, likeParam, likeParam];

    if (project) {
      whereClauseFb += " AND project = ?";
      fbParams.push(project);
    }
    if (type) {
      whereClauseFb += " AND type = ?";
      fbParams.push(type);
    }

    const countSqlFb = `SELECT COUNT(*) as total FROM observations ${whereClauseFb}`;
    const countRowFb = memDb.prepare(countSqlFb).get(...fbParams) as { total: number } | null;
    const total = countRowFb?.total ?? 0;

    const dataSqlFb = `SELECT id, type, title, subtitle, narrative, project, created_at_epoch FROM observations ${whereClauseFb} ORDER BY created_at_epoch DESC LIMIT ? OFFSET ?`;
    const rows = memDb.prepare(dataSqlFb).all(...fbParams, limit, offset);

    sendJson(res, {
      results: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query: q,
      fallback: true,
    });
  }
}

// -- Route table --

type RouteHandler = (
  memDb: SqliteDatabase,
  accessDb: SqliteDatabase,
  config: ReturnType<typeof loadConfig>,
  query: Record<string, string>,
  res: ServerResponse,
) => void;

const ROUTES: Record<string, RouteHandler> = {
  "/api/overview": handleOverview,
  "/api/observations": handleObservations,
  "/api/access/top": handleTopAccessed,
  "/api/access/heatmap": handleHeatmap,
  "/api/sync/history": handleSyncHistory,
  "/api/analytics/types": handleTypeDistribution,
  "/api/analytics/timeline": handleTimeline,
  "/api/analytics/scores": handleScores,
  "/api/analytics/devs": handleDevContributions,
  "/api/search": handleSearch,
  "/api/profiles/devs": handleProfileDevs,
  "/api/team/overview": handleTeamOverview,
  "/api/team/concepts": handleTeamConcepts,
  "/api/distilled/rules": handleDistilledRules,
  "/api/distilled/kb": handleDistilledKB,
  "/api/distilled/report": handleDistilledReport,
};

// -- Server --

export async function startDashboardServer(port: number): Promise<void> {
  const config = loadConfig();
  const memDb = openMemDb(config.global.claudeMemDbPath);
  const accessDb = openAccessDb();

  const dashboardHtml = DASHBOARD_HTML;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    // Handle POST for feedback
    if (req.method === "POST") {
      const url = req.url ?? "/";
      const pathname = getPathname(url);
      if (pathname === "/api/distilled/feedback") {
        try {
          handleDistilledFeedback(memDb, accessDb, config, req, res);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendError(res, message, 500);
        }
        return;
      }
      sendError(res, "Method not allowed", 405);
      return;
    }

    if (req.method !== "GET") {
      sendError(res, "Method not allowed", 405);
      return;
    }

    const url = req.url ?? "/";
    const pathname = getPathname(url);
    const query = parseQuery(url);

    // Serve dashboard HTML at root
    if (pathname === "/" || pathname === "/index.html") {
      sendHtml(res, dashboardHtml);
      return;
    }

    // API routes (static)
    const handler = ROUTES[pathname];
    if (handler) {
      try {
        handler(memDb, accessDb, config, query, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendError(res, message, 500);
      }
      return;
    }

    // Dynamic route: /api/observations/:id
    const obsMatch = pathname.match(/^\/api\/observations\/(\d+)$/);
    if (obsMatch) {
      try {
        handleObservationDetail(memDb, accessDb, config, query, res, parseInt(obsMatch[1], 10));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendError(res, message, 500);
      }
      return;
    }

    // Dynamic route: /api/profiles/:devName
    const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (profileMatch && profileMatch[1] !== "devs") {
      try {
        handleProfileDev(memDb, accessDb, config, query, res, decodeURIComponent(profileMatch[1]));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendError(res, message, 500);
      }
      return;
    }

    // 404
    sendError(res, "Not found", 404);
  });

  // Graceful shutdown
  const cleanup = () => {
    try {
      memDb.close();
    } catch { /* ignore */ }
    try {
      accessDb.close();
    } catch { /* ignore */ }
    server.close();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log("Dashboard running at http://localhost:" + port);
      resolve();
    });
  });
}
