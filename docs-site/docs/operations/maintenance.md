# Maintenance

```bash
mem-sync maintain
mem-sync status
```

::: steps
1. **Backup** the local database.
2. **Prune** low-score observations.
3. **Rebuild FTS** indexes.
4. **Optimize** SQLite.
5. **Validate** integrity and restore backup on failure.
:::

::: callout danger "Tune pruning carefully"
Use conservative `maintenancePruneOlderThanDays` and `maintenancePruneScoreThreshold` values.
:::
