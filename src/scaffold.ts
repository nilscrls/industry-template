import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const UI_VARIANTS = ["radix", "base"] as const;
export type UiVariant = (typeof UI_VARIANTS)[number];

export const AUTHZ_VARIANTS = ["rbac", "rebac"] as const;
export type AuthzVariant = (typeof AUTHZ_VARIANTS)[number];

export const LOCALE_VARIANTS = ["en", "fr"] as const;
export type LocaleVariant = (typeof LOCALE_VARIANTS)[number];

export const AI_VARIANTS = ["claude", "none"] as const;
export type AiVariant = (typeof AI_VARIANTS)[number];

export const PROD_BRANCH_VARIANTS = ["main", "master"] as const;
export type ProdBranch = (typeof PROD_BRANCH_VARIANTS)[number];

export const ORG_VARIANTS = ["multi", "single"] as const;
export type OrgVariant = (typeof ORG_VARIANTS)[number];

export const I18N_VARIANTS = ["cookie", "url"] as const;
export type I18nVariant = (typeof I18N_VARIANTS)[number];

export const CI_VARIANTS = ["github", "gitlab"] as const;
export type CiVariant = (typeof CI_VARIANTS)[number];

export const LOGGING_VARIANTS = ["pino", "winston"] as const;
export type LoggingVariant = (typeof LOGGING_VARIANTS)[number];

export const RELEASE_VARIANTS = [
  "release-please",
  "release-it",
  "commit-and-tag-version",
] as const;
export type ReleaseVariant = (typeof RELEASE_VARIANTS)[number];

/**
 * Release tools valid per CI provider (first entry = the default).
 * release-please is a GitHub bot; commit-and-tag-version ships with a
 * GitLab-only tag→release job.
 */
export const CI_RELEASE_TOOLS: Record<
  CiVariant,
  readonly [ReleaseVariant, ...ReleaseVariant[]]
> = {
  github: ["release-please", "release-it"],
  gitlab: ["release-it", "commit-and-tag-version"],
};

export function defaultRelease(ci: CiVariant): ReleaseVariant {
  return CI_RELEASE_TOOLS[ci][0];
}

/** Observability collectors togglable at scaffold time (env stamping, no overlay). */
export const OBSERVABILITY_TOOLS = ["sentry", "posthog", "otel"] as const;
export type ObservabilityTool = (typeof OBSERVABILITY_TOOLS)[number];

/** Env-driven behavior flags togglable at scaffold time (env stamping, no overlay). */
export const FEATURE_FLAGS = [
  "require-email-verification",
  "emails-enabled",
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** The behavior flags the template ships enabled — mirrors template/.env.example
 *  (EMAILS_ENABLED=true, REQUIRE_EMAIL_VERIFICATION=false). */
export const DEFAULT_FEATURE_FLAGS: readonly FeatureFlag[] = ["emails-enabled"];

export interface ScaffoldOptions {
  /** AI assistant config (AGENTS.md, CLAUDE.md, .claude/rules). Default: "claude". */
  ai?: AiVariant;
  /** OpenFGA authorization model. Default: "rbac". */
  authz?: AuthzVariant;
  /** Ship db+files backup tooling (scripts/backup, compose `backup` profile). Default: true. */
  backup?: boolean;
  /** CI provider files. Default: "github". "gitlab" applies variants/ci-gitlab. */
  ci?: CiVariant;
  /** Env-driven behavior flags stamped into .env(.example). Default: DEFAULT_FEATURE_FLAGS. */
  featureFlags?: readonly FeatureFlag[];
  /** Locale routing strategy. Default: "cookie". "url" applies variants/i18n-url. */
  i18n?: I18nVariant;
  /** Default UI language. Default: "en". */
  locale?: LocaleVariant;
  /** API logger. Default: "pino". "winston" applies variants/logging-winston. */
  logging?: LoggingVariant;
  /** Observability collectors enabled via env stamping. Default: [] (all *_ENABLED=false). */
  observability?: readonly ObservabilityTool[];
  /** Organization model. Default: "multi". "single" applies variants/org-single. */
  org?: OrgVariant;
  /** Git-flow production branch name stamped into CI/docs. Default: "main". */
  prodBranch?: ProdBranch;
  projectName: string;
  /**
   * Release tooling. Default: the CI provider's first entry in
   * CI_RELEASE_TOOLS (github → "release-please", gitlab → "release-it").
   * "release-it" applies variants/release-it-<ci>.
   */
  release?: ReleaseVariant;
  targetDir: string;
  templateDir: string;
  /** shadcn/ui primitive library. Default: "radix". */
  ui?: UiVariant;
  /** Directory holding variant overlays (repo `variants/`). Required when a non-default variant is chosen. */
  variantsDir?: string;
}

/** Artifacts that may exist in a locally-developed template but must never be scaffolded. */
const COPY_EXCLUDES = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "playwright-report",
  "test-results",
  ".env",
]);

