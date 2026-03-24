#!/usr/bin/env node

/**
 * Setup hook for claude-mem-sync plugin.
 * Runs once during `claude plugin install` to:
 * 1. Build dist/ if missing (bun preferred, npm fallback)
 * 2. Make `mem-sync` CLI globally available via bun link / npm link
 *
 * Standalone Node.js script — zero external dependencies.
 * All log messages go to stderr (stdout is reserved for Claude Code JSON).
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { platform } from "os";
import { fileURLToPath } from "url";

const IS_WINDOWS = platform() === "win32";
const PACKAGE_NAME = "@lopadova/claude-mem-sync";
const log = (msg) => process.stderr.write(`[mem-sync] ${msg}\n`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRoot() {
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (envRoot && existsSync(join(envRoot, "package.json"))) {
    return envRoot;
  }
  // Derive from script location: <root>/scripts/setup.js → <root>
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return dirname(scriptDir);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: IS_WINDOWS,
    timeout: opts.timeout,
    cwd: opts.cwd,
  });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function commandExists(cmd) {
  if (IS_WINDOWS) {
    return run("where", [cmd], { timeout: 5_000 }).ok;
  }
  return run("which", [cmd], { timeout: 5_000 }).ok;
}

function hasBun() {
  return commandExists("bun");
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function cliAlreadyInstalled() {
  const r = run("mem-sync", ["--version"], { timeout: 10_000 });
  if (!r.ok) return false;
  const versionOutput = (r.stdout || "") + (r.stderr || "");
  return versionOutput.includes("claude-mem-sync");
}

function buildProject(root) {
  const useBun = hasBun();

  // Install dependencies
  log("Installing dependencies...");
  if (useBun) {
    const dep = run("bun", ["install"], { cwd: root });
    if (!dep.ok) {
      log("bun install failed, trying npm...");
      if (!commandExists("npm")) { log("npm not found — cannot install dependencies"); return false; }
      const fallback = run("npm", ["install"], { cwd: root });
      if (!fallback.ok) { log("npm install also failed"); return false; }
    }
  } else {
    if (!commandExists("npm")) {
      log("Neither bun nor npm found — cannot install dependencies");
      return false;
    }
    const dep = run("npm", ["install"], { cwd: root });
    if (!dep.ok) { log("npm install failed: " + dep.stderr.slice(0, 200)); return false; }
  }

  // Build
  log("Building project...");
  if (useBun) {
    const b = run("bun", ["run", "build"], { cwd: root });
    if (b.ok) return true;
    log("bun build failed, trying bunx tsup...");
    const bx = run("bunx", ["tsup"], { cwd: root });
    if (bx.ok) return true;
    log("Build failed: " + bx.stderr.slice(0, 200));
    return false;
  }
  // No bun: use npx tsup
  const b = run("npx", ["tsup"], { cwd: root });
  if (!b.ok) { log("Build failed: " + b.stderr.slice(0, 200)); return false; }
  return true;
}

function linkCLI(root) {
  const useBun = hasBun();
  if (useBun) {
    log("Linking CLI globally via bun link...");
    const r = run("bun", ["link"], { cwd: root, timeout: 30_000 });
    if (r.ok) return true;
    log("bun link failed, falling back to npm link...");
  }
  if (!commandExists("npm")) {
    log("npm not found — cannot link CLI");
    return false;
  }
  log("Linking CLI globally via npm link...");
  const r = run("npm", ["link"], { cwd: root, timeout: 30_000 });
  return r.ok;
}

function writeMarker(root) {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
    writeFileSync(
      join(root, ".setup-version"),
      JSON.stringify({ version: pkg.version, installedAt: new Date().toISOString() })
    );
  } catch { /* non-critical */ }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function finish() {
  // Signal to Claude Code that hook completed successfully
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
}

try {
  const ROOT = resolveRoot();
  log("Plugin root: " + ROOT);

  // 1. Skip if mem-sync is already globally available
  if (cliAlreadyInstalled()) {
    log("CLI already installed, skipping setup.");
    finish();
    process.exit(0);
  }

  // 2. Build if dist/cli.js is missing
  if (!existsSync(join(ROOT, "dist", "cli.js"))) {
    if (!buildProject(ROOT)) {
      log("WARNING: Build failed — CLI will not be available.");
      log("Install manually: bun add -g " + PACKAGE_NAME);
      log("              or: npm install -g " + PACKAGE_NAME);
      finish();
      process.exit(0);
    }
  }

  // 3. Ensure cli.js is executable (no-op on Windows)
  try { chmodSync(join(ROOT, "dist", "cli.js"), 0o755); } catch { /* ok */ }

  // 4. Link globally
  if (linkCLI(ROOT)) {
    log("CLI installed successfully. Run: mem-sync --help");
  } else {
    log("WARNING: Linking failed.");
    log("Install manually: bun add -g " + PACKAGE_NAME);
    log("              or: npm install -g " + PACKAGE_NAME);
    log("Or run: npm link / bun link (from " + ROOT + ")");
  }

  // 5. Write marker
  writeMarker(ROOT);

  finish();
} catch (err) {
  log("Setup error: " + (err.message || err));
  finish();
}
