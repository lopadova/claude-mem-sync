import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawnCommand, spawnWithStdin } from "../core/compat";
import { logger } from "../core/logger";
import { generateSchtasksRemoveArgs } from "../core/scheduler";
import type { ParsedArgs } from "../cli";

const TASK_NAMES = [
  "claude-mem-sync-export",
  "claude-mem-sync-import",
  "claude-mem-sync-maintain",
];

export default async function run(_args: ParsedArgs): Promise<void> {
  const platform = process.platform;

  if (platform === "linux") {
    await removeCron();
  } else if (platform === "darwin") {
    await removeLaunchd();
  } else if (platform === "win32") {
    await removeSchtasks();
  } else {
    logger.error(`Unsupported platform: ${platform}. Remove scheduled tasks manually.`);
    process.exit(1);
  }
}

async function removeCron(): Promise<void> {
  const result = await spawnCommand(["crontab", "-l"]);

  // Remove all claude-mem-sync entries
  const filtered = result.stdout
    .split("\n")
    .filter((line) => {
      return !line.includes("claude-mem-sync") && !line.includes("mem-sync");
    })
    .join("\n")
    .trim();

  await spawnWithStdin(["crontab", "-"], filtered ? `${filtered}\n` : "");

  console.log("Removed claude-mem-sync cron entries.");
}

async function removeLaunchd(): Promise<void> {
  const agentsDir = join(homedir(), "Library", "LaunchAgents");

  for (const name of TASK_NAMES) {
    const filename = `com.${name}.plist`;
    const filepath = join(agentsDir, filename);

    if (existsSync(filepath)) {
      // Unload first
      await spawnCommand(["launchctl", "unload", filepath]);

      unlinkSync(filepath);
      console.log(`Removed: ${filename}`);
    }
  }

  console.log("Removed claude-mem-sync launch agents.");
}

async function removeSchtasks(): Promise<void> {
  for (const name of TASK_NAMES) {
    const args = generateSchtasksRemoveArgs(name);
    const result = await spawnCommand(["schtasks", ...args]);

    if (result.exitCode === 0) {
      console.log(`Deleted task: ${name}`);
    } else {
      logger.warn(`Task "${name}" not found or could not be deleted.`);
    }
  }

  console.log("Removed claude-mem-sync scheduled tasks.");
}
