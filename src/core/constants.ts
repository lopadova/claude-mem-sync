import { homedir } from "os";
import { join } from "path";

export const PACKAGE_VERSION = "1.0.0";

export const CONFIG_DIR = join(homedir(), ".claude-mem-sync");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const ACCESS_DB_PATH = join(CONFIG_DIR, "access.db");
export const LOGS_DIR = join(CONFIG_DIR, "logs");

export const DEFAULT_CLAUDE_MEM_DB = join(homedir(), ".claude-mem", "claude-mem.db");

export const DEFAULT_MERGE_CAP = 500;
export const DEFAULT_CONTRIBUTION_RETENTION_DAYS = 30;
export const DEFAULT_PRUNE_OLDER_THAN_DAYS = 90;
export const DEFAULT_PRUNE_SCORE_THRESHOLD = 0.3;
export const DEFAULT_ACCESS_WINDOW_MONTHS = 6;
export const DEFAULT_EXPORT_SCHEDULE = "friday:16:00";
export const DEFAULT_MAINTENANCE_SCHEDULE = "monthly";
export const DEFAULT_LOG_LEVEL = "info";

export const BUSY_TIMEOUT_MS = 5000;

export const TYPE_WEIGHTS: Record<string, number> = {
  decision: 1.0,
  bugfix: 0.9,
  feature: 0.7,
  discovery: 0.5,
  refactor: 0.4,
  change: 0.3,
};

export const DEFAULT_KEEP_TAGS = ["#keep"];

export const EXPORT_JSON_VERSION = 1;

export const DEDUP_KEY_FIELDS = ["memory_session_id", "title", "created_at_epoch"] as const;