const SECRET_KEYS = ["BETTER_AUTH_SECRET"];

const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function validateProjectName(name: string): string | undefined {
  if (name.length === 0) {
    return "Project name is required";
  }
  if (name.length > 214) {
    return "Project name must be at most 214 characters";
  }
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return "Use lowercase letters, digits, '.', '_' and '-' (must start with a letter or digit)";
  }
  return;
}

export function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) {
    return true;
  }
  return readdirSync(dir).filter((entry) => entry !== ".git").length === 0;
}

function copyTemplate(templateDir: string, targetDir: string): void {
  cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (source) => !COPY_EXCLUDES.has(path.basename(source)),
  });
}

/**
 * Overlay a variant on the scaffolded tree: first remove the paths listed in
 * the overlay's `_delete.json` (template files the variant replaces
 * wholesale, e.g. drizzle migrations), then copy every overlay file over the
 * target, replacing the default implementation.
 */
function applyVariantOverlay(
  variantsDir: string | undefined,
  overlayName: string,
  targetDir: string
): void {
  if (!variantsDir) {
    throw new Error(
      `Variant "${overlayName}" requested but no variants directory provided`
    );
  }
  const overlayDir = path.join(variantsDir, overlayName);
  if (!existsSync(overlayDir)) {
    throw new Error(`Variant overlay not found at ${overlayDir}`);
  }

  const manifestPath = path.join(overlayDir, "_delete.json");
  if (existsSync(manifestPath)) {
    const deletions: string[] = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const relative of deletions) {
      rmSync(path.join(targetDir, relative), { recursive: true, force: true });
    }
  }

  cpSync(overlayDir, targetDir, {
    recursive: true,
    filter: (source) => path.basename(source) !== "_delete.json",
  });
}

/** The chosen scaffold-time language becomes the app's fallback locale. */
function setDefaultLocale(targetDir: string, locale: LocaleVariant): void {
  if (locale === "en") {
    return;
  }
  const configPath = path.join(
    targetDir,
    "packages",
    "i18n",
    "src",
    "config.ts"
  );
  const source = readFileSync(configPath, "utf8");
  const marker = 'DEFAULT_LOCALE: Locale = "en"';
  if (!source.includes(marker)) {
    throw new Error(
      `Could not set default locale: marker not found in ${configPath}`
    );
  }
  writeFileSync(
    configPath,
    source.replace(marker, `DEFAULT_LOCALE: Locale = "${locale}"`)
  );
}

const UI_LABELS: Record<UiVariant, string> = {
  radix: "Radix UI (the classic shadcn/ui stack)",
  base: "Base UI (`@base-ui/react`, `render`-prop composition instead of `asChild`)",
};

const AUTHZ_LABELS: Record<AuthzVariant, string> = {
  rbac: "RBAC — global roles + per-user overrides",
  rebac: "ReBAC — per-project memberships (owner/editor/viewer)",
};

const LOCALE_LABELS: Record<LocaleVariant, string> = {
  en: "en (English)",
  fr: "fr (Français)",
};

const ORG_LABELS: Record<OrgVariant, string> = {
  multi: "multi-organization (org switcher, org-scoped data + invitations)",
  single: "single-organization (one implicit org, switcher UI removed)",
};

