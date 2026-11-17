import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { ParsedArgs } from "../cli";
import { CONFIG_PATH, DEFAULT_EXPORT_SCHEDULE, PACKAGE_VERSION } from "../core/constants";
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

export default async function run(args: ParsedArgs): Promise<void> {
  try {
    console.log(`\nclaude-mem-sync v${PACKAGE_VERSION} — Update Project\n`);

    if (!existsSync(CONFIG_PATH)) {
      console.error(`No config file found at ${CONFIG_PATH}`);
      console.error('Run "mem-sync init" first to create your configuration.');
      process.exit(1);
    }

    const raw = readFileSync(CONFIG_PATH, "utf-8");
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(raw);
    } catch (err) {
      console.error(`Failed to parse config file at ${CONFIG_PATH}: ${(err as Error).message}`);
      process.exit(1);
    }

    if (
      !parsedConfig ||
      typeof parsedConfig !== "object" ||
      !("projects" in parsedConfig) ||
      typeof (parsedConfig as any).projects !== "object" ||
      (parsedConfig as any).projects === null
    ) {
      console.error(`Invalid config format in ${CONFIG_PATH}: missing or invalid "projects" object.`);
      process.exit(1);
    }

    const config: Config = parsedConfig as Config;
    // Determine project name
    let projectName = args.project || "";
    if (!projectName) {
      const available = Object.keys(config.projects);
      if (available.length === 0) {
        console.error("No projects configured. Use \"mem-sync add-project\" to add one.");
        process.exit(1);
      }
      console.log("Available projects: " + available.join(", "));
      projectName = await ask("Project name to update");
    }

    if (!projectName) {
      console.error("Project name is required.");
      process.exit(1);
    }

    const existing = config.projects[projectName];
    if (!existing) {
      console.error(`Project "${projectName}" not found in config.`);
      console.error("Available projects: " + Object.keys(config.projects).join(", "));
      process.exit(1);
    }

    console.log(`Updating project "${projectName}". Press Enter to keep current value.\n`);

    // Enabled
    const enabledAnswer = await ask("Enabled", existing.enabled ? "true" : "false");
    const enabled = enabledAnswer.toLowerCase() !== "false";

    // memProject
    const memProject = await ask("memProject name in DB", existing.memProject || projectName);

    // Remote
    const providerAnswer = await ask("Git provider (github/gitlab/bitbucket)", existing.remote.type || "github");
    const providerType = (["github", "gitlab", "bitbucket"].includes(providerAnswer.toLowerCase())
      ? providerAnswer.toLowerCase()
      : existing.remote.type || "github") as "github" | "gitlab" | "bitbucket";

    const repo = await ask("Remote repo (owner/name)", existing.remote.repo);
    if (!repo) {
      console.log("Remote repo is required. Aborting.");
      return;
    }

    const currentHost = existing.remote.host || "";
    const protocolAnswer = await ask("Clone protocol (https/ssh)", existing.remote.protocol || "https");
    const protocol = protocolAnswer.toLowerCase() === "ssh" ? "ssh" : "https";

    const hostAnswer = providerType !== "github"
      ? await ask(`Host (leave blank for ${providerType}.com)`, currentHost)
      : "";
    const host = hostAnswer || undefined;

    const branchName = await ask("Branch name", existing.remote.branch || "main");

    const currentMerge = existing.remote.autoMerge !== false ? "auto" : "pr";
    const autoMergeAnswer = await ask("Merge strategy: auto-merge or PR review?", currentMerge);
    const autoMerge = autoMergeAnswer.toLowerCase() !== "pr" && autoMergeAnswer.toLowerCase() !== "pr review";

    // Export
    const currentTypes = existing.export?.types?.join(",") || "decision,bugfix,discovery";
    const typesRaw = await ask("Export types (comma-separated)", currentTypes);
    const types = typesRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const currentKeywords = existing.export?.keywords?.join(",") || "";
    const keywordsRaw = await ask("Export keywords (comma-separated)", currentKeywords);
    const keywords = keywordsRaw ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean) : [];

    const currentTags = existing.export?.tags?.join(",") || "#shared";
    const tagsRaw = await ask("Export tags (comma-separated)", currentTags);
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const currentSchedule = existing.export?.schedule || DEFAULT_EXPORT_SCHEDULE;
    const schedule = await ask("Export schedule", currentSchedule);

    // Build updated project config
    const updatedProject: ProjectConfig = {
      enabled,
      memProject: memProject !== projectName ? memProject : undefined,
      remote: {
        type: providerType,
        repo,
        branch: branchName,
        autoMerge,
        ...(host ? { host } : {}),
        protocol,
      },
      export: {
        types,
        keywords,
        tags,
        schedule,
      },
    };

    config.projects[projectName] = updatedProject;
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

    console.log(`\nProject "${projectName}" updated in ${CONFIG_PATH}`);
    console.log("");
  } finally {
    rl.close();
  }
}
