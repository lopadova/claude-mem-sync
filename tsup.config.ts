import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "hooks/post-tool-use": "hooks/post-tool-use.ts",
  },
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  splitting: true,
  clean: true,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  external: ["better-sqlite3", "bun:sqlite"],
});