const I18N_LABELS: Record<I18nVariant, string> = {
  cookie: "cookie-based locale, no URL prefix",
  url: "URL-prefixed locales (`/fr/...`) via middleware rewrite",
};

const LOGGING_LABELS: Record<LoggingVariant, string> = {
  pino: "pino (nestjs-pino, JSON to stdout)",
  winston: "winston (nest-winston, JSON to stdout)",
};

const CI_LABELS: Record<CiVariant, string> = {
  github: "GitHub Actions (`.github/workflows/`)",
  gitlab: "GitLab CI (`.gitlab-ci.yml`)",
};

const RELEASE_LABELS: Record<ReleaseVariant, string> = {
  "release-please": "release-please (release PR bot)",
  "release-it": "release-it (run `pnpm release` locally)",
  "commit-and-tag-version": "commit-and-tag-version (run locally via npx)",
};

function observabilityLabel(tools: readonly ObservabilityTool[]): string {
  return tools.length === 0
    ? "none (all collectors ship disabled; flip *_ENABLED in .env to opt in)"
    : tools.join(", ");
}

/**
 * Base-template files that reference the git-flow production branch. Stamping
 * throws if a listed file exists without the marker, so template drift is
 * caught by the scaffold tests. Missing files are skipped (test fixtures use
 * minimal templates).
 */
const PROD_BRANCH_FILES = [
  ".github/workflows/ci.yml",
  ".github/workflows/release-please.yml",
  ".github/workflows/release.yml",
  ".gitlab-ci.yml",
  ".release-it.json",
  "README.md",
  "docs/git-flow.md",
  "docs/guides.md",
  "docs/releases.md",
  "CONTRIBUTING.md",
];

/** Replace the __PROD_BRANCH__ marker with the chosen production branch name. */
function stampProdBranch(targetDir: string, branch: ProdBranch): void {
  for (const relative of PROD_BRANCH_FILES) {
    const filePath = path.join(targetDir, relative);
    if (!existsSync(filePath)) {
      continue;
    }
    const source = readFileSync(filePath, "utf8");
    if (!source.includes("__PROD_BRANCH__")) {
      throw new Error(`Marker __PROD_BRANCH__ not found in ${filePath}`);
    }
    writeFileSync(filePath, source.replaceAll("__PROD_BRANCH__", branch));
  }
}

/** Stamp the chosen variants into the AGENTS.md emitted by the ai-claude overlay. */
function stampAgentsVariants(
  targetDir: string,
  choices: {
    authz: AuthzVariant;
    ci: CiVariant;
    i18n: I18nVariant;
    locale: LocaleVariant;
    logging: LoggingVariant;
    observability: readonly ObservabilityTool[];
    org: OrgVariant;
    prodBranch: ProdBranch;
    release: ReleaseVariant;
    ui: UiVariant;
  }
): void {
  const agentsPath = path.join(targetDir, "AGENTS.md");
  let source = readFileSync(agentsPath, "utf8");
  const replacements: [marker: string, value: string][] = [
    ["__UI_VARIANT__", UI_LABELS[choices.ui]],
    ["__AUTHZ_VARIANT__", AUTHZ_LABELS[choices.authz]],
    ["__ORG_VARIANT__", ORG_LABELS[choices.org]],
    ["__LOCALE_VARIANT__", LOCALE_LABELS[choices.locale]],
    ["__I18N_VARIANT__", I18N_LABELS[choices.i18n]],
    ["__LOGGING_VARIANT__", LOGGING_LABELS[choices.logging]],
    [
      "__CI_VARIANT__",
      `${CI_LABELS[choices.ci]}, releases via ${RELEASE_LABELS[choices.release]}`,
    ],
    ["__OBSERVABILITY_VARIANT__", observabilityLabel(choices.observability)],
    ["__PROD_BRANCH__", choices.prodBranch],
  ];
  for (const [marker, value] of replacements) {
    if (!source.includes(marker)) {
      throw new Error(
        `Could not stamp AI config: marker ${marker} not found in ${agentsPath}`
      );
    }
    source = source.replace(marker, value);
  }
  writeFileSync(agentsPath, source);
}

