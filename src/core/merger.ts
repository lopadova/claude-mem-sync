import type { Observation, ScoredObservation } from "../types/observation";
import {
  calculateTypeWeight,
  calculateRecencyWeight,
  calculateAccessWeight,
  calculateDiffusionWeight,
  calculateScore,
  hasKeepTag,
} from "./scoring";
import { DEDUP_KEY_FIELDS } from "./constants";

/**
 * Options for applyEvictionCap.
 * Supports both hook mode (access-based) and passive mode (diffusion-based).
 */
export interface EvictionCapOptions {
  observations: Observation[];
  cap: number;
  mode: "hook" | "passive";
  weights: { typeWeight: number; recencyWeight: number; thirdWeight: number };
  keepTags: string[];
  nowEpoch: number;
  /** Hook mode: map of observation id -> access count */
  accessCounts?: Map<number, number>;
  /** Hook mode: maximum access count across all observations */
  maxAccess?: number;
  /** Passive mode: map of observation id -> number of devs who have it */
  devCounts?: Map<number, number>;
  /** Passive mode: total number of devs */
  totalDevs?: number;
}

/**
 * Deduplicate observations by composite key: memory_session_id + title + created_at_epoch.
 * When duplicates are found, keep the first occurrence.
 */
export function deduplicateObservations(observations: Observation[]): Observation[] {
  const seen = new Set<string>();
  const result: Observation[] = [];

  for (const obs of observations) {
    const key = `${obs.memory_session_id}|${obs.title}|${obs.created_at_epoch}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(obs);
    }
  }

  return result;
}

/**
 * Score observations and enforce a cap, evicting lowest-scoring non-keep observations.
 *
 * - Observations with keep tags get score = Infinity (never evicted).
 * - If total <= cap, return all sorted by score descending.
 * - If total > cap, evict lowest-scoring non-keep observations until within cap.
 *   Keep-tagged observations always survive, even if their count exceeds the cap.
 */
export function applyEvictionCap(options: EvictionCapOptions): ScoredObservation[] {
  const {
    observations,
    cap,
    mode,
    weights,
    keepTags,
    nowEpoch,
    accessCounts,
    maxAccess,
    devCounts,
    totalDevs,
  } = options;

  if (observations.length === 0) return [];

  // Score every observation
  const scored: ScoredObservation[] = observations.map((obs) => {
    const isKeep = hasKeepTag(obs, keepTags);

    if (isKeep) {
      return { ...obs, score: Infinity };
    }

    const typeWeight = calculateTypeWeight(obs.type);
    const recencyWeight = calculateRecencyWeight(obs.created_at_epoch, nowEpoch);

    let accessWeight: number | undefined;
    let diffusionWeight: number | undefined;

    if (mode === "hook") {
      const accesses = accessCounts?.get(obs.id) ?? 0;
      accessWeight = calculateAccessWeight(accesses, maxAccess ?? 0);
    } else {
      const devCount = devCounts?.get(obs.id) ?? 0;
      diffusionWeight = calculateDiffusionWeight(devCount, totalDevs ?? 0);
    }

    const score = calculateScore({
      typeWeight,
      recencyWeight,
      accessWeight,
      diffusionWeight,
      weights,
      mode,
    });

    return { ...obs, score };
  });

  // Separate keep-tagged from regular
  const keepObservations = scored.filter((o) => o.score === Infinity);
  const regularObservations = scored.filter((o) => o.score !== Infinity);

  // Sort regular by score descending
  regularObservations.sort((a, b) => b.score - a.score);

  if (scored.length <= cap) {
    // Under cap: return all, sorted by score desc (Infinity first, then by score)
    return [...keepObservations, ...regularObservations];
  }

  // Over cap: keep all #keep observations, fill remaining slots with top-scored regular
  const remainingSlots = Math.max(0, cap - keepObservations.length);
  const survivors = [...keepObservations, ...regularObservations.slice(0, remainingSlots)];

  return survivors;
}
