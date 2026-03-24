#!/usr/bin/env bun
/**
 * Release script — bumps version across all files, commits, tags, pushes, and creates a GitHub release.
 *
 * Usage:
 *   bun scripts/release.ts           # interactive prompt
 *   bun scripts/release.ts patch     # auto patch bump
 *   bun scripts/release.ts minor     # auto minor bump
 *   bun scripts/release.ts major     # auto major bump
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

// ── Files that contain a version to update ──────────────────────────

const VERSION_FILES = [
  { path: "package.json", jsonPath: ["version"] },
  { path: "plugin.json", jsonPath: ["version"] },
  { path: ".claude-plugin/plugin.json", jsonPath: ["version"] },
  { path: ".claude-plugin/marketplace.json", jsonPath: ["plugins", 0, "version"] },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(resolve(ROOT, filePath), "utf-8"));
}

function writeJson(filePath: string, data: any): void {
  writeFileSync(resolve(ROOT, filePath), JSON.stringify(data, null, 2) + "\n");
}

function setNestedValue(obj: any, path: readonly (string | number)[], value: string): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

function bump(version: string, type: "major" | "minor" | "patch"): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

async function run(cmd: string[], opts?: { cwd?: string }): Promise<string> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd ?? ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${cmd.join(" ")}\n${stderr}`);
  }
  return stdout.trim();
}

async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  for await (const line of console) {
    return line.trim();
  }
  return "";
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // 1. Read current version
  const pkg = readJson("package.json");
  const currentVersion = pkg.version;
  console.log(`\nCurrent version: \x1b[1;36mv${currentVersion}\x1b[0m\n`);

  // 2. Determine bump type
  let bumpType: "major" | "minor" | "patch";
  const arg = process.argv[2]?.toLowerCase();

  if (arg === "major" || arg === "minor" || arg === "patch") {
    bumpType = arg;
  } else if (arg) {
    console.error(`Unknown bump type: "${arg}". Use: major, minor, or patch`);
    process.exit(1);
  } else {
    // Interactive
    console.log("  1) patch  — bug fixes, small tweaks");
    console.log("  2) minor  — new features, backward compatible");
    console.log("  3) major  — breaking changes\n");

    const answer = await prompt("Select bump type [1/2/3]: ");
    const map: Record<string, "major" | "minor" | "patch"> = {
      "1": "patch", "patch": "patch",
      "2": "minor", "minor": "minor",
      "3": "major", "major": "major",
    };
    bumpType = map[answer];
    if (!bumpType) {
      console.error("Invalid selection. Aborting.");
      process.exit(1);
    }
  }

  const newVersion = bump(currentVersion, bumpType);
  console.log(`\nBumping: \x1b[33mv${currentVersion}\x1b[0m → \x1b[1;32mv${newVersion}\x1b[0m (${bumpType})\n`);

  // 3. Update all version files
  for (const file of VERSION_FILES) {
    const data = readJson(file.path);
    setNestedValue(data, file.jsonPath, newVersion);
    writeJson(file.path, data);
    console.log(`  Updated ${file.path}`);
  }

  // 4. Git commit
  const commitMsg = `Bump version from ${currentVersion} to ${newVersion}`;
  const filePaths = VERSION_FILES.map(f => f.path);
  await run(["git", "add", ...filePaths]);
  await run(["git", "commit", "-m", commitMsg]);
  console.log(`\n  Committed: "${commitMsg}"`);

  // 5. Create tag
  const tag = `v${newVersion}`;
  await run(["git", "tag", tag]);
  console.log(`  Tagged: ${tag}`);

  // 6. Push commit + tag
  console.log("\n  Pushing to remote...");
  await run(["git", "push"]);
  await run(["git", "push", "--tags"]);
  console.log("  Pushed commit and tag.");

  // 7. Create GitHub release
  console.log("  Creating GitHub release...\n");
  const releaseUrl = await run([
    "gh", "release", "create", tag,
    "--title", `v${newVersion}`,
    "--generate-notes",
  ]);

  console.log(`\x1b[1;32mRelease created:\x1b[0m ${releaseUrl}\n`);
}

main().catch((err) => {
  console.error(`\n\x1b[31mError:\x1b[0m ${err.message}`);
  process.exit(1);
});
