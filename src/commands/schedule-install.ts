import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { spawnCommand, spawnWithStdin } from "../core/compat";
import { loadConfig } from "../core/config";
import { logger } from "../core/logger";
import { LOGS_DIR } from "../core/constants";
import {
  getDefaultEntries,
  generateCrontabEntries,
  generateSystemdService,
  generateSystemdTimer,
  generateLaunchdPlist,
  generateSchtasksArgs,
} from "../core/scheduler";
import type { ParsedArgs } from "../cli";

export default async function run(_args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  const entries = getDefaultEntries(
    config.global.exportSchedule,
    config.global.maintenanceSchedule,
  );

  // Ensure logs directory exists
  mkdirSync(LOGS_DIR, { recursive: true });

  const platform = process.platform;

  if (platform === "linux") {
    const hasSystemd = (await spawnCommand(["systemctl", "--user", "show-environment"]).catch(() => null))?.exitCode === 0;
    if (hasSystemd) await installSystemd(entries);
    else await installCron(entries);
  } else if (platform === "darwin") {
    await installLaunchd(entries);
  } else if (platform === "win32") {
    await installSchtasks(entries);
  } else {
    logger.error(`Unsupported platform: ${platform}. Install scheduled tasks manually.`);
    process.exit(1);
  }
}

async function installSystemd(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  const unitDir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(unitDir, { recursive: true });

  for (const entry of entries) {
    writeFileSync(join(unitDir, `${entry.name}.service`), generateSystemdService(entry), "utf-8");
    writeFileSync(join(unitDir, `${entry.name}.timer`), generateSystemdTimer(entry), "utf-8");
  }

  await spawnCommand(["systemctl", "--user", "daemon-reload"]);
  for (const entry of entries) {
    const result = await spawnCommand(["systemctl", "--user", "enable", "--now", `${entry.name}.timer`]);
    if (result.exitCode !== 0) logger.error(`Failed to enable ${entry.name}.timer: ${result.stderr}`);
    else console.log(`Enabled systemd timer: ${entry.name}.timer`);
  }

  console.log("\nScheduled tasks installed via systemd user timers.");
  console.log("List: systemctl --user list-timers 'claude-mem-sync-*'");
  console.log("Note: git over SSH needs SSH_AUTH_SOCK (or a passphrase-less key) in the user manager.");
}

async function installCron(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  const crontab = generateCrontabEntries(entries);

  // Read existing crontab
  const result = await spawnCommand(["crontab", "-l"]);
  const existing = result.stdout;

  // Remove old entries
  const filtered = existing
    .split("\n")
    .filter((line) => {
      return !line.includes("claude-mem-sync") && !line.includes("mem-sync");
    })
    .join("\n")
    .trim();

  const newCrontab = filtered ? `${filtered}\n${crontab}\n` : `${crontab}\n`;

  // Install new crontab via stdin
  await spawnWithStdin(["crontab", "-"], newCrontab);

  console.log("Installed cron jobs:");
  console.log(crontab);
}

async function installLaunchd(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  const agentsDir = join(homedir(), "Library", "LaunchAgents");
  mkdirSync(agentsDir, { recursive: true });

  for (const entry of entries) {
    const plist = generateLaunchdPlist(entry);
    const filename = `com.${entry.name}.plist`;
    const filepath = join(agentsDir, filename);

    writeFileSync(filepath, plist, "utf-8");
    logger.info(`Wrote ${filepath}`);

    // Load the agent
    await spawnCommand(["launchctl", "load", filepath]);

    console.log(`Loaded launch agent: ${filename}`);
  }

  console.log("\nScheduled tasks installed via launchd.");
}

async function installSchtasks(entries: ReturnType<typeof getDefaultEntries>): Promise<void> {
  for (const entry of entries) {
    const args = generateSchtasksArgs(entry);
    logger.info(`Running: schtasks ${args.join(" ")}`);

    const result = await spawnCommand(["schtasks", ...args]);

    if (result.exitCode !== 0) {
      logger.error(`Failed to create task "${entry.name}": ${result.stderr}`);
    } else {
      console.log(`Created scheduled task: ${entry.name}`);
    }
  }

  console.log("\nScheduled tasks installed via Task Scheduler.");
}
