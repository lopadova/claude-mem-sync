import { existsSync } from "fs";
import { join } from "path";
import type { ParsedArgs } from "../cli";
import { loadConfig, getEnabledProjects, resolveProjectConfig } from "../core/config";
import {
  openMemDb,
  getObservationCount,
  getSessionCount,
  getSummaryCount,
  getDbSizeBytes,
  queryObservations,
} from "../core/mem-db";
import {
  openAccessDb,
  getLastExport,
  getLastImport,
  getTotalAccessLogEntries,
} from "../core/access-db";
import { matchesFilter } from "../core/filter";
import type { FilterConfig } from "../core/filter";
import {
  PACKAGE_VERSION,
  ACCESS_DB_PATH,
} from "../core/constants";
import { getPackageRoot } from "../core/compat";

function formatDate(epochSecs: number): string {
  const d = new Date(epochSecs * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatSizeMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function checkHookInstalled(): boolean {
  const hooksJsonPath = join(getPackageRoot(), "hooks", "hooks.json");
  return existsSync(hooksJsonPath);
}

export default async function run(_args: ParsedArgs): Promise<void> {
  const config = loadConfig();
  const dbPath = config.global.claudeMemDbPath;
  const enabledProjects = getEnabledProjects(config);

  // Global stats
  const dbSize = getDbSizeBytes(dbPath);
  const accessDbSize = getDbSizeBytes(ACCESS_DB_PATH);
  const hookInstalled = checkHookInstalled();

  const memDb = openMemDb(dbPath);
  const accessDb = openAccessDb(ACCESS_DB_PATH);

  try {
    const obsCount = getObservationCount(memDb);
    const sessionCount = getSessionCount(memDb);
    const summaryCount = getSummaryCount(memDb);
    const accessLogEntries = getTotalAccessLogEntries(accessDb);

    // Header
    const lines: string[] = [];
    lines.push(`claude-mem-sync v${PACKAGE_VERSION}`);
    lines.push("");

    // Global section
    lines.push("Global:");
    lines.push(`  claude-mem DB: ${dbPath} (${formatSizeMB(dbSize)} MB)`);
    lines.push(`  access.db: ${ACCESS_DB_PATH} (${formatSizeMB(accessDbSize)} MB)`);
    lines.push(`  Hook installed: ${hookInstalled ? "Yes" : "No"}`);
    lines.push(`  Eviction strategy: ${config.global.evictionStrategy}`);
    lines.push("");
    lines.push(`  Observations: ${obsCount} | Sessions: ${sessionCount} | Summaries: ${summaryCount}`);
    lines.push(`  Access log entries: ${accessLogEntries}`);
    lines.push("");

    // Projects section
    lines.push("Projects:");
    const allProjectNames = Object.keys(config.projects);
    const enabledSet = new Set(enabledProjects);

    for (const name of allProjectNames) {
      const enabled = enabledSet.has(name);
      const resolved = resolveProjectConfig(config, name);
      const mergeMode = resolved.remote.autoMerge ? "auto-merge" : "PR review";

      lines.push(`  ${name} (${enabled ? "enabled" : "disabled"})`);
      lines.push(`    Remote: ${resolved.remote.repo} (${mergeMode})`);

      // Last export
      const lastExp = getLastExport(accessDb, name);
      if (lastExp) {
        lines.push(`    Last export: ${formatDate(lastExp.exported_at)} (${lastExp.observations_count} observations)`);
      } else {
        lines.push("    Last export: never");
      }

      // Last import
      const lastImp = getLastImport(accessDb, name);
      if (lastImp) {
        lines.push(`    Last import: ${formatDate(lastImp.imported_at)} (${lastImp.observations_count} observations)`);
      } else {
        lines.push("    Last import: never");
      }

      // Exportable now: run the filter on current observations
      if (enabled) {
        const observations = queryObservations(memDb, resolved.memProject);
        const filter: FilterConfig = {
          types: resolved.export.types,
          keywords: resolved.export.keywords,
          tags: resolved.export.tags,
        };
        const exportable = observations.filter((obs) => matchesFilter(obs, filter));
        lines.push(`    Exportable now: ${exportable.length} observations`);
      }

      lines.push("");
    }

    // Maintenance section
    lines.push("Maintenance:");
    lines.push("  Last run: unknown");

    console.log(lines.join("\n"));
  } finally {
    memDb.close();
    accessDb.close();
  }
}
