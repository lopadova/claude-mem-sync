import { test, expect } from "bun:test";
import {
  parseSchedule, getImportSchedule, generateCrontabEntry,
  generateLaunchdPlist, generateSchtasksArgs, type ScheduleEntry,
} from "../src/core/scheduler";

const entry = (s: string): ScheduleEntry => ({
  name: "x", command: "mem-sync", args: ["export"], schedule: parseSchedule(s), logFile: "/tmp/x.log",
});

test("hourly parses with optional minute and rejects bad minutes", () => {
  expect(parseSchedule("hourly")).toMatchObject({ hourly: true, minute: 0 });
  expect(parseSchedule("hourly:15")).toMatchObject({ hourly: true, minute: 15 });
  expect(() => parseSchedule("hourly:75")).toThrow();
  expect(() => parseSchedule("hourly:1:2")).toThrow();
});

test("import runs 30 minutes after hourly export", () => {
  expect(getImportSchedule(parseSchedule("hourly:15")).minute).toBe(45);
  expect(getImportSchedule(parseSchedule("hourly:45")).minute).toBe(15);
});

test("each backend emits an hourly trigger", () => {
  const e = entry("hourly:15");
  expect(generateCrontabEntry(e).startsWith("15 * * * * ")).toBe(true);
  expect(generateLaunchdPlist(e)).not.toContain("<key>Hour</key>");
  expect(generateSchtasksArgs(e)).toContain("hourly");
});
