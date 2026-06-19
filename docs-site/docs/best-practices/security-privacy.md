# Security and Privacy

::: steps
1. **Use a private shared repository.**
2. **Preview filters before export.**
3. **Start with PR review mode.**
4. **Exclude sensitive types from distillation.**
5. **Keep external API disabled unless approved.**
:::

| Risk | Control |
| --- | --- |
| Secrets | filters and PR review |
| Internal URLs | private repo and restricted collaborators |
| Attribution | profile anonymization |
| External API transfer | double opt-in |

::: callout danger "No public memory repos"
Treat the shared memory repository like sensitive engineering documentation.
:::
