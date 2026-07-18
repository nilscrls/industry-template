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

export const API_ACCESS_VARIANTS = ["proxy", "direct"] as const;
export type ApiAccessVariant = (typeof API_ACCESS_VARIANTS)[number];

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
  /**
   * How the browser reaches the API. Default: "proxy" (same-origin /api via
   * the Next.js rewrite). "direct" drops the proxy: the browser calls the API
   * on its own origin (e.g. api.example.com next to app.example.com) with
   * CORS + a parent-domain session cookie. Applied by anchored text edits,
   * not an overlay (the touched files vary with other axes).
   */
  apiAccess?: ApiAccessVariant;
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

const API_ACCESS_LABELS: Record<ApiAccessVariant, string> = {
  proxy: "same-origin `/api` (Next.js rewrite in dev, reverse proxy in prod)",
  direct:
    "direct — the browser calls the API origin (e.g. api.<domain>); CORS + parent-domain session cookie",
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
    apiAccess: ApiAccessVariant;
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
    ["__API_ACCESS_VARIANT__", API_ACCESS_LABELS[choices.apiAccess]],
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

/**
 * Anchored single replacement inside one scaffolded file. Throws when the
 * file exists without the anchor, so template drift is caught by the
 * scaffold tests — same contract as stampProdBranch. Missing files are
 * skipped (test fixtures use minimal templates).
 */
function replaceAnchored(
  targetDir: string,
  relative: string,
  anchor: string,
  replacement: string
): void {
  const filePath = path.join(targetDir, relative);
  if (!existsSync(filePath)) {
    return;
  }
  const source = readFileSync(filePath, "utf8");
  if (!source.includes(anchor)) {
    throw new Error(
      `--api=direct anchor not found in ${filePath}: ${JSON.stringify(anchor.slice(0, 60))}…`
    );
  }
  writeFileSync(filePath, source.replace(anchor, replacement));
}

/**
 * --api=direct: drop the Next.js /api proxy — the browser calls the API on
 * its own origin (api.<domain> next to app.<domain>). Same-site subdomains
 * keep SameSite=Lax cookies working; the session cookie is scoped to the
 * parent domain (COOKIE_DOMAIN) so the web app (SSR) sees it too. Applied as
 * anchored edits after all overlays: the anchors are identical across the
 * variants that overlay the same files (e.g. logging-winston's
 * app.setup.ts), so the edits compose with every axis.
 */
function applyDirectApi(targetDir: string): void {
  // Web: remove the rewrite (and its now-unused env import + /api headers).
  replaceAnchored(
    targetDir,
    "apps/web/next.config.ts",
    '\nimport { env } from "./src/env";',
    ""
  );
  replaceAnchored(
    targetDir,
    "apps/web/next.config.ts",
    `    return [
      { source: "/(.*)", headers: securityHeaders },
      // Defense in depth: /api/* proxies authenticated JSON to the API,
      // which already sends no-store — pin it here too so a shared cache
      // can never store a response even if the API header regresses. In
      // production the reverse proxy routes /api directly to the API,
      // where per-endpoint opt-ins (e.g. openapi.json) still apply.
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];`,
    '    return [{ source: "/(.*)", headers: securityHeaders }];'
  );
  replaceAnchored(
    targetDir,
    "apps/web/next.config.ts",
    `
  async rewrites() {
    // Same-origin API: the browser only ever talks to /api/* on this host.
    // In production the reverse proxy routes /api instead (see compose prod).
    return [
      {
        source: "/api/:path*",
        destination: \`\${env.API_URL}/:path*\`,
      },
    ];
  },`,
    ""
  );

  // Web: auth client talks to the API origin, not the local /api proxy.
  replaceAnchored(
    targetDir,
    "apps/web/src/lib/auth-client.ts",
    'import { createAuthClient } from "better-auth/react";',
    'import { createAuthClient } from "better-auth/react";\nimport { env } from "../env";'
  );
  replaceAnchored(
    targetDir,
    "apps/web/src/lib/auth-client.ts",
    `baseURL:
    typeof window === "undefined"
      ? "http://localhost:3000/api/auth"
      : \`\${window.location.origin}/api/auth\`,`,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source-code anchor
    "baseURL: `${env.NEXT_PUBLIC_API_URL}/auth`,"
  );

  // Api: no proxy strips /api anymore — the request path already matches
  // Better-Auth's public base (<API_PUBLIC_URL>/auth). Anchor text is
  // identical in the pino and winston app.setup.ts.
  replaceAnchored(
    targetDir,
    "apps/api/src/app.setup.ts",
    `express.all("/auth/*splat", (req, res) => {
    // Better-Auth matches against its public base (<WEB_URL>/api/auth), but
    // the /api prefix is stripped by the Next rewrite / reverse proxy before
    // the request reaches us — restore it so the router matches.
    req.url = \`/api\${req.url}\`;
    return authHandler(req, res);
  });`,
    `// Direct mode: the browser reaches this host at <API_PUBLIC_URL>/auth/*,
  // so the path already matches Better-Auth's public base — no prefix fixup.
  express.all("/auth/*splat", (req, res) => authHandler(req, res));`
  );

  // Api: auth endpoints live on the API's own public origin; scope the
  // session cookie to the parent domain so app.<domain> (SSR) sees it.
  replaceAnchored(
    targetDir,
    "apps/api/src/auth/auth.module.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source-code anchor
    "baseUrl: `${env.WEB_URL}/api/auth`,",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal source-code anchor
    "baseUrl: `${env.API_PUBLIC_URL}/auth`,"
  );
  replaceAnchored(
    targetDir,
    "apps/api/src/auth/auth.module.ts",
    "trustedOrigins: [env.WEB_URL],",
    "trustedOrigins: [env.WEB_URL],\n          // Parent-domain session cookie — the web subdomain (SSR) must see it.\n          cookieDomain: env.COOKIE_DOMAIN,"
  );
  replaceAnchored(
    targetDir,
    "apps/api/src/config/env.ts",
    `    /** Public origin of the web app — trusted origin + base for auth URLs. */
    WEB_URL: z.url(),`,
    `    /** Public origin of the web app — trusted origin + base for auth URLs. */
    WEB_URL: z.url(),
    /** Public origin of the API as the browser reaches it, e.g. https://api.example.com */
    API_PUBLIC_URL: z.url(),
    /** Parent domain the session cookie is scoped to, e.g. "example.com". */
    COOKIE_DOMAIN: z.string().min(1),`
  );

  // Env inventory: the browser calls the API origin; two new variables.
  replaceAnchored(
    targetDir,
    ".env.example",
    `# What the browser calls. Same-origin via the Next.js /api rewrite — no CORS.
NEXT_PUBLIC_API_URL=http://localhost:3000/api`,
    `# What the browser calls — the API's own origin (CORS allows WEB_URL).
NEXT_PUBLIC_API_URL=http://localhost:3001
# Public origin of the API as the browser reaches it — Better-Auth's base.
# Prod: a sibling subdomain of WEB_URL, e.g. https://api.example.com.
API_PUBLIC_URL=http://localhost:3001
# Parent domain the session cookie is scoped to, so app.<domain> and
# api.<domain> both see it (prod: example.com — no leading dot needed).
COOKIE_DOMAIN=localhost`
  );
  replaceAnchored(
    targetDir,
    ".env.example",
    "<WEB_URL>/api/auth/callback/microsoft",
    "<API_PUBLIC_URL>/auth/callback/microsoft"
  );

  // Prod compose example: route the api on its own subdomain, no strip.
  replaceAnchored(
    targetDir,
    "docker-compose.prod.yml",
    "#   - traefik.http.routers.app-api.rule=Host(`app.example.com`) && PathPrefix(`/api`)\n    #   - traefik.http.middlewares.app-api-strip.stripprefix.prefixes=/api\n    #   - traefik.http.routers.app-api.middlewares=app-api-strip",
    "#   - traefik.http.routers.app-api.rule=Host(`api.example.com`)"
  );

  // Docs: replace the same-origin story with the split-subdomain one.
  replaceAnchored(
    targetDir,
    "README.md",
    `- **Same-origin API.** The browser only calls \`/api/*\` on the web origin; Next rewrites to
  the api in dev, the reverse proxy routes it in prod. No CORS, no cookie domain pain.`,
    `- **Direct API.** The browser calls the API on its own origin (\`api.<domain>\` next to
  \`app.<domain>\`): CORS allows the web origin and the session cookie is scoped to the
  parent domain (\`COOKIE_DOMAIN\`), so same-site cookies keep working.`
  );
  replaceAnchored(
    targetDir,
    "docs/architecture.md",
    "web/                  Next.js 16 — UI, same-origin /api proxy, no business logic",
    "web/                  Next.js 16 — UI only, no API proxy, no business logic"
  );
  replaceAnchored(
    targetDir,
    "docs/architecture.md",
    `  B->>W: /api/projects (cookie)
  W->>A: rewrite → /projects`,
    "  B->>A: /projects (cookie; CORS)"
  );
  replaceAnchored(
    targetDir,
    "docs/architecture.md",
    `Everything is **same-origin**: the browser only ever talks to the web origin.
In dev, \`next.config.ts\` rewrites \`/api/:path*\` to the api; in production the
reverse proxy routes the \`/api\` prefix instead (see \`docs/deployment.md\`).
CORS and cookie domains are therefore non-issues by construction.`,
    `The browser talks to the API **directly** on its own origin
(\`API_PUBLIC_URL\`, e.g. \`https://api.example.com\` next to
\`https://app.example.com\`). Both origins share a parent domain, so they are
**same-site**: SameSite=Lax cookies still flow, CORS is enabled for
\`WEB_URL\`, and the session cookie is scoped to the parent domain
(\`COOKIE_DOMAIN\`) so the web app's SSR sees it too (see
\`docs/deployment.md\`).`
  );
  replaceAnchored(
    targetDir,
    "docs/architecture.md",
    `3. **better-auth handler** — mounted *before* \`app.init()\` because Nest
   registers its 404 catch-all during init. The mount re-prefixes the URL
   (\`/auth/x\` → \`/api/auth/x\`) because better-auth matches requests against
   the path of its public \`baseURL\` and the proxy strips \`/api\`.`,
    `3. **better-auth handler** — mounted *before* \`app.init()\` because Nest
   registers its 404 catch-all during init. Requests arrive at \`/auth/*\`
   exactly as better-auth's public \`baseURL\` path expects — no rewriting.`
  );
  replaceAnchored(
    targetDir,
    "docs/stack.md",
    "`/api` rewrite makes the whole app same-origin",
    "no API proxy — the browser calls the API origin directly"
  );
  replaceAnchored(
    targetDir,
    "docs/deployment.md",
    `Create the shared network once: \`docker network create proxy\`. Route
path-based on one hostname (keeps everything same-origin):

- \`app.example.com/*\` → \`web:3000\`
- \`app.example.com/api/*\` → \`api:3001\`, **stripping the \`/api\` prefix**

Traefik labels for exactly this are commented in \`docker-compose.prod.yml\`.
nginx equivalent: \`location /api/ { proxy_pass http://api:3001/; }\` (note
both trailing slashes — that's what strips the prefix). The api re-adds
\`/api\` internally for the Better-Auth router; nothing else cares.`,
    `Create the shared network once: \`docker network create proxy\`. Route each
app on its own subdomain of one parent domain (same-site, so cookies work):

- \`app.example.com/*\` → \`web:3000\`
- \`api.example.com/*\` → \`api:3001\` (no path prefix, nothing to strip)

Traefik labels for exactly this are commented in \`docker-compose.prod.yml\`.
nginx equivalent: a second \`server\` block for \`api.example.com\` with
\`location / { proxy_pass http://api:3001; }\`. Set \`COOKIE_DOMAIN\` to the
parent domain (\`example.com\`) so both subdomains see the session cookie.`
  );
  replaceAnchored(
    targetDir,
    "docs/deployment.md",
    "| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api` | `https://app.example.com/api` (build arg) |",
    `| \`NEXT_PUBLIC_API_URL\` | \`http://localhost:3001\` | \`https://api.example.com\` (build arg) |
| \`API_PUBLIC_URL\` | \`http://localhost:3001\` | \`https://api.example.com\` |
| \`COOKIE_DOMAIN\` | \`localhost\` | \`example.com\` (the shared parent domain) |`
  );
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
    apiAccess = "proxy",
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
      apiAccess,
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
  // After every overlay (the anchors live in files some overlays replace)
  // and before writeDotEnv (.env inherits the patched .env.example).
  if (apiAccess === "direct") {
    applyDirectApi(targetDir);
  }
  if (!backup) {
    pruneBackup(targetDir);
  }
  restoreDotfiles(targetDir);
  setProjectName(targetDir, projectName);
  // Must stay after stampEnvChoices/pruneBackup: .env inherits the stamped
  // .env.example (and never carries BACKUP_* when backup was pruned).
  writeDotEnv(targetDir);
}