/**
 * The ai-claude overlay ships one rule file per variant of a dimension
 * (authz.rbac.md / authz.rebac.md, ui.radix.md / ui.base.md,
 * logging.pino.md / logging.winston.md); keep the chosen one as
 * `<dimension>.md` and drop the rest. Runs before restoreDotfiles, so the
 * directory is still `_claude`.
 */
function selectVariantRules(
  targetDir: string,
  choices: { authz: AuthzVariant; logging: LoggingVariant; ui: UiVariant }
): void {
  const rulesDir = path.join(targetDir, "_claude", "rules");
  const dimensions: [
    dimension: string,
    chosen: string,
    variants: readonly string[],
  ][] = [
    ["authz", choices.authz, AUTHZ_VARIANTS],
    ["ui", choices.ui, UI_VARIANTS],
    ["logging", choices.logging, LOGGING_VARIANTS],
  ];
  for (const [dimension, chosen, variants] of dimensions) {
    renameSync(
      path.join(rulesDir, `${dimension}.${chosen}.md`),
      path.join(rulesDir, `${dimension}.md`)
    );
    for (const variant of variants) {
      if (variant !== chosen) {
        rmSync(path.join(rulesDir, `${dimension}.${variant}.md`), {
          force: true,
        });
      }
    }
  }
}

/**
 * npm strips or mangles dot-entries in published packages, so the template
 * and overlays store them underscore-prefixed: `_gitignore` files and the
 * `_claude` directory. Files are renamed before directories so recorded
 * paths stay valid.
 */
function restoreDotfiles(dir: string): void {
  const dirRenames: string[] = [];
  for (const entry of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    const entryPath = path.join(entry.parentPath, entry.name);
    if (entry.isFile() && entry.name === "_gitignore") {
      renameSync(entryPath, path.join(entry.parentPath, ".gitignore"));
    } else if (entry.isDirectory() && entry.name === "_claude") {
      dirRenames.push(entryPath);
    }
  }
  // Deepest first, so a nested _claude is renamed before its ancestor moves.
  dirRenames.sort((a, b) => b.length - a.length);
  for (const from of dirRenames) {
    renameSync(from, path.join(path.dirname(from), ".claude"));
  }
}

function setProjectName(targetDir: string, projectName: string): void {
  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.name = projectName;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

/** Materialize .env from .env.example, generating real values for secret placeholders. */
function writeDotEnv(targetDir: string): void {
  const examplePath = path.join(targetDir, ".env.example");
  const lines = readFileSync(examplePath, "utf8").split("\n");
  const resolved = lines.map((line) => {
    const key = SECRET_KEYS.find((candidate) =>
      line.startsWith(`${candidate}=`)
    );
    if (key) {
      return `${key}=${randomBytes(32).toString("hex")}`;
    }
    return line;
  });
  writeFileSync(path.join(targetDir, ".env"), resolved.join("\n"));
}

/** ObservabilityTool → the env keys flipped to "true" when the tool is chosen. */
const OBSERVABILITY_ENV_KEYS: Record<ObservabilityTool, readonly string[]> = {
  sentry: ["SENTRY_ENABLED", "NEXT_PUBLIC_SENTRY_ENABLED"],
  posthog: ["POSTHOG_ENABLED", "NEXT_PUBLIC_POSTHOG_ENABLED"],
  otel: ["OTEL_ENABLED"],
};

/** FeatureFlag → env key + the value template/.env.example ships with. */
const FEATURE_FLAG_ENV: Record<
  FeatureFlag,
  { key: string; templateDefault: boolean }
> = {
  "require-email-verification": {
    key: "REQUIRE_EMAIL_VERIFICATION",
    templateDefault: false,
  },
  "emails-enabled": { key: "EMAILS_ENABLED", templateDefault: true },
};

/**
 * Whole-line replace of `KEY=...` in an array of env lines; fail loud so
 * template drift (a renamed/removed var) breaks the scaffold tests.
 */
function stampEnvLine(
  lines: string[],
  key: string,
  value: string,
  filePath: string
): void {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index === -1) {
    throw new Error(`Env marker line "${key}=" not found in ${filePath}`);
  }
  lines[index] = `${key}=${value}`;
}

