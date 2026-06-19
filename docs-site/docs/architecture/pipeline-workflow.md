# Pipeline and Workflow

```mermaid
flowchart LR
  A[Local observations] --> B[Filter]
  B --> C[Contribution JSON]
  C --> D[Git push or PR]
  D --> E[CI merge]
  E --> F[Merged latest]
  F --> G[Import]
  F --> H[Profiles]
  F --> I[Distillation]
```

## Worked example

```bash
mem-sync preview --project platform
mem-sync export --project platform
mem-sync profile --project platform --format md
mem-sync import --project platform
```

::: callout danger "Do not hand-edit merged output"
Fix source contributions or merge logic, then rerun `mem-sync ci-merge`.
:::
