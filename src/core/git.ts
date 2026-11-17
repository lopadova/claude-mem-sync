import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { existsSync, rmSync } from "fs";
import { spawnCommand } from "./compat";
import { logger } from "./logger";
import type { RemoteConfig } from "../types/config";

// ── Provider URL construction ─────────────────────────────────────────

const DEFAULT_HOSTS: Record<string, string> = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
};

/** Build the clone URL (HTTPS by default, SCP-style SSH when protocol is "ssh"). */
export function buildCloneUrl(remote: RemoteConfig): string {
  const host = remote.host ?? DEFAULT_HOSTS[remote.type] ?? DEFAULT_HOSTS.github;
  if (remote.protocol === "ssh") return `git@${host}:${remote.repo}.git`;
  return `https://${host}/${remote.repo}.git`;
}

// ── Internal helpers ──────────────────────────────────────────────────

async function runCommand(
  cmd: string[],
  options: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string }> {
  logger.debug("runCommand", { cmd, cwd: options.cwd });

  const result = await spawnCommand(cmd, options);

  if (result.exitCode !== 0) {
    const errMsg = `Command failed (exit ${result.exitCode}): ${cmd.join(" ")}\nstderr: ${result.stderr}`;
    logger.error(errMsg);
    throw new Error(errMsg);
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

// ── Clone / pull / push ───────────────────────────────────────────────

/**
 * Shallow-clone a repo into a temp directory.
 * Supports GitHub, GitLab, and Bitbucket (including self-hosted).
 */
export async function shallowClone(remote: RemoteConfig): Promise<string> {
  const suffix = randomBytes(8).toString("hex");
  const tempDir = join(tmpdir(), `claude-mem-sync-${suffix}`);
  const url = buildCloneUrl(remote);

  logger.info("Shallow-cloning repo", { provider: remote.type, repo: remote.repo, dest: tempDir });

  await runCommand(["git", "clone", "--depth", "1", "--branch", remote.branch, url, tempDir]);

  logger.info("Clone complete", { dest: tempDir });
  return tempDir;
}

/**
 * Clone a repo into a specific directory, or pull latest if it already exists.
 * Use this instead of shallowClone when a deterministic target directory is needed
 * (e.g. dashboard caching), to prevent accumulation of orphaned temp directories.
 */
export async function cloneOrPull(remote: RemoteConfig, targetDir: string): Promise<string> {
  if (existsSync(join(targetDir, ".git"))) {
    try {
      logger.info("Pulling latest changes into existing clone", { targetDir });
      await runCommand(["git", "pull"], { cwd: targetDir });
    } catch (pullErr) {
      // Pull failed (e.g., corrupted clone or remote URL changed). Remove and re-clone.
      logger.warn("git pull failed, falling back to fresh clone", {
        targetDir,
        error: (pullErr as Error).message,
      });
      rmSync(targetDir, { recursive: true, force: true });
      const url = buildCloneUrl(remote);
      logger.info("Shallow-cloning repo (retry)", { provider: remote.type, repo: remote.repo, dest: targetDir });
      await runCommand(["git", "clone", "--depth", "1", "--branch", remote.branch, url, targetDir]);
      logger.info("Clone complete", { dest: targetDir });
    }
  } else {
    const url = buildCloneUrl(remote);
    logger.info("Shallow-cloning repo", { provider: remote.type, repo: remote.repo, dest: targetDir });
    await runCommand(["git", "clone", "--depth", "1", "--branch", remote.branch, url, targetDir]);
    logger.info("Clone complete", { dest: targetDir });
  }
  return targetDir;
}

export async function gitPull(repoDir: string): Promise<void> {
  logger.info("Pulling latest changes", { repoDir });
  await runCommand(["git", "pull"], { cwd: repoDir });
}

export async function gitAdd(repoDir: string, files: string[]): Promise<void> {
  if (files.length === 0) {
    logger.warn("gitAdd called with empty file list — skipping");
    return;
  }
  logger.info("Staging files", { repoDir, files });
  await runCommand(["git", "add", ...files], { cwd: repoDir });
}

export async function gitCommit(repoDir: string, message: string): Promise<void> {
  logger.info("Creating commit", { repoDir, message });
  await runCommand(["git", "commit", "-m", message], { cwd: repoDir });
}

export async function gitPush(repoDir: string): Promise<void> {
  logger.info("Pushing to remote", { repoDir });
  await runCommand(["git", "push"], { cwd: repoDir });
}

export async function gitCheckoutNewBranch(repoDir: string, branchName: string): Promise<void> {
  logger.info("Creating and checking out branch", { repoDir, branchName });
  await runCommand(["git", "checkout", "-b", branchName], { cwd: repoDir });
}

export async function gitPushUpstream(repoDir: string, branchName: string): Promise<void> {
  logger.info("Pushing with upstream tracking", { repoDir, branchName });
  await runCommand(["git", "push", "-u", "origin", branchName], { cwd: repoDir });
}

// ── Pull/Merge Request creation ───────────────────────────────────────

/**
 * Create a pull/merge request. Provider-aware:
 * - GitHub: uses `gh pr create`
 * - GitLab: uses `glab mr create`
 * - Bitbucket: uses Bitbucket REST API via curl
 */
export async function createPullRequest(
  repoDir: string,
  title: string,
  body: string,
  remote: RemoteConfig,
): Promise<string> {
  switch (remote.type) {
    case "github":
      return createGitHubPR(repoDir, title, body);
    case "gitlab":
      return createGitLabMR(repoDir, title, body);
    case "bitbucket":
      return createBitbucketPR(repoDir, title, body, remote);
    default:
      throw new Error(`Unsupported provider: ${remote.type}`);
  }
}

async function createGitHubPR(repoDir: string, title: string, body: string): Promise<string> {
  logger.info("Creating GitHub pull request", { repoDir, title });
  const { stdout } = await runCommand(
    ["gh", "pr", "create", "--title", title, "--body", body],
    { cwd: repoDir },
  );
  const prUrl = stdout.trim();
  logger.info("Pull request created", { url: prUrl });
  return prUrl;
}

async function createGitLabMR(repoDir: string, title: string, body: string): Promise<string> {
  logger.info("Creating GitLab merge request", { repoDir, title });
  const { stdout } = await runCommand(
    ["glab", "mr", "create", "--title", title, "--description", body, "--yes"],
    { cwd: repoDir },
  );
  const mrUrl = stdout.trim();
  logger.info("Merge request created", { url: mrUrl });
  return mrUrl;
}

async function createBitbucketPR(
  repoDir: string,
  title: string,
  body: string,
  remote: RemoteConfig,
): Promise<string> {
  logger.info("Creating Bitbucket pull request via REST API", { repoDir, title });

  // Get current branch name
  const { stdout: branchName } = await runCommand(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: repoDir },
  );

  const host = remote.host ?? "api.bitbucket.org";
  const apiHost = host === "bitbucket.org" ? "api.bitbucket.org" : host;
  const apiUrl = `https://${apiHost}/2.0/repositories/${remote.repo}/pullrequests`;

  const payload = JSON.stringify({
    title,
    description: body,
    source: { branch: { name: branchName.trim() } },
    destination: { branch: { name: remote.branch } },
  });

  const { stdout } = await runCommand([
    "curl", "-s", "-X", "POST",
    "-H", "Content-Type: application/json",
    "-H", "Authorization: Bearer ${BITBUCKET_TOKEN}",
    "-d", payload,
    apiUrl,
  ], { cwd: repoDir });

  // Parse response to extract PR URL
  try {
    const response = JSON.parse(stdout);
    const prUrl = response.links?.html?.href ?? response.links?.self?.href ?? `${apiUrl} (created)`;
    logger.info("Bitbucket pull request created", { url: prUrl });
    return prUrl;
  } catch {
    logger.warn("Could not parse Bitbucket API response, PR may have been created");
    return `${apiUrl} (check Bitbucket)`;
  }
}

// ── CLI availability checks ───────────────────────────────────────────

/** Check if the required CLI tool is available for the given provider. */
export async function checkProviderCli(providerType: string): Promise<boolean> {
  const cmd = providerType === "gitlab" ? "glab" : providerType === "bitbucket" ? "curl" : "gh";
  logger.debug(`Checking for ${cmd} CLI availability`);
  try {
    const result = await spawnCommand([cmd, "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/** Returns the CLI tool name and install URL for the given provider. */
export function getProviderCliInfo(providerType: string): { name: string; url: string } {
  switch (providerType) {
    case "gitlab":
      return { name: "GitLab CLI (glab)", url: "https://gitlab.com/gitlab-org/cli" };
    case "bitbucket":
      return { name: "curl", url: "https://curl.se/" };
    default:
      return { name: "GitHub CLI (gh)", url: "https://cli.github.com/" };
  }
}

export async function hasStagedChanges(repoDir: string): Promise<boolean> {
  logger.debug("Checking for staged changes", { repoDir });
  const result = await spawnCommand(["git", "diff", "--cached", "--quiet"], { cwd: repoDir });
  return result.exitCode !== 0;
}
