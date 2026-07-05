import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  AI_VARIANTS,
  type AiVariant,
  AUTHZ_VARIANTS,
  type AuthzVariant,
  isDirEmpty,
  LOCALE_VARIANTS,
  type LocaleVariant,
  scaffold,
  UI_VARIANTS,
  type UiVariant,
  validateProjectName,
} from "./scaffold.js";

interface CliFlags {
  ai: AiVariant | undefined;
  authz: AuthzVariant | undefined;
  directory: string | undefined;
  git: boolean;
  install: boolean;
  locale: LocaleVariant | undefined;
  ui: UiVariant | undefined;
  yes: boolean;
}

function enumFlag<TValue extends string>(
  argv: string[],
  name: string,
  allowed: readonly TValue[]
): TValue | undefined {
  const prefix = `--${name}=`;
  const raw = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) {
    return;
  }
  if (!allowed.includes(raw as TValue)) {
    console.error(
      `Invalid --${name}=${raw} (expected one of: ${allowed.join(", ")})`
    );
    process.exit(1);
  }
  return raw as TValue;
}

function parseArgs(argv: string[]): CliFlags {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  return {
    directory: positional[0],
    yes: argv.includes("--yes") || argv.includes("-y"),
    git: !argv.includes("--no-git"),
    install: !argv.includes("--no-install"),
    ui: enumFlag(argv, "ui", UI_VARIANTS),
    authz: enumFlag(argv, "authz", AUTHZ_VARIANTS),
    locale: enumFlag(argv, "locale", LOCALE_VARIANTS),
    ai: enumFlag(argv, "ai", AI_VARIANTS),
  };
}

function packageRoot(): string {
  // dist/index.js and src/index.ts are both one level below the package root.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolveTemplateDir(): string {
  return path.join(packageRoot(), "template");
}

function resolveVariantsDir(): string {
  return path.join(packageRoot(), "variants");
}

