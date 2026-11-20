import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { Observation } from "../types/observation";

const key = (o: Observation) => `${o.memory_session_id}|${o.title}|${o.created_at_epoch}`;

/**
 * Observations not present in the newest contribution file of `devDir`
 * (filenames are sortable timestamps). No/unreadable file => everything is new.
 */
export function newSinceLastExport(devDir: string, observations: Observation[]): Observation[] {
  if (!existsSync(devDir)) return observations;
  const last = readdirSync(devDir).filter((f) => f.endsWith(".json")).sort().at(-1);
  if (!last) return observations;
  try {
    const prev = JSON.parse(readFileSync(join(devDir, last), "utf-8"));
    const seen = new Set((prev.observations as Observation[]).map(key));
    return observations.filter((o) => !seen.has(key(o)));
  } catch {
    return observations; // self-heal: unreadable last file => re-export
  }
}
