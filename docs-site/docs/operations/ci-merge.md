# CI Merge

`mem-sync ci-merge` turns contribution files into `merged/{project}/latest.json`.

```bash
mem-sync ci-merge
```

| Step | Output |
| --- | --- |
| Load contributions | candidate observations |
| Deduplicate | unique observations |
| Score | ordered candidates |
| Cap | bounded merged set |
| Profile | optional profile artifacts |

::: callout warning "CI permissions"
The workflow needs permission to commit generated artifacts back to the shared memory repository.
:::
