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

  test("values just below and above the 1e12 threshold", () => {
    expect(epochToSeconds(999_999_999_999)).toBe(999_999_999_999); // < 1e12 -> seconds, untouched
    expect(epochToSeconds(1_000_000_000_001)).toBe(1_000_000_000); // >= 1e12 -> ms, scaled down
    expect(epochToMillis(999_999_999_999)).toBe(999_999_999_999_000);
    expect(epochToMillis(1_000_000_000_001)).toBe(1_000_000_000_001);
  });

  test("epochToIsoString is unit-agnostic and idempotent across equivalents", () => {
    expect(epochToIsoString(1700000000)).toBe(epochToIsoString(1700000000000));
  });

  test("normalization preserves chronological ordering across mixed units", () => {
    const olderInMs = 1700000000 * 1000; // older instant, ms
    const newerInSecs = 1750000000; // newer instant, seconds
    expect(epochToSeconds(olderInMs)).toBeLessThan(epochToSeconds(newerInSecs));
    expect(epochToMillis(olderInMs)).toBeLessThan(epochToMillis(newerInSecs));
  });

  test("zero is treated as seconds (epoch 0 -> 1970)", () => {
    expect(epochToSeconds(0)).toBe(0);
    expect(epochToMillis(0)).toBe(0);
    expect(epochToIsoString(0)).toBe("1970-01-01T00:00:00.000Z");
  });
});
