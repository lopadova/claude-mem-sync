import { defineConfig } from "tsup";
import pkg from "./package.json";

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
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
});
