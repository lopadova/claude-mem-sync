import { createInterface } from "readline";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import type { ParsedArgs } from "../cli";
import {
  CONFIG_DIR,
  CONFIG_PATH,
  DEFAULT_CLAUDE_MEM_DB,
  DEFAULT_EXPORT_SCHEDULE,
  PACKAGE_VERSION,
} from "../core/constants";
import type { Config, ProjectConfig } from "../types/config";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultVal ? ` [${defaultVal}]` : "";
    rl.question(`? ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

function askYesNo(question: string, defaultYes: boolean = true): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultYes ? "Y/n" : "y/N";
    rl.question(`? ${question} (${hint}): `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

export default async function run(_args: ParsedArgs): Promise<void> {
  try {
    // 1. Welcome
    console.log(`\nclaude-mem-sync v${PACKAGE_VERSION} — Setup Wizard\n`);
    console.log("This wizard will create your configuration file.");
    console.log(`Config will be saved to: ${CONFIG_PATH}\n`);

    if (existsSync(CONFIG_PATH)) {
      const overwrite = await askYesNo("Config file already exists. Overwrite?", false);
      if (!overwrite) {
        console.log("Aborted.");
        return;
      }
    }

    // 2. Dev name (required)
    let devName = "";
    while (!devName) {
      devName = await ask("Your developer name (e.g., lorenzo)");
      if (!devName) {
        console.log("  Developer name is required.");
      }
    }

    // 3. Claude-mem DB path
    const claudeMemDbPath = await ask("Path to claude-mem database", DEFAULT_CLAUDE_MEM_DB);

    // 4. Projects loop
    const projects: Record<string, ProjectConfig> = {};
    let addMore = true;

    while (addMore) {
      console.log("");
      const projectName = await ask("Project name");
      if (!projectName) {
        console.log("  Skipping — no project name provided.");
        break;
      }

      const memProject = await ask("memProject name in DB", projectName);
      const providerAnswer = await ask("Git provider (github/gitlab/bitbucket)", "github");
      const providerType = (["github", "gitlab", "bitbucket"].includes(providerAnswer.toLowerCase())
        ? providerAnswer.toLowerCase()
        : "github") as "github" | "gitlab" | "bitbucket";

      const repo = await ask("Remote repo (owner/name)");
      if (!repo) {
        console.log("  Skipping — remote repo is required.");
        continue;
      }

      const hostAnswer = providerType !== "github"
        ? await ask(`Host (leave blank for ${providerType}.com)`)
        : "";
      const host = hostAnswer || undefined;

      const autoMergeAnswer = await ask("Merge strategy: auto-merge or PR review?", "auto");
      const autoMerge = autoMergeAnswer.toLowerCase() !== "pr" && autoMergeAnswer.toLowerCase() !== "pr review";

      const typesRaw = await ask("Export types (comma-separated)", "decision,bugfix,discovery");
      const types = typesRaw.split(",").map((t) => t.trim()).filter(Boolean);

      const keywordsRaw = await ask("Export keywords (comma-separated)", "");
      const keywords = keywordsRaw ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean) : [];

      const tagsRaw = await ask("Export tags (comma-separated)", "#shared");
      const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

      const schedule = await ask("Export schedule", DEFAULT_EXPORT_SCHEDULE);

      projects[projectName] = {
        enabled: true,
        memProject: memProject !== projectName ? memProject : undefined,
        remote: {
          type: providerType,
          repo,
          branch: "main",
          autoMerge,
          ...(host ? { host } : {}),
        },
        export: {
          types,
          keywords,
          tags,
          schedule,
        },
      };

      console.log(`  Added project "${projectName}".`);
      addMore = await askYesNo("Add another project?", false);
    }

    // 5. Build config
    const config: Config = {
      global: {
        devName,
        claudeMemDbPath,
        evictionStrategy: "passive",
        evictionKeepTagged: ["#keep"],
        maintenanceSchedule: "monthly",
        maintenancePruneOlderThanDays: 90,
        maintenancePruneScoreThreshold: 0.3,
        mergeCapPerProject: 500,
        exportSchedule: DEFAULT_EXPORT_SCHEDULE,
        logLevel: "info",
        contributionRetentionDays: 30,
        profiles: { enabled: false, anonymizeOthers: true },
        distillation: {
          enabled: false,
          model: "claude-sonnet-4-20250514",
          schedule: "after-merge",
          excludeTypes: [],
          minObservations: 20,
          reviewers: [],
          maxTokenBudget: 100000,
          allowExternalApi: false,
        },
      },
      projects,
    };

    // 6. Write config
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

    // 7. Success
    console.log(`\nConfig written to ${CONFIG_PATH}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Review the config:  cat " + CONFIG_PATH);
    console.log("  2. Run a status check: mem-sync status");
    console.log("  3. Preview an export:  mem-sync preview --project <name>");
    console.log("  4. Install scheduler:  mem-sync schedule install");
    console.log("");
  } finally {
    rl.close();
  }
}
