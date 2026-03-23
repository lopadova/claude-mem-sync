import { PACKAGE_VERSION } from "./core/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  command: string | null;
  subcommand: string | null;
  project: string | null;
  all: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
  /** ci-merge specific flags */
  contributionsDir: string | null;
  outputDir: string | null;
  stateFile: string | null;
  cap: number | null;
  retentionDays: number | null;
  /** dashboard specific flags */
  port: number | null;
  /** Raw remaining positional args */
  rest: string[];
}

// ---------------------------------------------------------------------------
// Command registry — lazy-imported so unused commands are never loaded
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandModule = { default: (args: any) => Promise<void> };
type CommandLoader = (() => Promise<CommandModule>) | null;

const COMMANDS: Record<string, CommandLoader> = {
  init: () => import("./commands/init"),
  export: () => import("./commands/export"),
  import: () => import("./commands/import"),
  preview: () => import("./commands/preview"),
  maintain: () => import("./commands/maintain"),
  status: () => import("./commands/status"),
  schedule: null, // has subcommands: install, remove
  "ci-merge": () => import("./commands/ci-merge"),
  dashboard: () => import("./commands/dashboard"),
  profile: () => import("./commands/profile"),
  distill: () => import("./commands/distill"),
};

const SCHEDULE_SUBCOMMANDS: Record<string, () => Promise<CommandModule>> = {
  install: () => import("./commands/schedule-install"),
  remove: () => import("./commands/schedule-remove"),
};

// ---------------------------------------------------------------------------
// Help / version text
// ---------------------------------------------------------------------------

const HELP_TEXT = `\
claude-mem-sync v${PACKAGE_VERSION} — Team memory sharing for claude-mem

Usage: mem-sync <command> [options]

Commands:
  init                    Interactive setup wizard
  export                  Export filtered memories to git
  import                  Import merged memories from git
  preview                 Dry-run: show what would be exported
  maintain                Database maintenance (backup, prune, vacuum)
  status                  Health check dashboard
  schedule install        Install OS scheduled tasks
  schedule remove         Remove OS scheduled tasks
  ci-merge                CI-only: merge contribution files
  dashboard               Web dashboard (http://localhost:3737)
  profile                 Generate developer knowledge profiles
  distill                 LLM-powered knowledge distillation

Options:
  --project <name>        Target a specific project
  --all                   Target all enabled projects
  --dry-run               Preview without side effects
  --help                  Show this help
  --version               Show version`;

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: null,
    subcommand: null,
    project: null,
    all: false,
    dryRun: false,
    help: false,
    version: false,
    contributionsDir: null,
    outputDir: null,
    stateFile: null,
    cap: null,
    retentionDays: null,
    port: null,
    rest: [],
  };

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];

    switch (token) {
      case "--help":
      case "-h":
        args.help = true;
        break;

      case "--version":
      case "-v":
        args.version = true;
        break;

      case "--all":
        args.all = true;
        break;

      case "--dry-run":
        args.dryRun = true;
        break;

      case "--project":
        i++;
        args.project = argv[i] ?? null;
        break;

      case "--contributions-dir":
        i++;
        args.contributionsDir = argv[i] ?? null;
        break;

      case "--output-dir":
        i++;
        args.outputDir = argv[i] ?? null;
        break;

      case "--state-file":
        i++;
        args.stateFile = argv[i] ?? null;
        break;

      case "--cap":
        i++;
        if (argv[i] !== undefined) {
          const n = Number(argv[i]);
          args.cap = Number.isFinite(n) ? n : null;
        }
        break;

      case "--retention-days":
        i++;
        if (argv[i] !== undefined) {
          const n = Number(argv[i]);
          args.retentionDays = Number.isFinite(n) && n > 0 ? n : null;
        }
        break;

      case "--port":
        i++;
        if (argv[i] !== undefined) {
          const n = Number(argv[i]);
          args.port = Number.isFinite(n) && n > 0 ? n : null;
        }
        break;

      default:
        // First positional = command, second = subcommand, rest collected
        if (!token.startsWith("-")) {
          if (args.command === null) {
            args.command = token;
          } else if (args.subcommand === null) {
            args.subcommand = token;
          } else {
            args.rest.push(token);
          }
        } else {
          // Unknown flag — collect in rest so commands can inspect
          args.rest.push(token);
        }
        break;
    }

    i++;
  }

  return args;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Skip bun/node binary + script path
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);

  // --version takes priority
  if (args.version) {
    console.log(`claude-mem-sync v${PACKAGE_VERSION}`);
    return;
  }

  // --help or no command
  if (args.help || args.command === null) {
    console.log(HELP_TEXT);
    return;
  }

  const commandName = args.command;

  // Handle "schedule" with subcommands
  if (commandName === "schedule") {
    const sub = args.subcommand;
    if (!sub || !(sub in SCHEDULE_SUBCOMMANDS)) {
      console.error(
        `Unknown schedule subcommand: ${sub ?? "(none)"}\nAvailable: ${Object.keys(SCHEDULE_SUBCOMMANDS).join(", ")}`,
      );
      process.exit(1);
    }
    const loader = SCHEDULE_SUBCOMMANDS[sub];
    const mod = await loader();
    await mod.default(args);
    return;
  }

  // Look up top-level command
  if (!(commandName in COMMANDS)) {
    console.error(`Unknown command: ${commandName}\nRun "mem-sync --help" for usage.`);
    process.exit(1);
  }

  const loader = COMMANDS[commandName];
  if (loader === null) {
    // Shouldn't happen — schedule is already handled above
    console.error(`Command "${commandName}" requires a subcommand.`);
    process.exit(1);
  }

  const mod = await loader();
  await mod.default(args);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
