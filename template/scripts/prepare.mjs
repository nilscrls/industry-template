// pnpm `prepare` hook: install git hooks, but only inside a git repository —
// `create-industry-app` runs `pnpm install` before (or without) `git init`,
// and `lefthook install` hard-fails when no .git exists.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".git")) {
  execSync("lefthook install", { stdio: "inherit" });
} else {
  console.log("prepare: skipped lefthook install (no .git yet)");
}
