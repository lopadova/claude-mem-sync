import { TYPE_WEIGHTS } from "./constants";
import { epochToSeconds } from "./epoch";
import type { Observation } from "../types/observation";

export function calculateTypeWeight(type: string): number {
  return TYPE_WEIGHTS[type] ?? TYPE_WEIGHTS.change;
}

/**
 * Logarithmic decay: 1 / (1 + ln(1 + days_old / 150))
 * 1 week=~0.96, 1 month=~0.85, 6 months=~0.56, 1 year=~0.46, 3 years=~0.32
 */
export function calculateRecencyWeight(createdAtEpoch: number, nowEpoch: number): number {
  // Normalize both operands to seconds: created_at_epoch may be ms (current
  // claude-mem) or seconds (legacy/fixtures); nowEpoch is conventionally seconds.
  const created = epochToSeconds(createdAtEpoch);
  const now = epochToSeconds(nowEpoch);
  const daysOld = Math.max(0, (now - created) / 86400);
  return 1 / (1 + Math.log(1 + daysOld / 150));
}

export function calculateAccessWeight(accesses: number, maxAccesses: number): number {
  if (maxAccesses === 0) return 0;
  return accesses / maxAccesses;
}

export function calculateDiffusionWeight(devsWhoHaveIt: number, totalDevs: number): number {
  if (totalDevs === 0) return 0;
  return devsWhoHaveIt / totalDevs;
}

export interface ScoreInput {
  typeWeight: number;
  recencyWeight: number;
  accessWeight?: number;
  diffusionWeight?: number;
  weights: { typeWeight: number; recencyWeight: number; thirdWeight: number };
  mode: "hook" | "passive";
}

export function calculateScore(input: ScoreInput): number {
  const { typeWeight, recencyWeight, weights, mode } = input;
  const thirdComponent = mode === "hook"
    ? (input.accessWeight ?? 0)
    : (input.diffusionWeight ?? 0.5);

  return (
    typeWeight * weights.typeWeight +
    recencyWeight * weights.recencyWeight +
    thirdComponent * weights.thirdWeight
  );
}

export function hasKeepTag(obs: Observation, keepTags: string[]): boolean {
  const searchable = [obs.title, obs.narrative, obs.text]
    .filter(Boolean)
    .join(" ");

  return keepTags.some((tag) => searchable.includes(tag));
}
