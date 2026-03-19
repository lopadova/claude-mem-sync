# claude-mem-sync

> Team memory sharing for [claude-mem](https://docs.claude-mem.ai) — sync AI memories across developers via git.

![github-banner-team-memory.png](resources/github-banner-team-memory.png)

![overview.png](resources/overview.png)
---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [What It Does](#what-it-does)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [CLI Reference](#cli-reference)
- [Web Dashboard](#web-dashboard)
- [Developer Knowledge Profiles](#developer-knowledge-profiles)
- [Knowledge Distillation](#knowledge-distillation)
- [Eviction & Scoring](#eviction--scoring)
- [Destination Patterns](#destination-patterns)
- [CI/CD Integration](#cicd-integration)
- [Scheduling](#scheduling)
- [Maintenance](#maintenance)
- [Security & Privacy](#security--privacy)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

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
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                    ┌────────────┐      ┌────────────┐
                    │  profiles/ │      │ distilled/ │
                    │  per-dev   │      │ rules.md   │
                    │  metrics   │      │ kb.md      │
                    └────────────┘      └────────────┘
                    (deterministic)     (LLM-powered)
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
- **Web dashboard** — 9-tab dark-theme UI with charts, heatmaps, profiles, and analytics
- **Rich analytics** — type distribution, access patterns, developer contributions, observation scoring
- **Developer knowledge profiles** — per-dev metrics: knowledge spectrum, concept map, file coverage, temporal patterns, survival rate
- **Knowledge distillation** — LLM-powered extraction of CLAUDE.md rules and knowledge docs from team observations
- **Team insights** — knowledge gaps detection, concept coverage heatmaps, bus-factor risk analysis
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
| `profiles.enabled` | boolean | `false` | Enable developer knowledge profile generation |
| `profiles.anonymizeOthers` | boolean | `true` | Show "your data vs team average" — never name other devs |
| `distillation.enabled` | boolean | `false` | Enable LLM-powered knowledge distillation |
| `distillation.model` | string | `"claude-sonnet-4-20250514"` | Anthropic model for distillation |
| `distillation.schedule` | `"after-merge"` \| `"weekly"` \| `"manual"` | `"after-merge"` | When to run distillation |
| `distillation.excludeTypes` | string[] | `[]` | Observation types to exclude from distillation |
| `distillation.minObservations` | number | `20` | Minimum observations required to run distillation |
| `distillation.reviewers` | string[] | `[]` | GitHub usernames to request review on distillation PRs |
| `distillation.maxTokenBudget` | number | `100000` | Max estimated tokens per API call |
| `distillation.allowExternalApi` | boolean | `false` | Must be `true` to send data to Anthropic API |

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

### `mem-sync profile [--dev <name>] [--project <name>] [--format md|json]`

Generate developer knowledge profiles from contribution and merged data.

```bash
mem-sync profile --project my-project                    # All devs
mem-sync profile --project my-project --dev alice        # Single dev
mem-sync profile --project my-project --format md        # Markdown output
mem-sync profile --project my-project --dry-run          # Preview only
```

Output is written to `profiles/{project}/{devName}/profile.json` (and `.md` with `--format md`). See [Developer Knowledge Profiles](#developer-knowledge-profiles) for details.

### `mem-sync distill --project <name> [--api-key <KEY>] [--dry-run]`

Run LLM-powered knowledge distillation on merged observations.

```bash
mem-sync distill --project my-project --dry-run          # Preview without API call
mem-sync distill --project my-project                    # Run distillation
mem-sync distill --project my-project --api-key sk-...   # Explicit API key
```

Requires `distillation.enabled: true` and `distillation.allowExternalApi: true` in config. API key via `--api-key` or `ANTHROPIC_API_KEY` env var. See [Knowledge Distillation](#knowledge-distillation) for details.

### `mem-sync dashboard [--port <N>]`

Launch a web dashboard at `http://localhost:3737` (default port) with 9 tabs:

- **Overview** — stat cards, project health, DB sizes, hook status
- **Observations** — searchable, filterable table with pagination and scoring
- **Search** — FTS5 full-text search across all observations
- **Analytics** — type distribution, activity timeline, top scored, developer contributions
- **Access Map** — GitHub-style heatmap of daily access patterns, most accessed observations
- **Sync History** — monthly export/import chart, recent exports/imports tables
- **Dev Profiles** — per-developer knowledge spectrum, concept map, file coverage, temporal pattern charts
- **Team Insights** — team averages, concept coverage, knowledge gap detection (bus-factor risk)
- **Distilled** — distilled rules, knowledge base, report stats, API cost tracking

```bash
mem-sync dashboard              # Opens at http://localhost:3737
mem-sync dashboard --port 8080  # Custom port
```

The dashboard uses a dark theme with glassmorphism design, Chart.js visualizations, and animated counters. It reads directly from your local claude-mem DB, access.db, and contribution/profile/distillation files.

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

## Web Dashboard

Launch a local web dashboard to visualize your team's shared memories, access patterns, profiles, and distilled knowledge.

```bash
mem-sync dashboard              # http://localhost:3737
mem-sync dashboard --port 8080  # custom port
```

### Screenshots

![overview.png](resources/overview.png)
![analytics.png](resources/analytics.png)
![observations.png](resources/observations.png)
![memory-details.png](resources/memory-details.png)
![search-memories.png](resources/search-memories.png)

### Tabs

| Tab | What it shows |
|-----|---------------|
| **Overview** | Stat cards (observations, sessions, access events, DB size), project cards with merge cap progress bars, health indicators |
| **Observations** | Full-text search, type/project filters, paginated table with eviction scores, click-to-detail modal |
| **Search** | FTS5 full-text search with `AND`, `OR`, `NOT`, `"exact phrase"` syntax, type/project filters, snippet highlighting |
| **Analytics** | Type distribution (doughnut chart), activity timeline (line chart), top observations by score (horizontal bar), developer contributions (grouped bar) |
| **Access Map** | GitHub-style heatmap of daily access patterns (6 months), top 20 most accessed observations with bar indicators |
| **Sync History** | Monthly export/import stacked bar chart, recent exports table, recent imports table |
| **Dev Profiles** | Developer selector dropdown, knowledge spectrum doughnut chart (your types vs team average), top concepts bar chart (you vs team), monthly activity line chart, file coverage bar chart, KPI cards (total obs, concept coverage %, survival rate %, avg/week) |
| **Team Insights** | Team KPI cards (devs, avg obs/dev, avg survival rate, avg concept coverage), team type distribution doughnut, concept coverage bar chart (red = knowledge gaps), knowledge gaps table with bus-factor risk indicators |
| **Distilled** | Distilled rules rendered as markdown, knowledge base content, report KPI cards (rules generated, avg confidence, knowledge sections, API cost + token usage) |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/overview` | GET | Overview stats, project list, DB sizes |
| `/api/observations` | GET | Paginated observations with search/filter |
| `/api/observations/:id` | GET | Single observation detail |
| `/api/search` | GET | FTS5 search with pagination |
| `/api/analytics/types` | GET | Type distribution counts |
| `/api/analytics/timeline` | GET | Monthly sync timeline |
| `/api/analytics/scores` | GET | Observation eviction scores |
| `/api/analytics/devs` | GET | Developer contribution stats |
| `/api/access/top` | GET | Most accessed observations |
| `/api/access/heatmap` | GET | Daily access heatmap data |
| `/api/sync/history` | GET | Export/import history |
| `/api/profiles/devs` | GET | List of developer names |
| `/api/profiles/:devName` | GET | Developer profile data |
| `/api/team/overview` | GET | Team aggregate metrics |
| `/api/team/concepts` | GET | Team concept coverage + knowledge gaps |
| `/api/distilled/rules` | GET | Distilled rules markdown |
| `/api/distilled/kb` | GET | Knowledge base markdown |
| `/api/distilled/report` | GET | Distillation report + feedback |
| `/api/distilled/feedback` | POST | Submit rule accept/reject feedback |

### Design

- Dark theme with glassmorphism cards and gradient accents
- Chart.js 4 for interactive visualizations
- Inter font, animated counters, hover effects
- Responsive layout (sidebar collapses on mobile)
- Zero frameworks — vanilla JS SPA, single HTML file
- Reads directly from local SQLite databases + contribution/profile/distillation files

## Developer Knowledge Profiles

Generate per-developer analytics from contribution and merged data — no LLM required, zero API cost, fully deterministic.

### What It Computes

Each developer profile contains 5 metrics:

| Metric | What it measures |
|--------|-----------------|
| **Knowledge Spectrum** | Type distribution (decision/bugfix/feature/discovery/refactor/change) with counts, percentages, and comparison against team average |
| **Concept Map** | Frequency table of concepts extracted from observations, highlighting concepts the dev hasn't covered vs the team (knowledge gaps) |
| **File Coverage** | Directories and files touched, with a specialization index (1 = concentrated in few dirs, 0 = spread across many) |
| **Temporal Pattern** | Observations per week/month with average and consistency score (1 = steady, 0 = sporadic) |
| **Contribution Survival Rate** | Percentage of the dev's exported observations that survived into the merged set — a natural quality proxy |

### Usage

```bash
# Generate profiles for all developers in a project
mem-sync profile --project my-project

# Single developer
mem-sync profile --project my-project --dev alice

# Markdown output (alongside JSON)
mem-sync profile --project my-project --format md

# Preview without writing files
mem-sync profile --project my-project --dry-run
```

### Output

```
profiles/
  my-project/
    alice/
      profile.json       # Full profile data
      profile.md         # Human-readable markdown
    bob/
      profile.json
    team-overview.json   # Team aggregate metrics
```

### Team Overview

When profiles are generated for multiple developers, a `team-overview.json` is also produced with:

- Total developers count
- Average observations per developer
- Average survival rate across the team
- Average concept diversity (coverage percentage)
- Aggregated type distribution

### Team Concepts & Knowledge Gaps

The team concepts analysis identifies **knowledge bus-factor risks** — concepts known by only 1 developer. Visible in the dashboard's Team Insights tab and available via the `/api/team/concepts` endpoint.

### Configuration

```json
{
  "global": {
    "profiles": {
      "enabled": true,
      "anonymizeOthers": true
    }
  }
}
```

- **`enabled`**: `false` by default — opt-in to profile generation
- **`anonymizeOthers`**: `true` by default — profiles show "your data vs team average", never naming other developers

### Privacy Model

- Profiles are opt-in (`enabled: false` default)
- No developer rankings or cross-dev comparisons (toxic for team dynamics)
- When `anonymizeOthers` is enabled, all comparisons use anonymized team averages
- A developer controls their own visibility by enabling/disabling export
- No judgmental language — neutral data descriptions only

### CI Integration

The `merge-memories.yml` GitHub Action template automatically generates profiles after each merge:

```yaml
- name: Generate developer profiles
  run: mem-sync profile --all --contributions-dir contributions/ --output-dir merged/
  continue-on-error: true
```

---

## Knowledge Distillation

Analyze merged team observations with an LLM to extract actionable rules and knowledge documentation. Produces CLAUDE.md-compatible rules and grouped knowledge patterns.

### What It Produces

Three artifacts in `distilled/{project}/`:

| Artifact | Description |
|----------|-------------|
| **`rules.md`** | CLAUDE.md-compatible rules with rationale, confidence scores, source evidence counts, and dev diversity metrics. Grouped by category (architecture, testing, security, performance, conventions, workflow, data, dependencies). |
| **`knowledge-base.md`** | Knowledge documentation grouped by concept clusters. Each section includes patterns, anti-patterns, and descriptions synthesized from observations. |
| **`distillation-report.json`** | Machine-readable metadata: input stats, rules/sections generated, confidence distribution, token usage, estimated cost, model used, date range. |
| **`feedback.json`** | Rule feedback tracking: proposed/accepted/rejected/modified status per rule. Used by the dashboard for interactive rule review. |

### Usage

```bash
# Preview what would be sent to the API (no API call)
mem-sync distill --project my-project --dry-run

# Run distillation
mem-sync distill --project my-project

# Explicit API key (otherwise uses ANTHROPIC_API_KEY env var)
mem-sync distill --project my-project --api-key sk-ant-...
```

### How It Works

1. Loads merged observations from `merged/{project}/latest.json`
2. Filters out excluded types (configurable via `distillation.excludeTypes`)
3. Builds a structured prompt with system instructions and observation data
4. Calls the Anthropic Messages API (Claude Sonnet 4 by default)
5. Parses the JSON response using Zod schema validation
6. Writes `rules.md`, `knowledge-base.md`, `distillation-report.json`, and `feedback.json`

### Cost Estimation

| Observations | Input Tokens (est.) | Output Tokens (est.) | Cost per run | Monthly (weekly) |
|-------------|--------------------|--------------------|-------------|-----------------|
| 100 | ~10K | ~5K | ~$0.11 | ~$0.44 |
| 300 | ~30K | ~8K | ~$0.21 | ~$0.84 |
| 500 | ~50K | ~10K | ~$0.33 | ~$1.32 |

Costs based on Claude Sonnet 4 pricing ($3/MTok input, $15/MTok output).

### Configuration

```json
{
  "global": {
    "distillation": {
      "enabled": true,
      "model": "claude-sonnet-4-20250514",
      "schedule": "after-merge",
      "excludeTypes": [],
      "minObservations": 20,
      "reviewers": ["team-lead"],
      "maxTokenBudget": 100000,
      "allowExternalApi": true
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Must be `true` to run distillation |
| `model` | Anthropic model ID (default: Claude Sonnet 4) |
| `schedule` | `"after-merge"` (CI), `"weekly"`, or `"manual"` |
| `excludeTypes` | Observation types to exclude (e.g., `["change"]`) |
| `minObservations` | Minimum count before distillation runs (prevents low-signal output) |
| `reviewers` | GitHub usernames for PR review (CI workflow) |
| `maxTokenBudget` | Safety cap — aborts if estimated tokens exceed this |
| `allowExternalApi` | **Must be explicitly `true`** — ensures conscious decision to send data to Anthropic |

### Rules Quality

Each distilled rule includes:

- **Confidence score** (0.5–1.0) — based on evidence count and developer diversity
- **Source count** — number of observations supporting the rule
- **Source types** — which observation types contributed evidence
- **Dev diversity** — how many different developers contributed supporting observations
- **Category** — architecture, testing, security, performance, conventions, workflow, data, or dependencies

Rules below 0.5 confidence are not included. Rules are suggestions requiring human review — they are **never auto-merged** into CLAUDE.md.

### Feedback Loop

The dashboard's Distilled tab provides accept/reject/modify buttons for each rule. Feedback is stored in `distilled/{project}/feedback.json` and can be incorporated into future distillation runs (the next run can exclude rejected rules).

### CI Integration

A dedicated GitHub Action template is provided for automated distillation:

```bash
cp templates/github-action/distill-knowledge.yml .github/workflows/
```

This workflow:
1. Triggers after the `Merge Developer Memories` workflow completes
2. Runs `mem-sync distill --all`
3. Creates a PR with the distilled output (not auto-merged — always requires human review)
4. Assigns configured reviewers

Requires the `ANTHROPIC_API_KEY` secret set in the repository.

### Privacy Safeguards

- `allowExternalApi: false` by default — must be explicitly enabled
- Observations are pre-filtered before API calls (optional `excludeTypes`)
- System prompt instructs the LLM: no specific code snippets, file paths, or developer names in output
- Provenance cites counts and types only, not attribution
- Output delivered as PR, never auto-merged
- `excludeTypes` can be used to keep sensitive observation types (e.g., security bugfixes) out of the API payload

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

### Knowledge Distillation Workflow

An additional GitHub Action template is provided for automated distillation:

```bash
cp templates/github-action/distill-knowledge.yml .github/workflows/
```

This workflow triggers after the merge workflow completes, runs `mem-sync distill`, and creates a PR with distilled rules and knowledge docs for human review. Requires the `ANTHROPIC_API_KEY` repository secret.

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

## Security & Privacy

### What Gets Exported

Only observations matching your configured filters (types, keywords, tags) are exported. Empty filters = nothing exported.

### Best Practices

- **Always preview first**: `mem-sync preview` before your first export
- **Use PR review mode**: set `autoMerge: false` for human review
- **Private repos only**: the shared memories repo should always be private
- **Review your filters**: observations can contain code with secrets, tokens, or internal URLs

### Developer Profiles Privacy

- **Opt-in**: `profiles.enabled` is `false` by default
- **No rankings**: profiles show individual metrics vs anonymized team average — never cross-developer comparisons
- **`anonymizeOthers: true`** (default): comparisons use "team average", never naming other developers
- **Self-controlled**: a developer controls their visibility by enabling/disabling export

### Knowledge Distillation Privacy

- **Double opt-in**: both `distillation.enabled` and `distillation.allowExternalApi` must be explicitly `true`
- **Type exclusion**: `excludeTypes` keeps sensitive observation types out of API payloads
- **No code/names in output**: system prompt instructs the LLM to never include code snippets, file paths, or developer names
- **PR-based delivery**: distilled output is delivered as a pull request — never auto-merged
- **Provenance by counts**: rules cite "3 bugfix observations" not "from Alice's session"

## Architecture

- **Dual runtime** — works on Bun (v1.0+) and Node.js (v18+) via `src/core/compat.ts` abstraction layer
- **SQLite** — `bun:sqlite` on Bun, `better-sqlite3` on Node.js (auto-detected at startup)
- **Export + hook are read-only** on claude-mem's DB
- **Import is the only write operation** — uses transactions with rollback safety
- **access.db** is a separate tracking database — never touches claude-mem's schema
- **`PRAGMA busy_timeout = 5000`** on all connections for WAL contention handling
- **Multi-provider git** — GitHub, GitLab, Bitbucket with optional self-hosted host override
- **Array-based process spawning** — all shell commands use `child_process.spawn` with array args (no shell injection)
- **Profiler** — reads contribution/merged JSON files, computes metrics deterministically (no LLM, no API)
- **Distiller** — direct `fetch` to Anthropic Messages API (no SDK dependency), Zod-validated structured output
- **Dashboard** — pure Node.js HTTP server, 19 API endpoints, vanilla JS SPA with Chart.js 4

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
