import { describe, test, expect } from "bun:test";
import { epochToSeconds, epochToMillis, epochToIsoString } from "../src/core/epoch";

/**
 * `created_at_epoch` is not stored consistently across the ecosystem: the
 * current claude-mem schema uses MILLISECONDS, while legacy rows and much of
 * this repo assume SECONDS. These helpers normalize by magnitude (>= 1e12 is
 * milliseconds; 1e12 ms is the year 2001, far above any plausible seconds value).
 */
describe("epoch normalization helpers", () => {
  const MS = 1781024952302; // 2026-06-09T17:09:12.302Z
  const SECS = 1781024952; // same instant, seconds

  test("epochToSeconds passes seconds through and converts milliseconds", () => {
    expect(epochToSeconds(SECS)).toBe(SECS);
    expect(epochToSeconds(MS)).toBe(SECS);
    expect(epochToSeconds(1710000000)).toBe(1710000000); // legacy seconds untouched
  });

  test("epochToMillis passes milliseconds through and scales seconds", () => {
    expect(epochToMillis(MS)).toBe(MS);
    expect(epochToMillis(1710000000)).toBe(1710000000000);
  });

  test("epochToIsoString yields the same instant for seconds and milliseconds", () => {
    expect(epochToIsoString(1710000000)).toBe(new Date(1710000000000).toISOString());
    expect(epochToIsoString(1710000000000)).toBe(new Date(1710000000000).toISOString());
    expect(epochToIsoString(MS)).toBe("2026-06-09T17:09:12.302Z");
  });

  test("1e12 boundary is treated as milliseconds", () => {
    // 1e12 ms = 2001-09-09; as seconds it would be year 33658 — implausible.
    expect(epochToSeconds(1e12)).toBe(1e9);
  });
});
