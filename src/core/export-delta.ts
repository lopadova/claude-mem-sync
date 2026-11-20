import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { Observation } from "../types/observation";

const key = (o: Observation) => `${o.memory_session_id}|${o.title}|${o.created_at_epoch}`;

function keysOf(file: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    return new Set((parsed.observations as Observation[]).map(key));
  } catch {
    return new Set(); // missing/unreadable => nothing known (self-heal: re-export)
  }
}

/**
 * Observations not in the newest contribution file of `devDir` (sortable timestamp
 * filenames) nor in the merged file. Merged is included so CI purging the last
 * contribution file never causes a full re-export.
 */
export function newSinceLastExport(
  devDir: string,
  mergedFile: string,
  observations: Observation[],
): Observation[] {
  const last = existsSync(devDir)
    ? readdirSync(devDir).filter((f) => f.endsWith(".json")).sort().at(-1)
    : undefined;
  const known = new Set([
    ...(last ? keysOf(join(devDir, last)) : []),
    ...(existsSync(mergedFile) ? keysOf(mergedFile) : []),
  ]);
  return observations.filter((o) => !known.has(key(o)));
}
