// Restore a dump produced by `pnpm backup:db` into the running database.
// DESTRUCTIVE: pg_restore --clean drops and recreates the dumped objects.
// Usage: pnpm restore:db <dump-file> [--yes]   (file must be in $BACKUP_DIR/db)
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  composeRun,
  confirmDestructive,
  ensureBackupDir,
  requireEnv,
} from "./lib.mjs";

const database = requireEnv("POSTGRES_DB");
const dumpsDir = ensureBackupDir("db");

const requested = process.argv[2];
if (!requested || requested.startsWith("--")) {
  const available = readdirSync(dumpsDir)
    .filter((name) => name.endsWith(".dump"))
    .sort();
  console.error("Usage: pnpm restore:db <dump-file> [--yes]");
  console.error(
    available.length
      ? `Available in ${dumpsDir}:\n  ${available.join("\n  ")}`
      : `No dumps found in ${dumpsDir} — run pnpm backup:db first.`
  );
  process.exit(1);
}

// Basename only: the file is read inside the container at /backups/db/<name>.
const file = path.basename(requested);
if (!existsSync(path.join(dumpsDir, file))) {
  console.error(`Dump not found: ${path.join(dumpsDir, file)}`);
  process.exit(1);
}

await confirmDestructive(
  `About to DROP and recreate all dumped objects in database "${database}" ` +
    `from ${file}.\nStop the api first: docker compose stop api`,
  database
);
composeRun("restore-db", { RESTORE_FILE: file });
