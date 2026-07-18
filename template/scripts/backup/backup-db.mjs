// Dump the app database (pg_dump custom format, run inside a one-shot
// postgres:17-alpine container) into $BACKUP_DIR/db/, then prune dumps older
// than $BACKUP_RETENTION_DAYS. Requires the compose stack to be running.
import { composeRun, ensureBackupDir, requireEnv } from "./lib.mjs";

requireEnv("BACKUP_RETENTION_DAYS");
ensureBackupDir("db");
composeRun("backup-db");
