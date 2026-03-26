import { homedir } from "os";
import { join } from "path";
import { LOGS_DIR, CONFIG_DIR } from "./constants";

// ---------------------------------------------------------------------------
// Schedule parsing
// ---------------------------------------------------------------------------

export interface ParsedSchedule {
  dayOfWeek: number | null; // 0=Sunday, 1=Monday, ..., 6=Saturday, null=everyday
  hour: number;
  minute: number;
}

const DAY_MAP: Record<string, number | null> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  everyday: null,
};

/**
 * Parse a schedule string like "friday:16:00" or "everyday:09:00" into structured form.
 */
export function parseSchedule(schedule: string): ParsedSchedule {
  const parts = schedule.toLowerCase().split(":");
  if (parts.length !== 3) {
    throw new Error(`Invalid schedule format: "${schedule}". Expected "day:HH:MM".`);
  }

  const [dayStr, hourStr, minuteStr] = parts;
  const dayOfWeek = DAY_MAP[dayStr];

  if (dayOfWeek === undefined) {
    throw new Error(
      `Invalid day "${dayStr}" in schedule. Expected one of: ${Object.keys(DAY_MAP).join(", ")}`,
    );
  }

  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour "${hourStr}" in schedule. Expected 0-23.`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid minute "${minuteStr}" in schedule. Expected 0-59.`);
  }

  return { dayOfWeek, hour, minute };
}

// ---------------------------------------------------------------------------
// Import schedule: morning after latest export
// ---------------------------------------------------------------------------

/**
 * Compute the import schedule — the morning after the export day, at 09:00.
 * If the export is daily, import is also daily at 09:00.
 */
export function getImportSchedule(exportSchedule: ParsedSchedule): ParsedSchedule {
  if (exportSchedule.dayOfWeek === null) {
    return { dayOfWeek: null, hour: 9, minute: 0 };
  }
  return {
    dayOfWeek: (exportSchedule.dayOfWeek + 1) % 7,
    hour: 9,
    minute: 0,
  };
}

// ---------------------------------------------------------------------------
// Maintenance schedule
// ---------------------------------------------------------------------------

export interface MaintenanceSchedule {
  /** Day-of-month (1-based) */
  dayOfMonth: number;
  hour: number;
  minute: number;
  frequency: "weekly" | "biweekly" | "monthly";
}

export function getMaintenanceSchedule(
  frequency: "weekly" | "biweekly" | "monthly",
): MaintenanceSchedule {
  // Monthly: 1st of month at 03:00. Weekly/biweekly: every Sunday at 03:00.
  return {
    dayOfMonth: 1,
    hour: 3,
    minute: 0,
    frequency,
  };
}

// ---------------------------------------------------------------------------
// Resolve mem-sync binary path
// ---------------------------------------------------------------------------

function getMemSyncBin(): string {
  // In a global install, the bin is on PATH as "mem-sync"
  return "mem-sync";
}

// ---------------------------------------------------------------------------
// Default entry set
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  name: string;
  command: string;
  args: string[];
  schedule: ParsedSchedule | MaintenanceSchedule;
  logFile: string;
}

