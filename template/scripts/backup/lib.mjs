// Shared helpers for the backup/restore wrappers. Plain Node, no deps, so
// they behave identically on Windows, macOS and Linux. Env comes from the
// `dotenv -e .env --` prefix in the root package.json scripts — same
// no-default policy as the apps: a missing variable is a hard error.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} — declare it in .env (see .env.example).`);
    process.exit(1);
  }
  return value;
}

// Resolve and pre-create BACKUP_DIR: bind-mounting a missing host directory
// would make Docker create it root-owned on Linux.
export function ensureBackupDir(...segments) {
  const dir = path.resolve(requireEnv("BACKUP_DIR"), ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Base compose file only: the fixed project name (`industry-app`) puts the
// one-shot job on the same network whether the stack was started with the
// dev or the prod overlay.
export function composeRun(service, extraEnv = {}) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "docker-compose.yml",
      "--profile",
      "backup",
      "run",
      "--rm",
      service,
    ],
    {
      stdio: "inherit",
      // Windows needs a shell to resolve docker; args contain no whitespace.
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    }
  );
  process.exitCode = result.status ?? 1;
  return result.status === 0;
}

// Destructive-action gate: the operator must retype `expected` (or pass
// --yes for unattended use, e.g. a rehearsed runbook).
export async function confirmDestructive(message, expected) {
  if (process.argv.includes("--yes")) {
    return;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(`${message}\nType "${expected}" to continue: `, resolve);
  });
  rl.close();
  if (answer.trim() !== expected) {
    console.error("Aborted — nothing was changed.");
    process.exit(1);
  }
}
