# Configuration

`mem-sync init` creates `~/.claude-mem-sync/config.json`.

## Data model

```json
{
  "global": {
    "devName": "alice",
    "mergeCapPerProject": 500,
    "evictionStrategy": "passive",
    "profiles": { "enabled": false, "anonymizeOthers": true },
    "distillation": { "enabled": false, "allowExternalApi": false }
  },
  "projects": {
    "my-app": {
      "enabled": true,
      "remote": { "type": "github", "repo": "my-org/dev-memories", "branch": "main" },
      "export": { "types": ["decision"], "keywords": ["architecture"], "tags": ["#shared"] }
    }
  }
}
```

## Teoria

Filters are OR-based:

$$
exported = typeMatch \lor keywordMatch \lor tagMatch
$$

::: callout danger "Privacy boundary"
Run `mem-sync preview` before the first export and after every substantial filter change.
:::

::: collapsible "ADR: local config"
Developer identity, database path, and project remotes stay local because they are workstation-specific.
:::
