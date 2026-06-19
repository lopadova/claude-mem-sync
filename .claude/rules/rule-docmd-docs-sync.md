# Rule: docmd documentation sync is blocking

User-facing features or substantial README updates require a matching documentation update in `docs-site/docs` and a matching `navigation[]` entry in `docs-site/docmd.config.json`.

Before closing related work, run:

```bash
cd docs-site
npm run check
npm run build
```

Exceptions are allowed only for internal refactors, tooling-only changes, or cosmetic changes that do not alter user behavior. State the exception explicitly in the changelog, PR, or final work summary.

Blocking anti-patterns:

- Feature changes without docs.
- Public docs page not registered in navigation.
- MDX, JSX, or raw component tags in Markdown.
- New docs that skip verification.
- Search, sitemap, or LLM output left broken after doc structure changes.
