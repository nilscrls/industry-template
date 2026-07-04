import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { isDirEmpty, scaffold, validateProjectName } from "./scaffold.js";

type CliFlags = {
  directory: string | undefined;
  yes: boolean;
  git: boolean;
  install: boolean;
};

function parseArgs(argv: string[]): CliFlags {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  return {
    directory: positional[0],
    yes: argv.includes("--yes") || argv.includes("-y"),
    git: !argv.includes("--no-git"),
    install: !argv.includes("--no-install"),
  };
}

function resolveTemplateDir(): string {
  // dist/index.js and src/index.ts are both one level below the package root.
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return path.join(packageRoot, "template");
}

function run(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  p.intro(pc.bgCyan(pc.black(" create-industry-app ")));

  let projectName = flags.directory ? path.basename(path.resolve(flags.directory)) : undefined;
  if (!(projectName && flags.yes)) {
    const answer = await p.text({
      message: "Project name (also the target directory)",
      placeholder: "my-app",
      initialValue: projectName,
      validate: (value) => validateProjectName(value ?? ""),
    });
    if (p.isCancel(answer)) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    projectName = answer;
  }

  const targetDir = path.resolve(flags.directory ?? projectName);
  if (!isDirEmpty(targetDir)) {
    p.cancel(`Directory ${targetDir} is not empty.`);
    process.exit(1);
  }

  let git = flags.git;
  let install = flags.install;
  if (!flags.yes) {
    const options = await p.multiselect({
      message: "Setup steps",
      options: [
        { value: "git", label: "Initialize git (main + develop, git-flow-next ready)" },
        { value: "install", label: "Install dependencies (pnpm)" },
      ],
      initialValues: ["git", "install"].filter(
        (step) => (step === "git" && git) || (step === "install" && install)
      ),
      required: false,
    });
    if (p.isCancel(options)) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    git = options.includes("git");
    install = options.includes("install");
  }

  const spinner = p.spinner();
  spinner.start("Scaffolding project");
  try {
    scaffold({ templateDir: resolveTemplateDir(), targetDir, projectName });
    spinner.stop("Project scaffolded");
  } catch (error) {
    spinner.stop("Scaffolding failed");
    p.cancel(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (install) {
    p.log.step("Installing dependencies with pnpm…");
    if (!run("pnpm", ["install"], targetDir)) {
      p.log.warn("pnpm install failed — run it manually.");
      install = false;
    }
  }

  if (git && existsSync(targetDir)) {
    const initialized =
      run("git", ["init", "-b", "main"], targetDir) &&
      run("git", ["add", "-A"], targetDir) &&
      run("git", ["commit", "-m", "chore: initial scaffold from create-industry-app"], targetDir) &&
      run("git", ["branch", "develop"], targetDir);
    if (!initialized) {
      p.log.warn("git initialization failed — initialize manually.");
    }
  }

  const relative = path.relative(process.cwd(), targetDir) || ".";
  p.note(
    [
      `cd ${relative}`,
      install ? undefined : "pnpm install",
      "docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile dev up -d",
      "pnpm db:migrate && pnpm db:seed",
      "pnpm dev",
    ]
      .filter(Boolean)
      .join("\n"),
    "Next steps"
  );
  p.outro(`Docs: ${pc.cyan("README.md")} in your new project. Happy shipping!`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
