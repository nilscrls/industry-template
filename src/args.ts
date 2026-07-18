import {
  AI_VARIANTS,
  type AiVariant,
  AUTHZ_VARIANTS,
  type AuthzVariant,
  CI_VARIANTS,
  type CiVariant,
  FEATURE_FLAGS,
  type FeatureFlag,
  I18N_VARIANTS,
  type I18nVariant,
  LOCALE_VARIANTS,
  LOGGING_VARIANTS,
  type LocaleVariant,
  type LoggingVariant,
  OBSERVABILITY_TOOLS,
  type ObservabilityTool,
  ORG_VARIANTS,
  type OrgVariant,
  PROD_BRANCH_VARIANTS,
  type ProdBranch,
  UI_VARIANTS,
  type UiVariant,
} from "./scaffold.js";

export interface CliFlags {
  ai: AiVariant | undefined;
  authz: AuthzVariant | undefined;
  /** Tri-state: --backup → true, --no-backup → false, absent → undefined (prompt). */
  backup: boolean | undefined;
  branch: ProdBranch | undefined;
  ci: CiVariant | undefined;
  directory: string | undefined;
  featureFlags: FeatureFlag[] | undefined;
  git: boolean;
  i18n: I18nVariant | undefined;
  install: boolean;
  locale: LocaleVariant | undefined;
  logging: LoggingVariant | undefined;
  observability: ObservabilityTool[] | undefined;
  org: OrgVariant | undefined;
  ui: UiVariant | undefined;
  yes: boolean;
}

/**
 * Read a `--name=value` flag and narrow it to one of `allowed`. Absent → undefined;
 * present but invalid → print the accepted values and exit(1) (the CLI cannot
 * proceed on a bad choice, and a thrown error would print a stack trace).
 */
export function enumFlag<TValue extends string>(
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

/**
 * Read a `--name=a,b` multi-value flag. Absent → undefined; `--name=none`
 * (alone) → []; any invalid or empty item, or `none` mixed with values →
 * print the accepted values and exit(1). Duplicates are collapsed.
 */
export function listFlag<TValue extends string>(
  argv: string[],
  name: string,
  allowed: readonly TValue[]
): TValue[] | undefined {
  const prefix = `--${name}=`;
  const raw = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) {
    return;
  }
  const fail = (): never => {
    console.error(
      `Invalid --${name}=${raw} (expected "none" or a comma-separated subset of: ${allowed.join(", ")})`
    );
    process.exit(1);
  };
  const items = raw.split(",");
  if (items.includes("none")) {
    return items.length === 1 ? [] : fail();
  }
  const values: TValue[] = [];
  for (const item of items) {
    if (!allowed.includes(item as TValue)) {
      fail();
    }
    if (!values.includes(item as TValue)) {
      values.push(item as TValue);
    }
  }
  return values;
}

/**
 * Read a boolean flag in any of its spellings: `--name` / `--name=true` →
 * true, `--no-name` / `--name=false` → false, absent → undefined (the prompt
 * decides). `--no-name` wins over `--name` (explicit off is the safer read).
 * Invalid `--name=<other>` exits like enumFlag.
 */
export function boolFlag(argv: string[], name: string): boolean | undefined {
  if (argv.includes(`--no-${name}`)) {
    return false;
  }
  if (argv.includes(`--${name}`)) {
    return true;
  }
  const value = enumFlag(argv, name, ["true", "false"] as const);
  if (value === undefined) {
    return;
  }
  return value === "true";
}

export function parseArgs(argv: string[]): CliFlags {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  return {
    directory: positional[0],
    yes: argv.includes("--yes") || argv.includes("-y"),
    git: !argv.includes("--no-git"),
    install: !argv.includes("--no-install"),
    ui: enumFlag(argv, "ui", UI_VARIANTS),
    authz: enumFlag(argv, "authz", AUTHZ_VARIANTS),
    org: enumFlag(argv, "org", ORG_VARIANTS),
    locale: enumFlag(argv, "locale", LOCALE_VARIANTS),
    i18n: enumFlag(argv, "i18n", I18N_VARIANTS),
    logging: enumFlag(argv, "logging", LOGGING_VARIANTS),
    ci: enumFlag(argv, "ci", CI_VARIANTS),
    ai: enumFlag(argv, "ai", AI_VARIANTS),
    branch: enumFlag(argv, "branch", PROD_BRANCH_VARIANTS),
    observability: listFlag(argv, "observability", OBSERVABILITY_TOOLS),
    featureFlags: listFlag(argv, "flags", FEATURE_FLAGS),
    backup: boolFlag(argv, "backup"),
  };
}
