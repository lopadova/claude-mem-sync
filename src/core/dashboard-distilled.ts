import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SqliteDatabase } from "./compat";
import type { Config } from "../types/config";
import type { RuleFeedback } from "../types/distillation";
import { resolveRepoDir } from "./dashboard-profiles";

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJson(res, { error: message }, status);
}

export async function handleDistilledRules(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const repoDir = await resolveRepoDir(config, project);
  const rulesPath = join(repoDir, "distilled", project, "rules.md");

  if (!existsSync(rulesPath)) {
    sendJson(res, { content: null, exists: false, project });
    return;
  }

  try {
    const content = readFileSync(rulesPath, "utf-8");
    sendJson(res, { content, exists: true, project });
  } catch {
    sendError(res, "Failed to read rules.md");
  }
}

export async function handleDistilledKB(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const repoDir = await resolveRepoDir(config, project);
  const kbPath = join(repoDir, "distilled", project, "knowledge-base.md");

  if (!existsSync(kbPath)) {
    sendJson(res, { content: null, exists: false, project });
    return;
  }

  try {
    const content = readFileSync(kbPath, "utf-8");
    sendJson(res, { content, exists: true, project });
  } catch {
    sendError(res, "Failed to read knowledge-base.md");
  }
}

export async function handleDistilledReport(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): Promise<void> {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const repoDir = await resolveRepoDir(config, project);
  const reportPath = join(repoDir, "distilled", project, "distillation-report.json");

  if (!existsSync(reportPath)) {
    sendJson(res, { report: null, exists: false, project });
    return;
  }

  try {
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));

    // Also load feedback if available
    const feedbackPath = join(repoDir, "distilled", project, "feedback.json");
    let feedback: RuleFeedback | null = null;
    if (existsSync(feedbackPath)) {
      try {
        feedback = JSON.parse(readFileSync(feedbackPath, "utf-8"));
      } catch { /* ignore */ }
    }

    sendJson(res, { report, feedback, exists: true, project });
  } catch {
    sendError(res, "Failed to read report");
  }
}

export async function handleDistilledFeedback(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Read POST body as a promise
  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  const data = JSON.parse(body) as {
    project: string;
    ruleId: string;
    status: "accepted" | "rejected" | "modified";
    modifiedRule?: string;
    reviewedBy?: string;
  };

  if (!data.project || !data.ruleId || !data.status) {
    sendError(res, "Missing required fields: project, ruleId, status", 400);
    return;
  }

  const repoDir = await resolveRepoDir(config, data.project);
  const feedbackPath = join(repoDir, "distilled", data.project, "feedback.json");
  let feedback: RuleFeedback;

  if (existsSync(feedbackPath)) {
    feedback = JSON.parse(readFileSync(feedbackPath, "utf-8"));
  } else {
    feedback = {
      project: data.project,
      updatedAt: new Date().toISOString(),
      entries: [],
    };
  }

  // Update or add entry
  const existing = feedback.entries.find((e) => e.ruleId === data.ruleId);
  if (existing) {
    existing.status = data.status;
    existing.modifiedRule = data.modifiedRule;
    existing.reviewedBy = data.reviewedBy;
    existing.reviewedAt = new Date().toISOString();
  } else {
    feedback.entries.push({
      ruleId: data.ruleId,
      status: data.status,
      modifiedRule: data.modifiedRule,
      reviewedBy: data.reviewedBy,
      reviewedAt: new Date().toISOString(),
    });
  }

  feedback.updatedAt = new Date().toISOString();

  mkdirSync(join(repoDir, "distilled", data.project), { recursive: true });
  writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), "utf-8");

  sendJson(res, { success: true, feedback });
}
