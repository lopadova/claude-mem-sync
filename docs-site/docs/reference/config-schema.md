# Config Schema

## Global fields

| Field | Type | Default |
| --- | --- | --- |
| `devName` | string | required |
| `claudeMemDbPath` | string | `~/.claude-mem/claude-mem.db` |
| `evictionStrategy` | `hook` or `passive` | `passive` |
| `mergeCapPerProject` | number | `500` |
| `exportSchedule` | string: `day:HH:MM` (day is a weekday or `everyday`), `hourly`, or `hourly:MM` | `friday:16:00` |

With `hourly` or `hourly:MM`, export runs every hour at that minute (default `:00`) and import runs 30 minutes later. Re-run `mem-sync schedule install` after changing the schedule.

## Project fields

| Field | Type |
| --- | --- |
| `enabled` | boolean |
| `memProject` | string |
| `remote.type` | `github`, `gitlab`, or `bitbucket` |
| `remote.repo` | string |
| `remote.branch` | string |
| `remote.autoMerge` | boolean |
| `export.types` | string array |
| `export.keywords` | string array |
| `export.tags` | string array |

::: callout warning "Authoritative schema"
Use repository `config.schema.json` for automation.
:::
