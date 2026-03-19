# CLAUDE.md — claude-mem-sync

## What this project is

**claude-mem-sync** is a TypeScript CLI tool and Claude Code plugin that enables curated, filtered, scored team memory sharing for [claude-mem](https://docs.claude-mem.ai). It syncs AI memories across developers via git.

- **Package name**: `claude-mem-sync`
- **CLI binary**: `mem-sync`
- **License**: MIT
- **Runtime**: Bun (v1.0+) or Node.js (v18+)
- **SQLite**: `bun:sqlite` on Bun, `better-sqlite3` on Node.js (auto-detected via `src/core/compat.ts`)
- **Runtime deps**: Zod (config validation), better-sqlite3 (optional — only needed on Node.js)

## Architecture

```
Developer Machine                    Shared Git Repo
┌─────────────────────┐              ┌──────────────────────┐
│ claude-mem SQLite DB │◄─ read-only─│ Export Pipeline       │
│ (~/.claude-mem/)     │             │ (filter + score)     │──► contributions/
│                      │             └──────────────────────┘
│ PostToolUse Hook ────►  access.db  │ Import Pipeline      │◄── merged/latest.json
│ (tracks real usage)  │             │ (dedup + integrity)  │
└─────────────────────┘              └──────────────────────┘
                                     GitHub Action merges contributions → merged/
```

**Key invariants**:
- Export pipeline and hook are **read-only** on claude-mem's DB
- **Only the import pipeline writes** to claude-mem's DB (with transaction rollback safety)
- access.db (`~/.claude-mem-sync/access.db`) is our own tracking DB — never touches claude-mem's schema
- All SQLite connections use `PRAGMA busy_timeout = 5000` for WAL contention handling
- Dedup uses composite key: `sdk_session_id + title + created_at_epoch` (NOT the auto-increment `id`)

## Project structure

```
src/
  cli.ts                  — Entry point: command router (parseFlags + dispatch)
  types/
    config.ts             — Zod schemas + TS types for config
    observation.ts        — Observation, ScoredObservation, ExportFile interfaces
    merge-state.ts        — .merge-state.json types
  core/
    constants.ts          — Paths, defaults, type weights, dedup key fields
    logger.ts             — Debug/error → file, info/warn → console
    config.ts             — Load, validate, resolve config from ~/.claude-mem-sync/config.json
    mem-db.ts             — Read-only + writable access to claude-mem's SQLite DB
    access-db.ts          — Our access_log, import_log, export_log DB
    filter.ts             — OR-based filter: type/keyword/tag matching
    scoring.ts            — Eviction scoring (hook mode + passive mode)
    merger.ts             — Dedup + cap enforcement with eviction
    git.ts                — Git operations via Bun.spawn (array args, NO shell)
    scheduler.ts          — Cross-platform cron/launchd/schtasks generation
  commands/
    init.ts               — Interactive setup wizard
    export.ts             — Export filtered memories to git
    import.ts             — Import merged memories into local DB
    preview.ts            — Dry-run export preview
    maintain.ts           — DB maintenance (backup, prune, vacuum, integrity)
    status.ts             — Health check dashboard
    schedule-install.ts   — Install OS scheduled tasks
    schedule-remove.ts    — Remove OS scheduled tasks
    ci-merge.ts           — CI-only merge command for GitHub Action

hooks/
  hooks.json              — Claude Code PostToolUse hook registration
  post-tool-use.ts        — Extracts observation IDs from tool responses → access.db

templates/
  github-action/merge-memories.yml
  config.example.json
  .gitignore.example

tests/
  filter.test.ts, scoring.test.ts, merger.test.ts, config.test.ts
  helpers/test-db.ts      — In-memory DB factory with claude-mem schema + FTS5
  integration/            — export, import, ci-merge pipeline tests
```

## Commands

| Command | Description |
|---------|-------------|
| `mem-sync init` | Interactive setup wizard |
| `mem-sync export [--project X] [--all] [--dry-run]` | Export filtered memories to git |
| `mem-sync import [--project X] [--all]` | Import merged memories from git |
| `mem-sync preview [--project X]` | Dry-run: show what would be exported |
| `mem-sync maintain` | Backup, prune low-score old observations, rebuild FTS, VACUUM |
| `mem-sync status` | Health check dashboard (DB sizes, counts, hook status) |
| `mem-sync schedule install` | Install OS-level scheduled tasks |
| `mem-sync schedule remove` | Remove scheduled tasks |
| `mem-sync ci-merge` | CI-only: merge contributions in GitHub Action |

## Development

```bash
bun install              # Install deps
bun test                 # Run all tests (72 tests, ~100ms)
bun test --watch         # Watch mode
bunx tsc --noEmit        # Type check
bun src/cli.ts --help    # CLI smoke test
```

**Test structure**: Unit tests for filter/scoring/merger/config modules + integration tests for export/import/ci-merge pipelines. Tests use in-memory SQLite (`:memory:`) — no file I/O or network calls.

## Key design decisions

1. **Direct SQLite access** — Queries claude-mem's DB directly (not via its CLI), for independence from claude-mem's CLI changes
2. **Separate access.db** — Never touches claude-mem's schema; independent lifecycle
3. **Git as transport** — No server needed; git repos are the sharing layer
4. **OR-based filters** — observation exported if it matches ANY filter criterion (type OR keyword OR tag). Empty filters = nothing exported (safe default)
5. **Dual eviction**: hook mode (real access data from PostToolUse) + passive mode (diffusion across devs). `#keep` tag always protects observations (score = Infinity)
6. **Bun requirement** — `bun:sqlite` is the only SQLite driver. The hook uses `bun` runtime (not `node`), which is an intentional deviation from the original design spec that said `node + .cjs` — infeasible because the hook imports from `src/core/access-db.ts` which depends on `bun:sqlite`
7. **Array-based command execution** — All git/shell commands use `Bun.spawn(["cmd", "arg1", ...])` — no shell interpolation, no injection risk
8. **JSON export version field** — Forward compatibility guard: import aborts if JSON version > supported

## Eviction scoring

### Hook mode (recommended)
```
score = (type_weight * 0.3) + (recency_weight * 0.2) + (access_weight * 0.5)
```

### Passive mode (no plugin)
```
score = (type_weight * 0.4) + (recency_weight * 0.3) + (diffusion_weight * 0.3)
```

Type weights: decision=1.0, bugfix=0.9, feature=0.7, discovery=0.5, refactor=0.4, change=0.3
Recency: `1 / (1 + ln(1 + days_old / 30))` — logarithmic decay, never reaches 0

## Config

Location: `~/.claude-mem-sync/config.json` (validated by Zod, JSON Schema for IDE autocomplete)

Key paths:
- `~/.claude-mem-sync/config.json` — user config
- `~/.claude-mem-sync/access.db` — tracking database
- `~/.claude-mem-sync/logs/` — log files
- `~/.claude-mem/claude-mem.db` — claude-mem's DB (default path, configurable)

## Rules for AI agents working on this codebase

1. **Never modify claude-mem's DB schema** — we are a consumer, not an owner
2. **All SQL uses parameterized queries** (`?` placeholders) — no string interpolation
3. **All shell commands use array args** via `spawnCommand()` from compat.ts — never pass strings to a shell
4. **All filters default to empty = no export** — never leak data by default
5. **Run `bun test` after any change** — all 72 tests must pass
6. **Run `bunx tsc --noEmit` after any change** — zero type errors
7. **Never import `bun:sqlite` directly** — use `createDatabase()` from `src/core/compat.ts` which auto-detects Bun vs Node.js
8. **Never use `Bun.*` APIs directly** — use the wrappers in `src/core/compat.ts` (spawnCommand, sha256, copyFile, getFileSize, readAllStdin)
9. **The hook must never block Claude** — 5s timeout, all errors caught silently, nothing written to stdout (stdout goes back to Claude Code)
10. **Composite dedup key** is `sdk_session_id + title + created_at_epoch` — never use the `id` field for dedup (differs across machines)
11. **Keep deps minimal** — Zod (required), better-sqlite3 (optional, Node.js only)

## Specs and docs

- **Design spec**: `docs/2026-03-18-claude-mem-sync-design.md` — comprehensive spec with all architecture decisions
- **Implementation plan**: `docs/superpowers/plans/2026-03-18-claude-mem-sync.md` — phased task breakdown (all complete)
