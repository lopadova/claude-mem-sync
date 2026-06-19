# Eviction and Scoring

## Motivazione

Scoring prevents unbounded growth while keeping durable, useful observations.

## Teoria

Hook mode:

$$
score = 0.3t + 0.2r + 0.5a
$$

Passive mode:

$$
score = 0.4t + 0.3r + 0.3d
$$

`t` is type weight, `r` recency, `a` access, and `d` diffusion.

::: callout tip "#keep"
Observations containing `#keep` are protected from pruning.
:::

::: collapsible "ADR: deterministic scoring"
CI merge should be reproducible so teams can explain why observations survived or were evicted.
:::
