import { describe, expect, test } from "bun:test";
import { generateSystemdService, generateSystemdTimer, getDefaultEntries, toOnCalendar } from "../src/core/scheduler";

describe("systemd units", () => {
  test("OnCalendar for weekly, daily and monthly", () => {
    expect(toOnCalendar({ dayOfWeek: 5, hour: 16, minute: 0 })).toBe("Fri *-*-* 16:00:00");
    expect(toOnCalendar({ dayOfWeek: null, hour: 9, minute: 5 })).toBe("*-*-* 09:05:00");
    expect(toOnCalendar({ dayOfMonth: 1, hour: 3, minute: 0, frequency: "monthly" })).toBe("*-*-01 03:00:00");
    expect(toOnCalendar({ dayOfMonth: 1, hour: 3, minute: 0, frequency: "biweekly" })).toBe("Sun *-*-* 03:00:00");
  });

  test("default entries render service + timer", () => {
    const [exp, imp] = getDefaultEntries("friday:16:00", "monthly");
    expect(generateSystemdTimer(exp)).toContain("OnCalendar=Fri *-*-* 16:00:00");
    expect(generateSystemdTimer(imp)).toContain("OnCalendar=Sat *-*-* 09:00:00");
    expect(generateSystemdTimer(exp)).toContain("Persistent=true");
    const svc = generateSystemdService(exp);
    expect(svc).toContain("ExecStart=/usr/bin/env mem-sync export --all");
    expect(svc).toContain("Type=oneshot");
  });
});
