---
name: docmd-docs
description: Maintain the claude-mem-sync public documentation site built with docmd.
---

# docmd docs maintenance

Use this skill when changing public documentation in `docs-site/`.

## Layout

- Source Markdown lives in `docs-site/docs`.
- Site config is `docs-site/docmd.config.json`.
- Static assets live in `docs-site/assets`.
- Every public page must be registered in `navigation[]`; the sidebar is config-driven.

## Commands

```bash
cd docs-site
npm run check
npm run build
```

Use `npm run dev` for local preview. Cloudflare Pages Option A: build command `npm run build`, output directory `_site`, root directory `docs-site`. Fallback Option B: build locally and upload `docs-site/_site`.

## Content standard

- Markdown only: no MDX, JSX, or raw component tags.
- Prefer task-first pages with Motivation, Design, Data model or contract, worked example, gotchas, and limits.
- Use Mermaid for workflows and KaTeX for formulas where it clarifies the concept.
- Use docmd containers: `::: callout`, `::: tabs`, `::: steps`, `::: collapsible`, `::: grids`, `::: grid`, and `::: card`.
- Never use `::: button`.
- Use Lucide icon names in navigation and container `icon:` options.

## Plugins and search

The site enables search with semantic indexing, git metadata, SEO, sitemap, Mermaid, Math, LLM output, and analytics disabled. Keep `.docmd-search/config.json` committed, but do not commit generated search batches unless project policy changes.

## Branding and footer

Primary color is `#0d9488`. Keep `assets/custom.css` in sync with brand variables and keep the official docs URL as `https://doc.claude-mem-sync.padosoft.com`.

## Gotchas

- `docs-site/scripts/check-no-raw-html.mjs` blocks JSX-style capitalized tags.
- If a page is missing from `navigation[]`, it is not part of the intended public sidebar.
- Verify generated `_site/index.html`, `llms.txt`, `sitemap.xml`, and semantic search artifacts after dependency updates.
