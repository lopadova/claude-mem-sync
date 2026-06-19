# Quickstart

## Motivazione

`claude-mem` is local. `claude-mem-sync` adds a team loop without requiring a shared database.

::: steps
1. **Install the plugin**
   ```bash
   claude plugin marketplace add lopadova/claude-mem-sync
   claude plugin install claude-mem-sync@claude-mem-sync
   mem-sync --help
   ```
2. **Create config**
   ```bash
   mem-sync init
   ```
3. **Create the shared repo**
   ```bash
   mem-sync setup-repo my-team-memories
   ```
4. **Preview and export**
   ```bash
   mem-sync preview --project my-app
   mem-sync export --project my-app
   ```
5. **Import merged memories**
   ```bash
   mem-sync import --project my-app
   ```
:::

::: callout warning "Safe default"
Empty export filters match nothing. Add types, keywords, or tags deliberately.
:::

## Worked example

```json
{
  "global": { "devName": "alice", "claudeMemDbPath": "~/.claude-mem/claude-mem.db" },
  "projects": {
    "web-app": {
      "remote": { "type": "github", "repo": "acme/team-memories", "branch": "main", "autoMerge": false },
      "export": { "types": ["decision", "bugfix"], "tags": ["#shared"] }
    }
  }
}
```

::: collapsible "Gotcha: nothing exported"
Run `mem-sync preview --project web-app` and verify that at least one filter matches existing observations.
:::