/**
 * Stamp the scaffold-time observability + feature-flag choices into
 * .env.example (writeDotEnv then inherits them into .env). Defaults stamp
 * nothing — the template already ships the default values, so the default
 * scaffold stays byte-identical to the template.
 */
function stampEnvChoices(
  targetDir: string,
  choices: {
    featureFlags: readonly FeatureFlag[];
    observability: readonly ObservabilityTool[];
  }
): void {
  const stamps: [key: string, value: string][] = [];
  for (const tool of choices.observability) {
    for (const key of OBSERVABILITY_ENV_KEYS[tool]) {
      stamps.push([key, "true"]);
    }
  }
  for (const flag of FEATURE_FLAGS) {
    const chosen = choices.featureFlags.includes(flag);
    const { key, templateDefault } = FEATURE_FLAG_ENV[flag];
    if (chosen !== templateDefault) {
      stamps.push([key, String(chosen)]);
    }
  }
  if (stamps.length === 0) {
    return;
  }
  const examplePath = path.join(targetDir, ".env.example");
  const lines = readFileSync(examplePath, "utf8").split("\n");
  for (const [key, value] of stamps) {
    stampEnvLine(lines, key, value, examplePath);
  }
  writeFileSync(examplePath, lines.join("\n"));
}

const RELEASE_IT_DEV_DEPS: Record<string, string> = {
  "@release-it/conventional-changelog": "^11.0.1",
  "release-it": "^20.2.1",
};

/**
 * release-it runs locally (`pnpm release`), so unlike the bot-driven
 * release-please it needs devDependencies and a script in the root
 * package.json — added here because overlays copy whole files and cannot
 * patch JSON.
 */
function addReleaseItTooling(targetDir: string): void {
  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts = { ...packageJson.scripts, release: "release-it" };
  packageJson.devDependencies = Object.fromEntries(
    Object.entries({
      ...packageJson.devDependencies,
      ...RELEASE_IT_DEV_DEPS,
    }).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

/** Whole paths removed by --backup=false. */
const BACKUP_PRUNE_PATHS = ["scripts/backup", "docs/backup.md"];

/** Files carrying a `# BEGIN backup` … `# END backup` block. */
const BACKUP_MARKER_FILES = ["docker-compose.yml", ".env.example"];

/** Files carrying single-line backup references. */
const BACKUP_LINE_FILES = ["README.md", "docs/deployment.md"];
const BACKUP_LINE_PATTERN =
  /backup\.md|backup:db|backup:files|restore:db|restore:files/;

const BACKUP_PACKAGE_SCRIPTS = [
  "backup:db",
  "backup:files",
  "restore:db",
  "restore:files",
];

/**
 * Remove the marker-delimited backup block (markers inclusive). Throws when
 * the file exists without both markers, so template drift is caught by the
 * scaffold tests — same contract as stampProdBranch. Missing files are
 * skipped (test fixtures use minimal templates).
 */
function stripMarkedBlock(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  const lines = readFileSync(filePath, "utf8").split("\n");
  const begin = lines.findIndex((line) => line.includes("BEGIN backup"));
  const end = lines.findIndex((line) => line.includes("END backup"));
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`Backup markers not found in ${filePath}`);
  }
  writeFileSync(
    filePath,
    [...lines.slice(0, begin), ...lines.slice(end + 1)].join("\n")
  );
}

/** Remove every line matching BACKUP_LINE_PATTERN; throws when none match. */
function stripMatchingLines(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  const lines = readFileSync(filePath, "utf8").split("\n");
  const kept = lines.filter((line) => !BACKUP_LINE_PATTERN.test(line));
  if (kept.length === lines.length) {
    throw new Error(`No backup references found to prune in ${filePath}`);
  }
  writeFileSync(filePath, kept.join("\n"));
}

