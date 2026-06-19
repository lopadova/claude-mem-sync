# Troubleshooting

::: collapsible "Config not found"
Run `mem-sync init`.
:::

::: collapsible "No observations match filters"
Run `mem-sync preview --project <name>` and inspect `types`, `keywords`, and `tags`.
:::

::: collapsible "Hook not tracking accesses"
Confirm the Claude Code plugin is enabled and memory search tools are being used.
:::

::: collapsible "External API disabled"
Set both `distillation.enabled` and `distillation.allowExternalApi` to true only after approval.
:::

```bash
mem-sync status
mem-sync preview --project my-app
mem-sync dashboard
```
