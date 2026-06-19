# Memory Sync Model

## Motivazione

Each developer keeps a local database. The shared repo contains selected observations and derived artifacts.

## Teoria

$$
M_{p,t} = cap(dedupe(\bigcup C_{p,d,t}))
$$

`C` is a developer contribution set, `dedupe` removes duplicate observations, and `cap` enforces retention.

```mermaid
flowchart TD
  A[Local DB Alice] --> C1[Contribution]
  B[Local DB Bob] --> C2[Contribution]
  C1 --> U[Union]
  C2 --> U
  U --> D[Deduplicate]
  D --> S[Score and cap]
  S --> M[Merged artifact]
```

::: callout warning "Limit"
The project syncs selected observations, not full Claude session state.
:::
