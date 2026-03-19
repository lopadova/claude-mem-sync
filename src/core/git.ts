import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { spawnCommand } from "./compat";
import { logger } from "./logger";

/**
 * Internal helper — runs a command via array args (no shell)
 * and returns stdout + stderr as strings. Throws on non-zero exit.
 */
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

/**
 * Shallow-clone a GitHub repo into a temp directory.
 * Returns the absolute path to the cloned directory.
 */
export async function shallowClone(repo: string, branch: string): Promise<string> {
  const suffix = randomBytes(8).toString("hex");
  const tempDir = join(tmpdir(), `claude-mem-sync-${suffix}`);
  const url = `https://github.com/${repo}.git`;

  logger.info("Shallow-cloning repo", { repo, branch, dest: tempDir });

  await runCommand(["git", "clone", "--depth", "1", "--branch", branch, url, tempDir]);

  logger.info("Clone complete", { dest: tempDir });
  return tempDir;
}

/** Pull latest changes in the given repo directory. */
export async function gitPull(repoDir: string): Promise<void> {
  logger.info("Pulling latest changes", { repoDir });
  await runCommand(["git", "pull"], { cwd: repoDir });
}

/** Stage the specified files. */
export async function gitAdd(repoDir: string, files: string[]): Promise<void> {
  if (files.length === 0) {
    logger.warn("gitAdd called with empty file list — skipping");
    return;
  }
  logger.info("Staging files", { repoDir, files });
  await runCommand(["git", "add", ...files], { cwd: repoDir });
}

/** Create a commit with the given message. */
export async function gitCommit(repoDir: string, message: string): Promise<void> {
  logger.info("Creating commit", { repoDir, message });
  await runCommand(["git", "commit", "-m", message], { cwd: repoDir });
}

/** Push to the tracked remote branch. */
export async function gitPush(repoDir: string): Promise<void> {
  logger.info("Pushing to remote", { repoDir });
  await runCommand(["git", "push"], { cwd: repoDir });
}

/** Create and checkout a new branch. */
export async function gitCheckoutNewBranch(repoDir: string, branchName: string): Promise<void> {
  logger.info("Creating and checking out branch", { repoDir, branchName });
  await runCommand(["git", "checkout", "-b", branchName], { cwd: repoDir });
}

/** Push the branch and set upstream tracking. */
export async function gitPushUpstream(repoDir: string, branchName: string): Promise<void> {
  logger.info("Pushing with upstream tracking", { repoDir, branchName });
  await runCommand(["git", "push", "-u", "origin", branchName], { cwd: repoDir });
}

/**
 * Create a pull request via the GitHub CLI (`gh`).
 * Returns the URL of the newly created PR.
 */
export async function createPullRequest(
  repoDir: string,
  title: string,
  body: string,
): Promise<string> {
  logger.info("Creating pull request", { repoDir, title });

  const { stdout } = await runCommand(
    ["gh", "pr", "create", "--title", title, "--body", body],
    { cwd: repoDir },
  );

  const prUrl = stdout.trim();
  logger.info("Pull request created", { url: prUrl });
  return prUrl;
}

/** Returns true if there are staged changes ready to commit. */
export async function hasStagedChanges(repoDir: string): Promise<boolean> {
  logger.debug("Checking for staged changes", { repoDir });
  const result = await spawnCommand(["git", "diff", "--cached", "--quiet"], { cwd: repoDir });
  // exit 0 = no staged changes, exit 1 = there are staged changes
  return result.exitCode !== 0;
}

/** Returns true if the `gh` CLI is available on the system. */
export async function checkGhCli(): Promise<boolean> {
  logger.debug("Checking for gh CLI availability");
  try {
    const result = await spawnCommand(["gh", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
