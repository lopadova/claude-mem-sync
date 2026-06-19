# Config Schema

## Global fields

| Field | Type | Default |
| --- | --- | --- |
| `devName` | string | required |
| `claudeMemDbPath` | string | `~/.claude-mem/claude-mem.db` |
| `evictionStrategy` | `hook` or `passive` | `passive` |
| `mergeCapPerProject` | number | `500` |
| `exportSchedule` | string | `friday:16:00` |

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
