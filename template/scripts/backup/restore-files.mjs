// Restore the uploads bucket from the $BACKUP_DIR/files mirror.
// Overwrites objects that differ; does NOT delete objects created after the
// backup (add --remove to the compose command for an exact restore).
// Usage: pnpm restore:files [--yes]
import {
  composeRun,
  confirmDestructive,
  ensureBackupDir,
  requireEnv,
} from "./lib.mjs";

const bucket = requireEnv("S3_BUCKET");
ensureBackupDir("files");
await confirmDestructive(
  `About to overwrite objects in bucket "${bucket}" from the local mirror.`,
  bucket
);
composeRun("restore-files");
