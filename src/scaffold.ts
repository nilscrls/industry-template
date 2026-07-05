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

export interface ScaffoldOptions {
  /** AI assistant config (AGENTS.md, CLAUDE.md, .claude/rules). Default: "claude". */
  ai?: AiVariant;
  /** CASL authorization model. Default: "rbac". */
  authz?: AuthzVariant;
  /** Default UI language. Default: "en". */
  locale?: LocaleVariant;
  projectName: string;
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

/** Stamp the chosen variants into the AGENTS.md emitted by the ai-claude overlay. */
function stampAgentsVariants(
  targetDir: string,
  choices: { authz: AuthzVariant; locale: LocaleVariant; ui: UiVariant }
): void {
  const agentsPath = path.join(targetDir, "AGENTS.md");
  let source = readFileSync(agentsPath, "utf8");
  const replacements: [marker: string, value: string][] = [
    ["__UI_VARIANT__", UI_LABELS[choices.ui]],
    ["__AUTHZ_VARIANT__", AUTHZ_LABELS[choices.authz]],
    ["__LOCALE_VARIANT__", LOCALE_LABELS[choices.locale]],
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
 * (authz.rbac.md / authz.rebac.md, ui.radix.md / ui.base.md); keep the
 * chosen one as `<dimension>.md` and drop the rest. Runs before
 * restoreDotfiles, so the directory is still `_claude`.
 */
function selectVariantRules(
  targetDir: string,
  choices: { authz: AuthzVariant; ui: UiVariant }
): void {
  const rulesDir = path.join(targetDir, "_claude", "rules");
  const dimensions: [
    dimension: string,
    chosen: string,
    variants: readonly string[],
  ][] = [
    ["authz", choices.authz, AUTHZ_VARIANTS],
    ["ui", choices.ui, UI_VARIANTS],
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

export function scaffold(options: ScaffoldOptions): void {
  const {
    templateDir,
    targetDir,
    projectName,
    variantsDir,
    ui = "radix",
    authz = "rbac",
    locale = "en",
    ai = "claude",
  } = options;
  const nameError = validateProjectName(projectName);
  if (nameError) {
    throw new Error(nameError);
  }
  if (!existsSync(path.join(templateDir, "package.json"))) {
    throw new Error(`Template not found at ${templateDir}`);
  }
  if (!isDirEmpty(targetDir)) {
    throw new Error(`Target directory ${targetDir} is not empty`);
  }

  copyTemplate(templateDir, targetDir);
  if (ui === "base") {
    applyVariantOverlay(variantsDir, "ui-base", targetDir);
  }
  if (authz === "rebac") {
    applyVariantOverlay(variantsDir, "authz-rebac", targetDir);
  }
  if (ai === "claude") {
    applyVariantOverlay(variantsDir, "ai-claude", targetDir);
    stampAgentsVariants(targetDir, { ui, authz, locale });
    selectVariantRules(targetDir, { ui, authz });
  }
  setDefaultLocale(targetDir, locale);
  restoreDotfiles(targetDir);
  setProjectName(targetDir, projectName);
  writeDotEnv(targetDir);
}
