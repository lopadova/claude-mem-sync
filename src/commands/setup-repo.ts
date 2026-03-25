import { createInterface } from "readline";
import { mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync } from "fs";
import { join, resolve } from "path";
import type { ParsedArgs } from "../cli";
import { PACKAGE_VERSION } from "../core/constants";
import { spawnCommand, getPackageRoot } from "../core/compat";

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
    console.log(`\nclaude-mem-sync v${PACKAGE_VERSION} — Shared Repo Setup\n`);
    console.log("This wizard scaffolds a shared team memory repository.\n");

    // 1. Team/repo name
    let repoName = args.rest[0] ?? "";
    if (!repoName) {
      repoName = await ask("Team/repo name (e.g., my-team-memories)");
      if (!repoName) {
        console.log("Repo name is required. Aborting.");
        return;
      }
    }

    // 2. Git provider
    const providerAnswer = await ask("Git provider (github/gitlab/bitbucket)", "github");
    const provider = (["github", "gitlab", "bitbucket"].includes(providerAnswer.toLowerCase())
      ? providerAnswer.toLowerCase()
      : "github") as "github" | "gitlab" | "bitbucket";

    // 3. Create on GitHub?
    let createOnGitHub = false;
    if (provider === "github") {
      createOnGitHub = await askYesNo("Create private repo on GitHub via `gh`?", true);
    }

    // 4. Distillation workflow?
    const addDistillation = await askYesNo("Add the distillation workflow (LLM-powered knowledge extraction)?", false);

    // 5. LLM provider for distillation
    let llmProvider: "github-copilot" | "anthropic" = "github-copilot";
    if (addDistillation) {
      console.log("\n  LLM provider options:");
      console.log("  1) github-copilot  — requires a GitHub PAT with models:read scope");
      console.log("  2) anthropic       — requires an ANTHROPIC_API_KEY\n");
      const llmAnswer = await ask("LLM provider", "github-copilot");
      llmProvider = llmAnswer === "anthropic" || llmAnswer === "2" ? "anthropic" : "github-copilot";
    }

    // 6. Resolve target directory
    const targetDir = resolve(repoName);
    if (existsSync(targetDir)) {
      if (existsSync(join(targetDir, ".git"))) {
        const cont = await askYesNo(`Directory "${repoName}" already exists and is a git repo. Continue?`, false);
        if (!cont) {
          console.log("Aborted.");
          return;
        }
      } else {
        const cont = await askYesNo(`Directory "${repoName}" already exists (not a git repo). Scaffold inside it?`, false);
        if (!cont) {
          console.log("Aborted.");
          return;
        }
      }
    }

    console.log(`\nScaffolding: ${targetDir}\n`);

    // 7. Create directory structure with .gitkeep
    const dirs = ["contributions", "merged", "profiles", "distilled"];
    for (const dir of dirs) {
      const dirPath = join(targetDir, dir);
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(join(dirPath, ".gitkeep"), "", "utf-8");
      console.log(`  Created ${dir}/`);
    }

    // 8. Copy templates
    const pkgRoot = getPackageRoot();
    const templatesDir = join(pkgRoot, "templates");

    // .gitignore
    copyFileSync(join(templatesDir, ".gitignore.example"), join(targetDir, ".gitignore"));
    console.log("  Copied .gitignore");

    // CI workflows
    if (provider === "github") {
      const workflowDir = join(targetDir, ".github", "workflows");
      mkdirSync(workflowDir, { recursive: true });
      copyFileSync(
        join(templatesDir, "github-action", "merge-memories.yml"),
        join(workflowDir, "merge-memories.yml"),
      );
      console.log("  Copied .github/workflows/merge-memories.yml");

      if (addDistillation) {
        let distillYml = readFileSync(
          join(templatesDir, "github-action", "distill-knowledge.yml"),
          "utf-8",
        );
        if (llmProvider === "anthropic") {
          distillYml = distillYml.replace(
            "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
            "ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}",
          );
          distillYml = distillYml.replace(
            "'provider': 'github-copilot'",
            "'provider': 'anthropic'",
          );
          distillYml = distillYml.replace(
            "'model': 'gpt-4o'",
            "'model': 'claude-sonnet-4-20250514'",
          );
        }
        writeFileSync(join(workflowDir, "distill-knowledge.yml"), distillYml, "utf-8");
        console.log("  Copied .github/workflows/distill-knowledge.yml");
      }
    } else if (provider === "gitlab") {
      copyFileSync(
        join(templatesDir, "gitlab-ci", "merge-memories.yml"),
        join(targetDir, ".gitlab-ci.yml"),
      );
      console.log("  Copied .gitlab-ci.yml");
    } else if (provider === "bitbucket") {
      copyFileSync(
        join(templatesDir, "bitbucket-pipelines", "merge-memories.yml"),
        join(targetDir, "bitbucket-pipelines.yml"),
      );
      console.log("  Copied bitbucket-pipelines.yml");
    }

    // 9. Generate README
    const readmeTemplate = readFileSync(join(templatesDir, "shared-repo-readme.md"), "utf-8");
    writeFileSync(
      join(targetDir, "README.md"),
      readmeTemplate.replace(/\{\{REPO_NAME\}\}/g, repoName),
      "utf-8",
    );
    console.log("  Generated README.md");

    // 10. Git init + commit
    if (!existsSync(join(targetDir, ".git"))) {
      await spawnCommand(["git", "init"], { cwd: targetDir });
      await spawnCommand(["git", "branch", "-M", "main"], { cwd: targetDir });
      console.log("  Initialized git repo (branch: main)");
    }
    await spawnCommand(["git", "add", "-A"], { cwd: targetDir });
    await spawnCommand(
      ["git", "commit", "-m", "chore: initialize shared team memory repo [mem-sync]"],
      { cwd: targetDir },
    );
    console.log("  Created initial commit");

    // 11. Create GitHub repo if requested
    let secretCreated = false;
    if (createOnGitHub) {
      console.log("\n  Creating private GitHub repo...");
      const result = await spawnCommand(
        ["gh", "repo", "create", repoName, "--private", "--source", ".", "--push"],
        { cwd: targetDir },
      );
      if (result.exitCode === 0) {
        console.log("  GitHub repo created and pushed.");

        // 11b. Create distillation secret
        if (addDistillation) {
          const secretName = llmProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "GITHUB_TOKEN";
          const secretPrompt = llmProvider === "anthropic"
            ? "Enter your ANTHROPIC_API_KEY (will be saved as repo secret)"
            : "Enter a GitHub PAT with models:read scope (will be saved as repo secret GITHUB_TOKEN)";
          console.log("");
          const apiKey = await ask(secretPrompt);
          if (apiKey) {
            const secretResult = await spawnCommand(
              ["gh", "secret", "set", secretName, "--repo", repoName, "--body", apiKey],
              { cwd: targetDir },
            );
            if (secretResult.exitCode === 0) {
              console.log(`  Secret ${secretName} set successfully.`);
              secretCreated = true;
            } else {
              console.error(`  Warning: failed to set secret: ${secretResult.stderr}`);
            }
          }
        }
      } else {
        console.error(`  Warning: gh repo create failed: ${result.stderr}`);
        console.log("  You can create the repo manually and push later.");
      }
    }

    // 12. Next steps
    console.log("\n--- Setup Complete! ---\n");
    console.log("Next steps for each team member:");
    console.log("  1. Install the plugin:   claude /install-plugin lopadova/claude-mem-sync");
    console.log("  2. Run setup wizard:     mem-sync init");
    console.log(`     Use repo: <owner>/${repoName}`);
    console.log("  3. First export:         mem-sync export --project <name>");

    if (addDistillation && !secretCreated) {
      const secretName = llmProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "GITHUB_TOKEN";
      const secretHint = llmProvider === "anthropic"
        ? "an Anthropic API key"
        : "a GitHub PAT with models:read scope";
      console.log(`\nDistillation requires a repo secret (${secretHint}):`);
      console.log(`  gh secret set ${secretName} --repo <owner>/${repoName}`);
    }
    console.log("");
  } finally {
    rl.close();
  }
}
