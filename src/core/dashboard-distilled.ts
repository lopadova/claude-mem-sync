import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SqliteDatabase } from "./compat";
import type { Config } from "../types/config";
import type { RuleFeedback } from "../types/distillation";

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

const DISTILLED_DIR = "distilled";

export function handleDistilledRules(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const rulesPath = join(DISTILLED_DIR, project, "rules.md");

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

export function handleDistilledKB(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const kbPath = join(DISTILLED_DIR, project, "knowledge-base.md");

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

export function handleDistilledReport(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  query: Record<string, string>,
  res: ServerResponse,
): void {
  const project = query.project || Object.keys(config.projects)[0] || "";
  const reportPath = join(DISTILLED_DIR, project, "distillation-report.json");

  if (!existsSync(reportPath)) {
    sendJson(res, { report: null, exists: false, project });
    return;
  }

  try {
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));

    // Also load feedback if available
    const feedbackPath = join(DISTILLED_DIR, project, "feedback.json");
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

export function handleDistilledFeedback(
  _memDb: SqliteDatabase,
  _accessDb: SqliteDatabase,
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  // Read POST body
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    try {
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

      const feedbackPath = join(DISTILLED_DIR, data.project, "feedback.json");
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

      mkdirSync(join(DISTILLED_DIR, data.project), { recursive: true });
      writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2), "utf-8");

      sendJson(res, { success: true, feedback });
    } catch (err) {
      sendError(res, "Invalid request body", 400);
    }
  });
}