export function getDefaultEntries(exportScheduleStr: string, maintenanceFrequency: "weekly" | "biweekly" | "monthly"): ScheduleEntry[] {
  const exportSched = parseSchedule(exportScheduleStr);
  const importSched = getImportSchedule(exportSched);
  const maintSched = getMaintenanceSchedule(maintenanceFrequency);
  const bin = getMemSyncBin();

  return [
    {
      name: "claude-mem-sync-export",
      command: bin,
      args: ["export", "--all"],
      schedule: exportSched,
      logFile: join(LOGS_DIR, "export.log"),
    },
    {
      name: "claude-mem-sync-import",
      command: bin,
      args: ["import", "--all"],
      schedule: importSched,
      logFile: join(LOGS_DIR, "import.log"),
    },
    {
      name: "claude-mem-sync-maintain",
      command: bin,
      args: ["maintain"],
      schedule: maintSched,
      logFile: join(LOGS_DIR, "maintain.log"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Linux — crontab
// ---------------------------------------------------------------------------

const CRON_DAY_MAP = [0, 1, 2, 3, 4, 5, 6]; // Sunday=0 maps to cron's 0

function toCronDayOfWeek(day: number): number {
  return CRON_DAY_MAP[day];
}

export function generateCrontabEntry(entry: ScheduleEntry): string {
  const sched = entry.schedule;
  const cmdLine = `${entry.command} ${entry.args.join(" ")} >> ${entry.logFile} 2>&1`;

  if ("frequency" in sched) {
    // Maintenance: monthly = 1st of month, weekly/biweekly = every Sunday
    if (sched.frequency === "monthly") {
      return `${sched.minute} ${sched.hour} ${sched.dayOfMonth} * * ${cmdLine}`;
    }
    // weekly/biweekly: cron doesn't natively support biweekly, use weekly
    return `${sched.minute} ${sched.hour} * * 0 ${cmdLine}`;
  }

  if (sched.dayOfWeek === null) {
    // Daily
    return `${sched.minute} ${sched.hour} * * * ${cmdLine}`;
  }

  return `${sched.minute} ${sched.hour} * * ${toCronDayOfWeek(sched.dayOfWeek)} ${cmdLine}`;
}

export function generateCrontabEntries(entries: ScheduleEntry[]): string {
  const lines = [
    "# Added by claude-mem-sync",
    ...entries.map((e) => {
      const comment = `# ${e.name}`;
      const cron = generateCrontabEntry(e);
      return `${comment}\n${cron}`;
    }),
    "# End claude-mem-sync",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// macOS — launchd plist
// ---------------------------------------------------------------------------

export function generateLaunchdPlist(entry: ScheduleEntry): string {
  const sched = entry.schedule;
  const home = homedir();
  const errorLog = entry.logFile.replace(".log", "-error.log");
  const args = [entry.command, ...entry.args]
    .map((a) => `    <string>${escapeXml(a)}</string>`)
    .join("\n");

  let calendarInterval: string;

  if ("frequency" in sched) {
    if (sched.frequency === "monthly") {
      calendarInterval = `  <key>StartCalendarInterval</key>
  <dict>
    <key>Day</key><integer>${sched.dayOfMonth}</integer>
    <key>Hour</key><integer>${sched.hour}</integer>
    <key>Minute</key><integer>${sched.minute}</integer>
  </dict>`;
    } else {
      // weekly (and biweekly treated as weekly for launchd)
      calendarInterval = `  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>0</integer>
    <key>Hour</key><integer>${sched.hour}</integer>
    <key>Minute</key><integer>${sched.minute}</integer>
  </dict>`;
    }
  } else if (sched.dayOfWeek === null) {
    // Daily: omit Weekday key, just Hour+Minute
    calendarInterval = `  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${sched.hour}</integer>
    <key>Minute</key><integer>${sched.minute}</integer>
  </dict>`;
  } else {
    calendarInterval = `  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>${sched.dayOfWeek}</integer>
    <key>Hour</key><integer>${sched.hour}</integer>
    <key>Minute</key><integer>${sched.minute}</integer>
  </dict>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.${entry.name}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  ${calendarInterval}
  <key>StandardOutPath</key>
  <string>${entry.logFile}</string>
  <key>StandardErrorPath</key>
  <string>${errorLog}</string>
</dict>
</plist>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Windows — Task Scheduler (schtasks)
// ---------------------------------------------------------------------------

const SCHTASKS_DAY_MAP = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Escape a value for use in a schtasks /tn or /tr double-quoted parameter */
function escapeSchtasksArg(s: string): string {
  // Reject characters that could break out of double-quoted schtasks parameters
  if (/["\n\r]/.test(s)) {
    throw new Error(`Invalid characters in schtasks argument: ${s}`);
  }
  return s;
}

export function generateSchtasksCommand(entry: ScheduleEntry): string {
  const sched = entry.schedule;
  const safeName = escapeSchtasksArg(entry.name);
  const safeCommand = escapeSchtasksArg(entry.command);
  const safeArgs = entry.args.map(escapeSchtasksArg);
  const tr = `${safeCommand} ${safeArgs.join(" ")}`;
  const time = `${String(("hour" in sched ? sched.hour : 0)).padStart(2, "0")}:${String(("minute" in sched ? sched.minute : 0)).padStart(2, "0")}`;

  if ("frequency" in sched) {
    if (sched.frequency === "monthly") {
      return `schtasks /create /tn "${safeName}" /tr "${tr}" /sc monthly /d ${sched.dayOfMonth} /st ${time} /rl LIMITED /f`;
    }
    return `schtasks /create /tn "${safeName}" /tr "${tr}" /sc weekly /d SUN /st ${time} /rl LIMITED /f`;
  }

  if (sched.dayOfWeek === null) {
    return `schtasks /create /tn "${safeName}" /tr "${tr}" /sc daily /st ${time} /rl LIMITED /f`;
  }

  const day = SCHTASKS_DAY_MAP[sched.dayOfWeek];
  return `schtasks /create /tn "${safeName}" /tr "${tr}" /sc weekly /d ${day} /st ${time} /rl LIMITED /f`;
}

/**
 * Generate schtasks arguments as an array for direct use with spawnCommand.
 * Includes log redirection in the /tr value.
 */
export function generateSchtasksArgs(entry: ScheduleEntry): string[] {
  const sched = entry.schedule;
  const tr = `cmd /c "${entry.command} ${entry.args.join(" ")} >> "${entry.logFile}" 2>&1"`;
  const time = `${String(("hour" in sched ? sched.hour : 0)).padStart(2, "0")}:${String(("minute" in sched ? sched.minute : 0)).padStart(2, "0")}`;

  const base = ["/create", "/tn", entry.name, "/tr", tr, "/st", time, "/rl", "LIMITED", "/f"];

  if ("frequency" in sched) {
    if (sched.frequency === "monthly") {
      return [...base, "/sc", "monthly", "/d", String(sched.dayOfMonth)];
    }
    return [...base, "/sc", "weekly", "/d", "SUN"];
  }

  if (sched.dayOfWeek === null) {
    return [...base, "/sc", "daily"];
  }

  const day = SCHTASKS_DAY_MAP[sched.dayOfWeek];
  return [...base, "/sc", "weekly", "/d", day];
}

export function generateSchtasksRemoveCommand(taskName: string): string {
  return `schtasks /delete /tn "${taskName}" /f`;
}

/**
 * Generate schtasks remove arguments as an array for direct use with spawnCommand.
 */
export function generateSchtasksRemoveArgs(taskName: string): string[] {
  return ["/delete", "/tn", taskName, "/f"];
}
