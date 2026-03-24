#!/usr/bin/env bun
/**
 * Generates src/dashboard/html.ts from src/dashboard/index.html
 * by wrapping the HTML in a template literal with proper escaping.
 *
 * Usage: bun scripts/gen-dashboard-html.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const html = readFileSync(join(root, "src", "dashboard", "index.html"), "utf-8");

// Escape characters that are special inside template literals:
// 1. Backslashes: \ → \\
// 2. Backticks: ` → \`
// 3. Dollar-braces: ${ → \${
const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const ts = `// Auto-generated from src/dashboard/index.html
// To update: edit index.html then run: bun scripts/gen-dashboard-html.ts
export const DASHBOARD_HTML = \`${escaped}\`;
`;

writeFileSync(join(root, "src", "dashboard", "html.ts"), ts);
console.log(`Generated src/dashboard/html.ts (${ts.length} chars)`);
