# claude-mem-sync

> Team memory sharing for [claude-mem](https://docs.claude-mem.ai) — sync AI memories across developers via git.

![github-banner-team-memory.png](resources/github-banner-team-memory.png)


## Why This Exists

**claude-mem** gives Claude persistent memory across sessions, storing observations (decisions, bugfixes, discoveries) in a local SQLite database. But it's designed for **single-user, per-machine** usage.

When a team works on the same project:

- Each developer has their own isolated memory database
- Developer A discovers a critical pattern — developers B through L never learn about it
- The same bugs get rediscovered, the same decisions re-debated
- There is no native team mode, no shared database, no automatic sync

**claude-mem-sync** bridges this gap with filtered, scored, deduplicated team memory sharing using git as the transport layer.

## What It Does

```
Developer A                    GitHub (shared repo)              Developer B
┌──────────┐    export         ┌──────────────────┐    import   ┌──────────┐
│ claude-   │ ──────────────►  │ contributions/   │  ◄───────── │ claude-  │
│ mem.db    │    (filtered)    │   dev-A/         │  (merged)   │ mem.db   │
│           │                  │   dev-B/         │             │          │
│           │    import        │                  │   export    │          │
│           │ ◄──────────────  │ merged/          │ ──────────► │          │
│           │    (deduped)     │   latest.json    │  (filtered) │          │
└──────────┘                   └──────────────────┘             └──────────┘
                                    ▲
                               GitHub Action
                               (merge + dedup + cap)
```

**Features:**

- **Filtered export** — only share what matters (by type, keyword, or tag)
- **Intelligent eviction** — scoring system prevents unbounded DB growth
- **Deduplication** — composite key dedup across developers
- **Access tracking** — PostToolUse hook tracks which memories Claude actually uses
- **Cross-platform scheduling** — automatic export/import via cron, launchd, or Task Scheduler
- **PR review mode** — optional human review before memories enter the shared repo
- **Multi-provider support** — GitHub, GitLab, and Bitbucket (including self-hosted)
- **CI merge bot** — templates for GitHub Actions, GitLab CI, and Bitbucket Pipelines
- **Web dashboard** — enterprise-grade dark-theme UI with charts, heatmaps, and analytics
- **Rich analytics** — type distribution, access patterns, developer contributions, observation scoring
- **Dual runtime** — works with both Bun and Node.js (v18+)
- **Configurable cleanup** — automatic retention policy for old contribution files

## Quick Start

```bash
# Install with Bun (recommended)
bun install -g claude-mem-sync

# Or install with Node.js (v18+)
npm install -g claude-mem-sync

# Interactive setup
mem-sync init

# Preview what would be exported
mem-sync preview --project my-project

# Export memories
mem-sync export --project my-project

# Import team memories
mem-sync import --all
```

## Installation

### Prerequisites

- [Bun](https://bun.sh) (v1.0+) **or** [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/)
- [GitHub CLI](https://cli.github.com/) (`gh`), [GitLab CLI](https://gitlab.com/gitlab-org/cli) (`glab`), or `curl` — only required for PR/MR review mode, depends on your provider
- [claude-mem](https://docs.claude-mem.ai) installed and configured

### Install CLI

```bash
# With Bun (recommended — faster, built-in SQLite)
bun install -g claude-mem-sync

# With Node.js (uses better-sqlite3)
npm install -g claude-mem-sync
```

### Install Claude Code Plugin (recommended)

The plugin enables access tracking — the hook records which memories Claude reads, enabling smarter eviction scoring.

```bash
cd $(npm root -g)/claude-mem-sync
claude /plugin add .
```

### Setup Team Repository

```bash
# Create shared memories repo
gh repo create my-org/dev-memories --private

# Clone and add the GitHub Action
gh repo clone my-org/dev-memories
cd dev-memories
mkdir -p .github/workflows contributions merged
cp $(npm root -g)/claude-mem-sync/templates/github-action/merge-memories.yml .github/workflows/
cp $(npm root -g)/claude-mem-sync/templates/.gitignore.example .gitignore
git add -A && git commit -m "chore: initial setup for team memory sharing"
git push
```

## Configuration

Config file location: `~/.claude-mem-sync/config.json`

Created by `mem-sync init` or manually. See `templates/config.example.json` for a full example.

### Global Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `devName` | string | **required** | Your developer identifier |
| `evictionStrategy` | `"hook"` \| `"passive"` | `"passive"` | Default eviction strategy |
| `evictionKeepTagged` | string[] | `["#keep"]` | Tags that protect observations from eviction |
| `maintenanceSchedule` | `"weekly"` \| `"biweekly"` \| `"monthly"` | `"monthly"` | Auto-maintenance frequency |
| `maintenancePruneOlderThanDays` | number | `90` | Max age for low-value observations |
| `maintenancePruneScoreThreshold` | number | `0.3` | Score threshold for pruning |
| `mergeCapPerProject` | number | `500` | Max observations in merged output |
| `exportSchedule` | string | `"friday:16:00"` | Default export schedule |
| `logLevel` | string | `"info"` | Log verbosity |
| `claudeMemDbPath` | string | `~/.claude-mem/claude-mem.db` | Path to claude-mem's database |
| `contributionRetentionDays` | number | `30` | Days to keep processed contribution files before auto-cleanup |

### Per-Project Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Whether this project participates in sync |
| `memProject` | string | key name | Project name in claude-mem's DB |
| `remote.type` | `"github"` \| `"gitlab"` \| `"bitbucket"` | `"github"` | Git provider |
| `remote.repo` | string | **required** | Repo in `owner/name` format |
| `remote.branch` | string | `"main"` | Branch to push/pull |
| `remote.autoMerge` | boolean | `true` | Push directly or create PR/MR |
| `remote.host` | string | auto | Custom host for self-hosted instances (e.g., `git.company.com`) |
| `export.types` | string[] | `[]` | Observation types to export |
| `export.keywords` | string[] | `[]` | Keywords to match |
| `export.tags` | string[] | `[]` | Tags to match (e.g., `#shared`) |
| `export.schedule` | string | inherits global | Per-project schedule override |

### Filter Configuration

Filters are combined with **OR**. An observation is exported if it matches **any** criterion:

```
exported = matchesType(obs, types) OR matchesKeyword(obs, keywords) OR matchesTag(obs, tags)
```

If all filter arrays are empty, nothing is exported (safe default).

### Tag System

claude-mem has no native tag system. Tags like `#shared` and `#keep` work via free-text search across the `title`, `narrative`, and `text` fields of observations.

- **`#shared`** — mark observations for team export
- **`#keep`** — protect observations from eviction (score = Infinity)

## CLI Reference

### `mem-sync init`

Interactive setup wizard. Creates config, optionally installs hook and scheduled tasks.

### `mem-sync export [--project <name>] [--all] [--dry-run]`

Export filtered observations to the remote git repo.

### `mem-sync import [--project <name>] [--all]`

Import merged memories from the remote repo into your local claude-mem database.

### `mem-sync preview [--project <name>] [--all]`

Dry-run showing what would be exported, with no side effects.

### `mem-sync maintain`

Full maintenance cycle: backup, score-based pruning, FTS rebuild, ANALYZE, VACUUM, integrity check.

### `mem-sync status`

Health check dashboard showing DB sizes, observation counts, hook status, and per-project export/import history.

### `mem-sync schedule install`

Install OS-specific scheduled tasks (cron on Linux, launchd on macOS, Task Scheduler on Windows).

### `mem-sync schedule remove`

Remove all scheduled tasks created by `schedule install`.

### `mem-sync dashboard [--port <N>]`

Launch a web dashboard at `http://localhost:3737` (default port). Features:

- **Overview** — stat cards, project health, DB sizes, hook status
- **Observations** — searchable, filterable table with pagination and scoring
- **Analytics** — type distribution (doughnut), activity timeline (line), top scored (bar), developer contributions (bar)
- **Access Map** — GitHub-style heatmap of daily access patterns, most accessed observations
- **Sync History** — monthly export/import chart, recent exports/imports tables

```bash
mem-sync dashboard              # Opens at http://localhost:3737
mem-sync dashboard --port 8080  # Custom port
```

The dashboard uses a dark theme with glassmorphism design, Chart.js visualizations, and animated counters. It reads directly from your local claude-mem DB and access.db — no network required.

### `mem-sync ci-merge`

CI-only command for automated merging. Works with GitHub Actions, GitLab CI, and Bitbucket Pipelines.

```bash
mem-sync ci-merge \
  --contributions-dir contributions/ \
  --output-dir merged/ \
  --state-file .merge-state.json \
  --cap 500 \
  --retention-days 30
```

The `--retention-days` flag controls how long processed contribution files are kept before automatic cleanup (default: 30 days).

## Eviction & Scoring

### The Problem

Without eviction, databases grow unboundedly. A team of 12 developers sharing weekly would accumulate thousands of observations per project within months.

### Hook Mode (recommended)

Uses real access data from the PostToolUse hook:

```
score = (type_weight * 0.3) + (recency_weight * 0.2) + (access_weight * 0.5)
```

| Component | Formula | Range |
|-----------|---------|-------|
| `type_weight` | Fixed per type (decision=1.0, bugfix=0.9, feature=0.7, discovery=0.5, refactor=0.4, change=0.3) | 0–1 |
| `recency_weight` | `1 / (1 + ln(1 + days_old / 150))` | 0–1 |
| `access_weight` | `accesses / max_accesses` (normalized) | 0–1 |

### Passive Mode (fallback)

No hook required. Uses diffusion across developers as a value proxy:

```
score = (type_weight * 0.4) + (recency_weight * 0.3) + (diffusion_weight * 0.3)
```

`diffusion_weight = devs_who_have_it / total_devs`

### #keep — Protecting Critical Memories

Observations with `#keep` in their title, narrative, or text get `score = Infinity` and are never pruned.

### Configuring Weights

```json
"eviction": {
  "strategy": "hook",
  "scoring": {
    "typeWeight": 0.3,
    "recencyWeight": 0.2,
    "thirdWeight": 0.5
  }
}
```

Weights must sum to 1.0.

## Destination Patterns

### Pattern A: Dedicated repo (recommended)

One repo per team/org for all project memories. Clean separation, one Action to maintain.

### Pattern B: In-project folder

Memories stored in `.shared-memories/` inside each project repo. Simpler but adds JSON to code repos.

### Pattern C: Hybrid

Dedicated repo with a pointer file (`.claude-mem-sync.json`) in each project repo.

| | Dedicated repo | In-project | Hybrid |
|---|---|---|---|
| **Separation** | Clean | Mixed | Clean |
| **Setup** | Extra repo | Zero | Extra repo + pointer |
| **Scalability** | Excellent | Per-project Actions | Excellent |
| **Best for** | Teams of 3+ | Solo / small teams | Large orgs |

## CI/CD Integration

The merge bot automatically merges contribution files when developers push exports. Templates are provided for all major platforms.

### GitHub Actions

```bash
cp templates/github-action/merge-memories.yml .github/workflows/
```

### GitLab CI

```bash
cp templates/gitlab-ci/merge-memories.yml .gitlab-ci.yml
```

### Bitbucket Pipelines

```bash
cp templates/bitbucket-pipelines/merge-memories.yml bitbucket-pipelines.yml
```

All templates run `mem-sync ci-merge` which handles merging, dedup, eviction, and contribution cleanup.

### `.merge-state.json`

Tracks which contribution files have been processed, preventing re-merging. Committed to the repo alongside merged output.

## Scheduling

### Automatic

```bash
mem-sync schedule install   # Detects OS, installs scheduled tasks
mem-sync schedule remove    # Removes all scheduled tasks
```

### Manual: Linux (cron)

```cron
# Export (Friday 16:00)
0 16 * * 5 mem-sync export --all >> ~/.claude-mem-sync/logs/export.log 2>&1
# Import (Saturday 09:00)
0 9 * * 6 mem-sync import --all >> ~/.claude-mem-sync/logs/import.log 2>&1
# Maintenance (1st of month, 03:00)
0 3 1 * * mem-sync maintain >> ~/.claude-mem-sync/logs/maintain.log 2>&1
```

### Manual: macOS (launchd)

`mem-sync schedule install` creates plist files in `~/Library/LaunchAgents/`. See the design spec for plist format details.

### Manual: Windows (Task Scheduler)

```powershell
schtasks /create /tn "claude-mem-sync-export" /tr "mem-sync export --all" /sc weekly /d FRI /st 16:00 /rl LIMITED /f
schtasks /create /tn "claude-mem-sync-import" /tr "mem-sync import --all" /sc weekly /d SAT /st 09:00 /rl LIMITED /f
schtasks /create /tn "claude-mem-sync-maintain" /tr "mem-sync maintain" /sc monthly /d 1 /st 03:00 /rl LIMITED /f
```

## Maintenance

### What `mem-sync maintain` Does

1. **Backup** — copies DB to `claude-mem.db.backup`
2. **Pruning** — removes low-score observations older than threshold (respects `#keep`)
3. **FTS rebuild** — rebuilds all FTS5 indexes
4. **Optimize** — runs `ANALYZE` and `VACUUM`
5. **Integrity check** — if it fails, restores from backup

### Emergency: Restoring from Backup

```bash
cp ~/.claude-mem/claude-mem.db.backup ~/.claude-mem/claude-mem.db
```

## Security

### What Gets Exported

Only observations matching your configured filters (types, keywords, tags) are exported. Empty filters = nothing exported.

### Best Practices

- **Always preview first**: `mem-sync preview` before your first export
- **Use PR review mode**: set `autoMerge: false` for human review
- **Private repos only**: the shared memories repo should always be private
- **Review your filters**: observations can contain code with secrets, tokens, or internal URLs

## Architecture

- **Export + hook are read-only** on claude-mem's DB
- **Import is the only write operation** — uses transactions with rollback safety
- **access.db** is a separate tracking database — never touches claude-mem's schema
- **`PRAGMA busy_timeout = 5000`** on all connections for WAL contention handling

## Troubleshooting

### "Config not found"

Run `mem-sync init` to create the config file.

### "CLI is required for PR-based export"

Install the CLI for your provider:
- **GitHub**: [gh](https://cli.github.com/)
- **GitLab**: [glab](https://gitlab.com/gitlab-org/cli)
- **Bitbucket**: `curl` (uses REST API)

Or set `autoMerge: true` to use direct push instead of PR/MR mode.

### "No observations match export filters"

Check your filter config. Use `mem-sync preview` to see what matches. All empty filters = nothing exported (safe default).

### Hook not tracking accesses

Verify the plugin is installed: `claude /plugin list`. The hook matches tools prefixed with `mcp__plugin_claude-mem_mcp-search__`.

## License

MIT
