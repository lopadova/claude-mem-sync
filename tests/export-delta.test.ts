import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { newSinceLastExport } from "../src/core/export-delta";
import type { Observation } from "../src/types/observation";

const o = (title: string): Observation => ({
  id: 1, memory_session_id: "s", type: "decision", title, narrative: null, text: null,
  facts: null, concepts: null, files_read: null, files_modified: null, created_at_epoch: 1,
});

test("returns only observations missing from the newest file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ed-"));
  const none = join(dir, "no-merged.json");
  writeFileSync(join(dir, "2026-01-01T00-00-00.json"), JSON.stringify({ observations: [o("old")] }));
  writeFileSync(join(dir, "2026-01-02T00-00-00.json"), JSON.stringify({ observations: [o("A")] }));
  expect(newSinceLastExport(dir, none, [o("A"), o("B")]).map((x) => x.title)).toEqual(["B"]);
  expect(newSinceLastExport(dir, none, [o("old")]).length).toBe(1); // only the newest file counts
  expect(newSinceLastExport(join(dir, "none"), none, [o("A")]).length).toBe(1);
});

test("observations in merged/latest.json count as known even if the last file is gone", () => {
  const dir = mkdtempSync(join(tmpdir(), "ed-"));
  const merged = join(dir, "latest.json");
  writeFileSync(merged, JSON.stringify({ observations: [o("A")] }));
  expect(newSinceLastExport(join(dir, "none"), merged, [o("A"), o("B")]).map((x) => x.title)).toEqual(["B"]);
});
