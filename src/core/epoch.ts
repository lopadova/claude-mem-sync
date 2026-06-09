/**
 * Epoch-unit normalization.
 *
 * `created_at_epoch` is not stored consistently across the ecosystem: the
 * current claude-mem schema stores MILLISECONDS, while older rows and large
 * parts of this repo assume SECONDS (display multiplied by 1000, scoring
 * compared against `Date.now() / 1000`). To avoid year-58408 dates (ms read as
 * seconds) or 1970 dates (seconds read as ms), normalize by magnitude:
 * anything >= 1e12 is treated as milliseconds. 1e12 ms is 2001-09-09; the same
 * number as seconds would be the year 33658, far beyond any real timestamp, so
 * the threshold cleanly separates the two units.
 */
const MS_THRESHOLD = 1e12;

/** Normalize an epoch to whole seconds, regardless of whether it was s or ms. */
export function epochToSeconds(epoch: number): number {
  return epoch >= MS_THRESHOLD ? Math.floor(epoch / 1000) : epoch;
}

/** Normalize an epoch to milliseconds, regardless of whether it was s or ms. */
export function epochToMillis(epoch: number): number {
  return epoch >= MS_THRESHOLD ? epoch : epoch * 1000;
}

/** Convert an epoch (seconds or milliseconds) to an ISO-8601 string. */
export function epochToIsoString(epoch: number): string {
  return new Date(epochToMillis(epoch)).toISOString();
}
