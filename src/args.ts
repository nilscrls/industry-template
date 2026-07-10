import {
  AI_VARIANTS,
  type AiVariant,
  AUTHZ_VARIANTS,
  type AuthzVariant,
  LOCALE_VARIANTS,
  type LocaleVariant,
  PROD_BRANCH_VARIANTS,
  type ProdBranch,
  UI_VARIANTS,
  type UiVariant,
} from "./scaffold.js";

export interface CliFlags {
  ai: AiVariant | undefined;
  authz: AuthzVariant | undefined;
  branch: ProdBranch | undefined;
  directory: string | undefined;
  git: boolean;
  install: boolean;
  locale: LocaleVariant | undefined;
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

export function parseArgs(argv: string[]): CliFlags {
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
    branch: enumFlag(argv, "branch", PROD_BRANCH_VARIANTS),
  };
}
