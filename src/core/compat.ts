/**
 * Runtime compatibility layer — abstracts the differences between Bun and Node.js.
 *
 * Strategy: Use Node.js APIs everywhere (which Bun also supports), except for SQLite
 * where we need to pick between bun:sqlite and better-sqlite3.
 */

import { createRequire } from "node:module";
import { spawn as nodeSpawn } from "node:child_process";
import { statSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Runtime detection ─────────────────────────────────────────────────

export const isBun = typeof globalThis.Bun !== "undefined";

// ── SQLite Database ───────────────────────────────────────────────────

/** Minimal interface matching both bun:sqlite and better-sqlite3 */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

export interface SqliteStatement {
  get(...params: any[]): any;
  all(...params: any[]): any[];
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
}

const req = createRequire(import.meta.url);
let _DbClass: any = null;

function getDbClass(): any {
  if (_DbClass) return _DbClass;
  if (isBun) {
    _DbClass = req("bun:sqlite").Database;
  } else {
    _DbClass = req("better-sqlite3");
  }
  return _DbClass;
}

export function createDatabase(path: string, options?: { readonly?: boolean }): SqliteDatabase {
  const DbClass = getDbClass();
  return new DbClass(path, options) as SqliteDatabase;
}

// ── Process spawning (array args, no shell — safe by design) ──────────

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Spawn a command with array args (no shell). Returns stdout/stderr/exitCode. */
export function spawnCommand(
  cmd: string[],
  options: { cwd?: string } = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = nodeSpawn(cmd[0], cmd.slice(1), {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });

    proc.on("error", reject);
  });
}

/** Spawn a command, write input to stdin, then close stdin. */
export function spawnWithStdin(
  cmd: string[],
  input: string,
  options: { cwd?: string } = {},
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = nodeSpawn(cmd[0], cmd.slice(1), {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.stdin!.write(input);
    proc.stdin!.end();

    proc.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
    });

    proc.on("error", reject);
  });
}

// ── File operations ───────────────────────────────────────────────────

/** Get file size in bytes. Returns 0 if file doesn't exist. */
export function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

/** Copy a file (synchronous). */
export function copyFile(src: string, dst: string): void {
  copyFileSync(src, dst);
}

// ── Crypto ────────────────────────────────────────────────────────────

/** Compute SHA-256 hex digest of a string. */
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ── Package root ─────────────────────────────────────────────────────

/** Find the package root by walking up from the current file until package.json is found. */
export function getPackageRoot(): string {
  const startDir = dirname(fileURLToPath(import.meta.url));
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not determine package root: no package.json found within 10 directories above ${startDir}`,
  );
}

// ── Stdin ─────────────────────────────────────────────────────────────

/** Read all of stdin as a UTF-8 string. */
export async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