/** --backup=false: remove the backup tooling the template ships by default. */
function pruneBackup(targetDir: string): void {
  for (const relative of BACKUP_PRUNE_PATHS) {
    rmSync(path.join(targetDir, relative), { recursive: true, force: true });
  }
  for (const relative of BACKUP_MARKER_FILES) {
    stripMarkedBlock(path.join(targetDir, relative));
  }
  for (const relative of BACKUP_LINE_FILES) {
    stripMatchingLines(path.join(targetDir, relative));
  }
  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  for (const script of BACKUP_PACKAGE_SCRIPTS) {
    if (packageJson.scripts) {
      delete packageJson.scripts[script];
    }
  }
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

export function scaffold(options: ScaffoldOptions): void {
  const {
    templateDir,
    targetDir,
    projectName,
    variantsDir,
    ui = "radix",
    authz = "rbac",
    org = "multi",
    i18n = "cookie",
    logging = "pino",
    ci = "github",
    locale = "en",
    ai = "claude",
    prodBranch = "main",
    observability = [],
    featureFlags = DEFAULT_FEATURE_FLAGS,
    backup = true,
  } = options;
  const release = options.release ?? defaultRelease(ci);
  const nameError = validateProjectName(projectName);
  if (nameError) {
    throw new Error(nameError);
  }
  if (!CI_RELEASE_TOOLS[ci].includes(release)) {
    throw new Error(
      `Release tool "${release}" is not available with ci=${ci} (expected one of: ${CI_RELEASE_TOOLS[ci].join(", ")})`
    );
  }
  if (!existsSync(path.join(templateDir, "package.json"))) {
    throw new Error(`Template not found at ${templateDir}`);
  }
  if (!isDirEmpty(targetDir)) {
    throw new Error(`Target directory ${targetDir} is not empty`);
  }

  copyTemplate(templateDir, targetDir);
  // Overlay order is load-bearing (last write wins): ui-base → authz-rebac →
  // org-single → i18n-url → logging-winston → ci-gitlab → release-it-<ci> →
  // ai-claude (always last). org-single/i18n-url land after ui-base so their
  // UI-neutral files win.
  if (ui === "base") {
    applyVariantOverlay(variantsDir, "ui-base", targetDir);
  }
  if (authz === "rebac") {
    applyVariantOverlay(variantsDir, "authz-rebac", targetDir);
  }
  if (org === "single") {
    applyVariantOverlay(variantsDir, "org-single", targetDir);
  }
  if (i18n === "url") {
    applyVariantOverlay(variantsDir, "i18n-url", targetDir);
  }
  if (logging === "winston") {
    applyVariantOverlay(variantsDir, "logging-winston", targetDir);
  }
  if (ci === "gitlab") {
    applyVariantOverlay(variantsDir, "ci-gitlab", targetDir);
  }
  // After ci-gitlab: on GitLab the overlay replaces the commit-and-tag-version
  // release files the CI overlay ships; on GitHub it replaces release-please.
  if (release === "release-it") {
    applyVariantOverlay(variantsDir, `release-it-${ci}`, targetDir);
    addReleaseItTooling(targetDir);
  }
  if (ai === "claude") {
    applyVariantOverlay(variantsDir, "ai-claude", targetDir);
    stampAgentsVariants(targetDir, {
      ui,
      authz,
      locale,
      prodBranch,
      org,
      i18n,
      logging,
      ci,
      release,
      observability,
    });
    selectVariantRules(targetDir, { ui, authz, logging });
  }
  // Unconditional (even for the default "main") so the marker never leaks.
  stampProdBranch(targetDir, prodBranch);
  setDefaultLocale(targetDir, locale);
  stampEnvChoices(targetDir, { observability, featureFlags });
  if (!backup) {
    pruneBackup(targetDir);
  }
  restoreDotfiles(targetDir);
  setProjectName(targetDir, projectName);
  // Must stay after stampEnvChoices/pruneBackup: .env inherits the stamped
  // .env.example (and never carries BACKUP_* when backup was pruned).
  writeDotEnv(targetDir);
}
