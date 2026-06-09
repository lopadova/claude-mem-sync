/**
 * Epoch-unit normalization.
 *
 * `created_at_epoch` is not stored consistently across the ecosystem: the
 * current claude-mem schema stores MILLISECONDS, while older rows and large
 * parts of this repo assume SECONDS (display multiplied by 1000, scoring
 * compared against `Date.now() / 1000`). To avoid year-58408 dates (ms read as
 * seconds) or 1970 dates (seconds read as ms), normalize by magnitude:
 * anything >= 1e12 is treated as milliseconds.
 *
 * This is a heuristic, not an exact discriminator. It relies on the assumption
 * that any real timestamp here is either:
 *   - SECONDS in roughly 1973–33658 (1e8 … 1e12), or
 *   - MILLISECONDS at/after 2001-09-09 (>= 1e12, i.e. all real claude-mem data).
 * The only ambiguous case is a MILLISECOND timestamp BEFORE 2001-09-09
 * (< 1e12), which would be misread as seconds. claude-mem timestamps are always
 * recent (well after 2001), so this case does not occur in practice; callers
 * must not feed pre-2001 millisecond epochs through these helpers.
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
