import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { type CliFlags, parseArgs } from "./args.js";
import {
  type AiVariant,
  type AuthzVariant,
  type CiVariant,
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlag,
  type I18nVariant,
  isDirEmpty,
  type LocaleVariant,
  type LoggingVariant,
  type ObservabilityTool,
  type OrgVariant,
  type ProdBranch,
  scaffold,
  type UiVariant,
  validateProjectName,
} from "./scaffold.js";

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

const WHITESPACE = /\s/;

function run(command: string, args: string[], cwd: string): boolean {
  // Windows needs a shell to resolve .cmd shims (pnpm), but a shell also
  // concatenates args unquoted — so quote anything containing whitespace.
  const useShell = process.platform === "win32";
  const shellArgs = useShell
    ? args.map((arg) => (WHITESPACE.test(arg) ? `"${arg}"` : arg))
    : args;
  const result = spawnSync(command, shellArgs, {
    cwd,
    stdio: "inherit",
    shell: useShell,
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
  backup: boolean;
  ci: CiVariant;
  featureFlags: readonly FeatureFlag[];
  i18n: I18nVariant;
  locale: LocaleVariant;
  logging: LoggingVariant;
  observability: readonly ObservabilityTool[];
  org: OrgVariant;
  prodBranch: ProdBranch;
  ui: UiVariant;
}

/**
 * Resolve a single choice: an explicit flag wins, `--yes` falls back to the
 * default, otherwise ask interactively. The `!== undefined` check (not
 * truthiness) is load-bearing — `backup: false` and `observability: []` from
 * flags must short-circuit the prompt instead of being treated as "unset".
 */
async function promptOrFallback<TValue>(
  flagValue: TValue | undefined,
  skipPrompts: boolean,
  fallback: TValue,
  ask: () => Promise<TValue | symbol>
): Promise<TValue> {
  if (flagValue !== undefined) {
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
  const ui = await promptOrFallback(flags.ui, flags.yes, "radix", () =>
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
  const authz = await promptOrFallback(flags.authz, flags.yes, "rbac", () =>
    p.select({
      message: "Authorization model (OpenFGA)",
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
  const org = await promptOrFallback(flags.org, flags.yes, "multi", () =>
    p.select({
      message: "Organization model",
      options: [
        {
          value: "multi" as const,
          label: "Multi-org",
          hint: "org switcher, invitations, org-scoped data",
        },
        {
          value: "single" as const,
          label: "Single-org",
          hint: "one implicit organization, no switcher UI",
        },
      ],
      initialValue: "multi" as const,
    })
  );
  const locale = await promptOrFallback(flags.locale, flags.yes, "en", () =>
    p.select({
      message: "Default language",
      options: [
        { value: "en" as const, label: "English" },
        { value: "fr" as const, label: "Français" },
      ],
      initialValue: "en" as const,
    })
  );
  const i18n = await promptOrFallback(flags.i18n, flags.yes, "cookie", () =>
    p.select({
      message: "Locale routing",
      options: [
        {
          value: "cookie" as const,
          label: "Cookie",
          hint: "no URL prefix; locale stored in a cookie",
        },
        {
          value: "url" as const,
          label: "URL prefix",
          hint: "/fr/... paths via middleware rewrite (SEO-friendly)",
        },
      ],
      initialValue: "cookie" as const,
    })
  );
  const observability = await promptOrFallback<readonly ObservabilityTool[]>(
    flags.observability,
    flags.yes,
    [],
    () =>
      p.multiselect({
        message:
          "Observability (space to toggle — all ship wired but disabled)",
        options: [
          {
            value: "sentry" as const,
            label: "Sentry",
            hint: "exception capture",
          },
          {
            value: "posthog" as const,
            label: "PostHog",
            hint: "analytics + feature flags",
          },
          {
            value: "otel" as const,
            label: "OpenTelemetry",
            hint: "OTLP traces",
          },
        ],
        required: false,
      })
  );
  const featureFlags = await promptOrFallback<readonly FeatureFlag[]>(
    flags.featureFlags,
    flags.yes,
    DEFAULT_FEATURE_FLAGS,
    () =>
      p.multiselect({
        message: "Behavior flags (env-driven, changeable later in .env)",
        options: [
          {
            value: "emails-enabled" as const,
            label: "Send emails",
            hint: "transactional mail via SMTP (off = log-only)",
          },
          {
            value: "require-email-verification" as const,
            label: "Require email verification",
            hint: "block sign-in until the address is verified",
          },
        ],
        initialValues: [...DEFAULT_FEATURE_FLAGS],
        required: false,
      })
  );
  const logging = await promptOrFallback(flags.logging, flags.yes, "pino", () =>
    p.select({
      message: "API logger",
      options: [
        {
          value: "pino" as const,
          label: "pino",
          hint: "nestjs-pino, fastest JSON logger",
        },
        {
          value: "winston" as const,
          label: "winston",
          hint: "nest-winston, transport ecosystem",
        },
      ],
      initialValue: "pino" as const,
    })
  );
  const ci = await promptOrFallback(flags.ci, flags.yes, "github", () =>
    p.select({
      message: "CI provider",
      options: [
        {
          value: "github" as const,
          label: "GitHub Actions",
          hint: "+ release-please releases",
        },
        {
          value: "gitlab" as const,
          label: "GitLab CI",
          hint: ".gitlab-ci.yml, manual releases",
        },
      ],
      initialValue: "github" as const,
    })
  );
  const backup = await promptOrFallback(flags.backup, flags.yes, true, () =>
    p.confirm({
      message: "Keep the built-in Postgres backup/restore tooling?",
      initialValue: true,
    })
  );
  const ai = await promptOrFallback(flags.ai, flags.yes, "claude", () =>
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
  const prodBranch = await promptOrFallback(
    flags.branch,
    flags.yes,
    "main",
    () =>
      p.select({
        message: "Production branch (git-flow)",
        options: [
          { value: "main" as const, label: "main", hint: "GitHub default" },
          {
            value: "master" as const,
            label: "master",
            hint: "classic git-flow",
          },
        ],
        initialValue: "main" as const,
      })
  );
  return {
    ui,
    authz,
    org,
    locale,
    i18n,
    observability,
    featureFlags,
    logging,
    ci,
    backup,
    ai,
    prodBranch,
  };
}

async function promptSetupSteps(
  flags: CliFlags,
  prodBranch: ProdBranch
): Promise<{ git: boolean; install: boolean }> {
  if (flags.yes) {
    return { git: flags.git, install: flags.install };
  }
  const options = await p.multiselect({
    message: "Setup steps",
    options: [
      {
        value: "git",
        label: `Initialize git (${prodBranch} + develop, git-flow-next ready)`,
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
function initGitRepo(targetDir: string, prodBranch: ProdBranch): boolean {
  const initialized = run("git", ["init", "-b", prodBranch], targetDir);
  if (!initialized) {
    p.log.warn("git init failed — initialize manually.");
  }
  return initialized;
}

// Ends on `develop`: git-flow daily work (feature branches) starts there,
// and leaving HEAD on the production branch invites accidental commits to it.
function commitScaffold(targetDir: string): void {
  const committed =
    run("git", ["add", "-A"], targetDir) &&
    run(
      "git",
      ["commit", "-m", "chore: initial scaffold from create-industry-app"],
      targetDir
    ) &&
    run("git", ["branch", "develop"], targetDir) &&
    run("git", ["checkout", "develop"], targetDir);
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
  const { git, install } = await promptSetupSteps(flags, variants.prodBranch);
  runScaffold(targetDir, projectName, variants);

  const gitReady =
    git && existsSync(targetDir) && initGitRepo(targetDir, variants.prodBranch);

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