function run(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

async function promptProjectName(flags: CliFlags): Promise<string> {
  const fromFlag = flags.directory
    ? path.basename(path.resolve(flags.directory))
    : undefined;
  if (fromFlag && flags.yes) {
    return fromFlag;
  }
  const answer = await p.text({
    message: "Project name (also the target directory)",
    placeholder: "my-app",
    ...(fromFlag ? { initialValue: fromFlag } : {}),
    validate: (value) => validateProjectName(value ?? ""),
  });
  if (p.isCancel(answer)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return answer;
}

interface VariantChoices {
  ai: AiVariant;
  authz: AuthzVariant;
  locale: LocaleVariant;
  ui: UiVariant;
}

async function promptVariant<TValue extends string>(
  flagValue: TValue | undefined,
  skipPrompts: boolean,
  fallback: TValue,
  ask: () => Promise<TValue | symbol>
): Promise<TValue> {
  if (flagValue) {
    return flagValue;
  }
  if (skipPrompts) {
    return fallback;
  }
  const answer = await ask();
  if (p.isCancel(answer) || typeof answer === "symbol") {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return answer;
}

async function promptVariants(flags: CliFlags): Promise<VariantChoices> {
  const ui = await promptVariant(flags.ui, flags.yes, "radix", () =>
    p.select({
      message: "UI primitives (shadcn/ui)",
      options: [
        {
          value: "radix" as const,
          label: "Radix UI",
          hint: "the classic shadcn/ui stack",
        },
        {
          value: "base" as const,
          label: "Base UI",
          hint: "shadcn/ui's newer default",
        },
      ],
      initialValue: "radix" as const,
    })
  );
  const authz = await promptVariant(flags.authz, flags.yes, "rbac", () =>
    p.select({
      message: "Authorization model (CASL)",
      options: [
        {
          value: "rbac" as const,
          label: "RBAC",
          hint: "global roles + per-user overrides",
        },
        {
          value: "rebac" as const,
          label: "ReBAC",
          hint: "per-resource memberships (owner/editor/viewer)",
        },
      ],
      initialValue: "rbac" as const,
    })
  );
  const locale = await promptVariant(flags.locale, flags.yes, "en", () =>
    p.select({
      message: "Default language",
      options: [
        { value: "en" as const, label: "English" },
        { value: "fr" as const, label: "Français" },
      ],
      initialValue: "en" as const,
    })
  );
  const ai = await promptVariant(flags.ai, flags.yes, "claude", () =>
    p.select({
      message: "AI assistant config",
      options: [
        {
          value: "claude" as const,
          label: "Claude Code",
          hint: "AGENTS.md + CLAUDE.md + path-scoped .claude/rules",
        },
        { value: "none" as const, label: "None" },
      ],
      initialValue: "claude" as const,
    })
  );
  return { ui, authz, locale, ai };
}

async function promptSetupSteps(
  flags: CliFlags
): Promise<{ git: boolean; install: boolean }> {
  if (flags.yes) {
    return { git: flags.git, install: flags.install };
  }
  const options = await p.multiselect({
    message: "Setup steps",
    options: [
      {
        value: "git",
        label: "Initialize git (main + develop, git-flow-next ready)",
      },
      { value: "install", label: "Install dependencies (pnpm)" },
    ],
    initialValues: ["git", "install"].filter(
      (step) =>
        (step === "git" && flags.git) || (step === "install" && flags.install)
    ),
    required: false,
  });
  if (p.isCancel(options)) {
    p.cancel("Cancelled.");
    process.exit(1);
  }
  return { git: options.includes("git"), install: options.includes("install") };
}

function runScaffold(
  targetDir: string,
  projectName: string,
  variants: VariantChoices
): void {
  const spinner = p.spinner();
  spinner.start("Scaffolding project");
  try {
    scaffold({
      templateDir: resolveTemplateDir(),
      variantsDir: resolveVariantsDir(),
      targetDir,
      projectName,
      ...variants,
    });
    spinner.stop("Project scaffolded");
  } catch (error) {
    spinner.stop("Scaffolding failed");
    p.cancel(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Split around `pnpm install`: the repo must exist first (the template's
// prepare script installs git hooks), the commit must come last (so the
// lockfile the install may update is part of the initial commit).
function initGitRepo(targetDir: string): boolean {
  const initialized = run("git", ["init", "-b", "main"], targetDir);
  if (!initialized) {
    p.log.warn("git init failed — initialize manually.");
  }
  return initialized;
}

function commitScaffold(targetDir: string): void {
  const committed =
    run("git", ["add", "-A"], targetDir) &&
    run(
      "git",
      ["commit", "-m", "chore: initial scaffold from create-industry-app"],
      targetDir
    ) &&
    run("git", ["branch", "develop"], targetDir);
  if (!committed) {
    p.log.warn("git commit failed — commit manually.");
  }
}

function printNextSteps(targetDir: string, installed: boolean): void {
  const relative = path.relative(process.cwd(), targetDir) || ".";
  p.note(
    [
      `cd ${relative}`,
      installed ? undefined : "pnpm install",
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

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  p.intro(pc.bgCyan(pc.black(" create-industry-app ")));

  const projectName = await promptProjectName(flags);
  const targetDir = path.resolve(flags.directory ?? projectName);
  if (!isDirEmpty(targetDir)) {
    p.cancel(`Directory ${targetDir} is not empty.`);
    process.exit(1);
  }

  const variants = await promptVariants(flags);
  const { git, install } = await promptSetupSteps(flags);
  runScaffold(targetDir, projectName, variants);

  const gitReady = git && existsSync(targetDir) && initGitRepo(targetDir);

  let installed = false;
  if (install) {
    p.log.step("Installing dependencies with pnpm…");
    installed = run("pnpm", ["install"], targetDir);
    if (!installed) {
      p.log.warn("pnpm install failed — run it manually.");
    }
  }

  if (gitReady) {
    commitScaffold(targetDir);
  }

  printNextSteps(targetDir, installed);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
