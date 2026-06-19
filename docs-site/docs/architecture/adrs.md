# ADRs

::: collapsible "ADR 001: Local-first memory"
Keep each developer's `claude-mem.db` local to preserve existing `claude-mem` behavior.
:::

::: collapsible "ADR 002: Git repository transport"
Use a private Git repository because teams already have review, history, permissions, and CI there.
:::

::: collapsible "ADR 003: Deterministic profiles"
Generate profiles without LLM calls so analytics are reproducible, private, and cheap.
:::

::: collapsible "ADR 004: Optional distillation"
Require explicit external API opt-in because observations can contain sensitive project context.
:::

::: collapsible "ADR 005: Config-driven filters"
Keep export filters in local config so sharing policy can vary by developer and project.
:::
