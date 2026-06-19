import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../docs/", import.meta.url));
const pattern = /<\/?[A-Z][A-Za-z0-9]*(?:\s|>|\/>)/;
const failures = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const text = await readFile(path, "utf8");
      if (pattern.test(text)) failures.push(path);
    }
  }
}

await walk(root);
if (failures.length) {
  console.error("Raw JSX-style component tags are not allowed:");
  failures.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}
console.log("Markdown guard passed: no JSX-style component tags found.");
