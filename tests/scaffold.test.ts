import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDirEmpty, scaffold, validateProjectName } from "../src/scaffold.js";

const REAL_TEMPLATE = path.resolve(import.meta.dirname, "..", "template");
const REAL_VARIANTS = path.resolve(import.meta.dirname, "..", "variants");

let workDir: string;

function makeFixtureTemplate(): string {
  const templateDir = path.join(workDir, "fixture-template");
  mkdirSync(path.join(templateDir, "apps", "web"), { recursive: true });
  writeFileSync(
    path.join(templateDir, "package.json"),
    JSON.stringify({ name: "industry-app", private: true }, null, 2)
  );
  writeFileSync(path.join(templateDir, "_gitignore"), "node_modules/\n");
  writeFileSync(
    path.join(templateDir, "apps", "web", "_gitignore"),
    ".next/\n"
  );
  writeFileSync(
    path.join(templateDir, ".env.example"),
    "DATABASE_URL=postgres://localhost:5432/app\nBETTER_AUTH_SECRET=\n"
  );
  mkdirSync(path.join(templateDir, "node_modules", "junk"), {
    recursive: true,
  });
  writeFileSync(path.join(templateDir, "node_modules", "junk", "index.js"), "");
  return templateDir;
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "create-industry-app-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("validateProjectName", () => {
  it("accepts kebab-case names", () => {
    expect(validateProjectName("my-app")).toBeUndefined();
  });

  it.each(["", "My-App", "-app", "app name"])("rejects %j", (name) => {
    expect(validateProjectName(name)).toBeDefined();
  });
});

describe("isDirEmpty", () => {
  it("treats a missing directory as empty", () => {
    expect(isDirEmpty(path.join(workDir, "missing"))).toBe(true);
  });

  it("ignores a lone .git directory", () => {
    const dir = path.join(workDir, "with-git");
    mkdirSync(path.join(dir, ".git"), { recursive: true });
    expect(isDirEmpty(dir)).toBe(true);
  });
});

describe("scaffold", () => {
  it("copies the template, restores dotfiles, sets the name and generates secrets", () => {
    const targetDir = path.join(workDir, "out");
    scaffold({
      templateDir: makeFixtureTemplate(),
      targetDir,
      projectName: "acme-erp",
      ai: "none",
    });

    const packageJson = JSON.parse(
      readFileSync(path.join(targetDir, "package.json"), "utf8")
    );
    expect(packageJson.name).toBe("acme-erp");

    expect(existsSync(path.join(targetDir, ".gitignore"))).toBe(true);
    expect(existsSync(path.join(targetDir, "_gitignore"))).toBe(false);
    expect(existsSync(path.join(targetDir, "apps", "web", ".gitignore"))).toBe(
      true
    );
    expect(existsSync(path.join(targetDir, "node_modules"))).toBe(false);

    const env = readFileSync(path.join(targetDir, ".env"), "utf8");
    expect(env).toMatch(/^BETTER_AUTH_SECRET=[0-9a-f]{64}$/m);
    expect(env).toContain("DATABASE_URL=postgres://localhost:5432/app");
  });

  it("refuses a non-empty target directory", () => {
    const targetDir = path.join(workDir, "occupied");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(path.join(targetDir, "keep.txt"), "");
    expect(() =>
      scaffold({
        templateDir: makeFixtureTemplate(),
        targetDir,
        projectName: "acme-erp",
      })
    ).toThrow(/not empty/);
  });

  it("scaffolds the real template with its workspace intact", () => {
    const targetDir = path.join(workDir, "real");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
    });

    for (const file of [
      "pnpm-workspace.yaml",
      "turbo.json",
      "biome.jsonc",
      ".gitignore",
      ".env",
      "docker-compose.yml",
      "docker-compose.dev.yml",
      "docker-compose.prod.yml",
      "apps/api/package.json",
      "apps/web/package.json",
      "packages/contracts/package.json",
      "packages/i18n/package.json",
      "packages/i18n/messages/en.json",
      "packages/i18n/messages/fr.json",
      "packages/ui/package.json",
      "packages/ui/src/components/button.tsx",
      "release-please-config.json",
      ".release-please-manifest.json",
      ".github/workflows/release-please.yml",
      "CHANGELOG.md",
      "apps/web/content/changelog.md",
      "apps/web/src/app/(public)/changelog/page.tsx",
      "apps/web/content/legal/mentions.en.md",
      "apps/web/content/legal/mentions.fr.md",
      "apps/web/content/legal/privacy.en.md",
      "apps/web/content/legal/privacy.fr.md",
      "apps/web/content/legal/terms.en.md",
      "apps/web/content/legal/terms.fr.md",
      "apps/web/src/app/(public)/legal/privacy/page.tsx",
      "apps/web/src/components/footer.tsx",
      "apps/web/src/components/consent.tsx",
      "apps/api/src/privacy/privacy.module.ts",
      "docs/compliance.md",
      "packages/db/drizzle/0000_roles.sql",
      "packages/db/drizzle/0001_init.sql",
      "packages/db/sql/init-roles.sh",
      "scripts/backup/backup-db.mjs",
      "scripts/backup/restore-db.mjs",
      "docs/backup.md",
    ]) {
      expect(existsSync(path.join(targetDir, file)), `missing ${file}`).toBe(
        true
      );
    }

    // Backup tooling ships by default: compose block, env vars carried into
    // the generated .env, and the root package.json scripts.
    expect(
      readFileSync(path.join(targetDir, "docker-compose.yml"), "utf8")
    ).toContain("backup-db:");
    expect(readFileSync(path.join(targetDir, ".env"), "utf8")).toContain(
      "BACKUP_DIR="
    );
    expect(
      JSON.parse(readFileSync(path.join(targetDir, "package.json"), "utf8"))
        .scripts["backup:db"]
    ).toBeDefined();

    // Defaults: Radix primitives, RBAC permissions, English fallback locale.
    const uiDeps = JSON.parse(
      readFileSync(path.join(targetDir, "packages/ui/package.json"), "utf8")
    ).dependencies;
    expect(uiDeps["@radix-ui/react-dialog"]).toBeDefined();
    expect(
      readFileSync(
        path.join(targetDir, "packages/contracts/src/permissions.ts"),
        "utf8"
      )
    ).toContain('"manager"');
    // RBAC flavor of the FGA model: global roles + per-user deny grants.
    const model = readFileSync(
      path.join(targetDir, "packages/fga/model.fga"),
      "utf8"
    );
    expect(model).toContain("define manager: [user]");
    expect(model).toContain("but not denied_read");
    expect(
      readFileSync(path.join(targetDir, "packages/i18n/src/config.ts"), "utf8")
    ).toContain('DEFAULT_LOCALE: Locale = "en"');
  });

  it("applies the Base UI overlay when ui=base", () => {
    const targetDir = path.join(workDir, "real-base");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      ui: "base",
    });

    const uiDeps = JSON.parse(
      readFileSync(path.join(targetDir, "packages/ui/package.json"), "utf8")
    ).dependencies;
    expect(uiDeps["@base-ui/react"]).toBeDefined();
    expect(uiDeps["@radix-ui/react-dialog"]).toBeUndefined();
    expect(
      readFileSync(
        path.join(targetDir, "packages/ui/src/components/dialog.tsx"),
        "utf8"
      )
    ).toContain("@base-ui/react");
  });

  it("applies the ReBAC overlay when authz=rebac", () => {
    const targetDir = path.join(workDir, "real-rebac");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      authz: "rebac",
    });

    const permissions = readFileSync(
      path.join(targetDir, "packages/contracts/src/permissions.ts"),
      "utf8"
    );
    expect(permissions).toContain("projectRelations");
    expect(permissions).not.toContain('"manager"');
    expect(
      readFileSync(
        path.join(targetDir, "packages/db/src/schema/permissions.ts"),
        "utf8"
      )
    ).toContain("projectMember");
    // ReBAC flavor of the FGA model: the owner ⊃ editor ⊃ viewer ladder.
    const model = readFileSync(
      path.join(targetDir, "packages/fga/model.fga"),
      "utf8"
    );
    expect(model).toContain("define editor: [user] or owner");
    expect(model).not.toContain("granted_read");
    // The RBAC migrations are replaced wholesale by the manifest.
    expect(
      readFileSync(
        path.join(targetDir, "packages/db/drizzle/0001_init.sql"),
        "utf8"
      )
    ).toContain("project_member");
    expect(
      existsSync(path.join(targetDir, "packages/db/drizzle/0000_roles.sql"))
    ).toBe(true);
  });

  it("stamps the default production branch (main) with no marker residue", () => {
    const targetDir = path.join(workDir, "real-main");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
    });

    expect(
      readFileSync(path.join(targetDir, ".github/workflows/ci.yml"), "utf8")
    ).toContain("branches: [main, develop]");
    expect(
      readFileSync(
        path.join(targetDir, ".github/workflows/release-please.yml"),
        "utf8"
      )
    ).toContain("branches: [main]");
    for (const file of [
      ".github/workflows/ci.yml",
      ".github/workflows/release-please.yml",
      "README.md",
      "docs/guides.md",
      "docs/releases.md",
      "CONTRIBUTING.md",
      "AGENTS.md",
    ]) {
      expect(
        readFileSync(path.join(targetDir, file), "utf8"),
        `marker left in ${file}`
      ).not.toContain("__PROD_BRANCH__");
    }
    expect(
      readFileSync(path.join(targetDir, "CONTRIBUTING.md"), "utf8")
    ).toContain("`main` — production");
  });

  it("stamps master everywhere when prodBranch=master", () => {
    const targetDir = path.join(workDir, "real-master");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      prodBranch: "master",
    });

    expect(
      readFileSync(path.join(targetDir, ".github/workflows/ci.yml"), "utf8")
    ).toContain("branches: [master, develop]");
    expect(readFileSync(path.join(targetDir, "README.md"), "utf8")).toContain(
      "`master` (production)"
    );
    expect(
      readFileSync(path.join(targetDir, "docs/guides.md"), "utf8")
    ).toContain("`master` = production");
    expect(
      readFileSync(path.join(targetDir, "CONTRIBUTING.md"), "utf8")
    ).toContain("`master` — production");
    // ai=claude default: AGENTS.md convention stamped too.
    const agents = readFileSync(path.join(targetDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("`master`/`develop`");
    expect(agents).not.toContain("__PROD_BRANCH__");
  });

  it("throws when a branch-marked file has lost its marker", () => {
    const templateDir = makeFixtureTemplate();
    writeFileSync(
      path.join(templateDir, "CONTRIBUTING.md"),
      "# Contributing\n\nProduction branch: main\n"
    );
    expect(() =>
      scaffold({
        templateDir,
        targetDir: path.join(workDir, "bad-branch-marker"),
        projectName: "acme-erp",
        ai: "none",
      })
    ).toThrow(/Marker __PROD_BRANCH__ not found/);
  });

  it("sets the default locale when locale=fr", () => {
    const targetDir = path.join(workDir, "real-fr");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      locale: "fr",
    });

    expect(
      readFileSync(path.join(targetDir, "packages/i18n/src/config.ts"), "utf8")
    ).toContain('DEFAULT_LOCALE: Locale = "fr"');
  });

  it("emits AI config by default, stamped with the chosen variants", () => {
    const targetDir = path.join(workDir, "real-ai");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      authz: "rebac",
    });

    expect(readFileSync(path.join(targetDir, "CLAUDE.md"), "utf8")).toContain(
      "@AGENTS.md"
    );
    const agents = readFileSync(path.join(targetDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("Radix UI");
    expect(agents).toContain("ReBAC");
    expect(agents).toContain("en (English)");
    expect(agents).not.toContain("__UI_VARIANT__");
    for (const marker of [
      "__ORG_VARIANT__",
      "__I18N_VARIANT__",
      "__LOGGING_VARIANT__",
      "__CI_VARIANT__",
      "__OBSERVABILITY_VARIANT__",
    ]) {
      expect(agents, `marker left: ${marker}`).not.toContain(marker);
    }
    // Default (non-flag) axes stamped with their labels.
    expect(agents).toContain("multi-organization");
    expect(agents).toContain("cookie-based locale");
    expect(agents).toContain("pino");
    expect(agents).toContain("GitHub Actions");
    const rulesDir = path.join(targetDir, ".claude", "rules");
    for (const rule of [
      "api.md",
      "web.md",
      "db.md",
      "testing.md",
      "authz.md",
      "ui.md",
      "logging.md",
    ]) {
      expect(existsSync(path.join(rulesDir, rule)), `missing ${rule}`).toBe(
        true
      );
    }
    // Variant rule selection: rebac authz + default radix ui + default pino
    // logger, no leftovers.
    expect(readFileSync(path.join(rulesDir, "authz.md"), "utf8")).toContain(
      "ReBAC"
    );
    expect(readFileSync(path.join(rulesDir, "ui.md"), "utf8")).toContain(
      "Radix"
    );
    for (const leftover of [
      "authz.rbac.md",
      "authz.rebac.md",
      "ui.radix.md",
      "ui.base.md",
      "logging.pino.md",
      "logging.winston.md",
    ]) {
      expect(existsSync(path.join(rulesDir, leftover))).toBe(false);
    }
    expect(
      existsSync(path.join(targetDir, ".claude", "agents", "code-reviewer.md"))
    ).toBe(true);
    // The overlay ships `_claude` (npm-safe); the scaffold must rename it.
    expect(existsSync(path.join(targetDir, "_claude"))).toBe(false);
    for (const skill of [
      "scaffold-feature",
      "react-best-practices",
      "next-dev-loop",
      "webapp-testing",
    ]) {
      expect(
        existsSync(
          path.join(targetDir, ".claude", "skills", skill, "SKILL.md")
        ),
        `missing .claude/skills/${skill}/SKILL.md`
      ).toBe(true);
    }
    expect(
      existsSync(
        path.join(targetDir, ".claude", "skills", "vendored.lock.json")
      )
    ).toBe(true);
  });

  it("emits no AI config when ai=none", () => {
    const targetDir = path.join(workDir, "real-no-ai");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      ai: "none",
    });

    expect(existsSync(path.join(targetDir, "CLAUDE.md"))).toBe(false);
    expect(existsSync(path.join(targetDir, "AGENTS.md"))).toBe(false);
    expect(existsSync(path.join(targetDir, ".claude"))).toBe(false);
  });

  it("rejects a non-default variant without a variants directory", () => {
    expect(() =>
      scaffold({
        templateDir: makeFixtureTemplate(),
        targetDir: path.join(workDir, "no-variants"),
        projectName: "acme-erp",
        ui: "base",
      })
    ).toThrow(/variants directory/);
  });

  it("throws when a requested overlay is missing from the variants dir", () => {
    const emptyVariants = path.join(workDir, "empty-variants");
    mkdirSync(emptyVariants, { recursive: true });
    expect(() =>
      scaffold({
        templateDir: makeFixtureTemplate(),
        variantsDir: emptyVariants,
        targetDir: path.join(workDir, "missing-overlay"),
        projectName: "acme-erp",
        ui: "base",
      })
    ).toThrow(/overlay not found/);
  });

  it("throws when the locale marker is absent from the i18n config", () => {
    const templateDir = makeFixtureTemplate();
    mkdirSync(path.join(templateDir, "packages", "i18n", "src"), {
      recursive: true,
    });
    writeFileSync(
      path.join(templateDir, "packages", "i18n", "src", "config.ts"),
      'export const DEFAULT_LOCALE = "de";\n'
    );
    expect(() =>
      scaffold({
        templateDir,
        targetDir: path.join(workDir, "bad-locale-marker"),
        projectName: "acme-erp",
        ai: "none",
        locale: "fr",
      })
    ).toThrow(/Could not set default locale/);
  });

  it("composes every non-default axis in one scaffold", () => {
    const targetDir = path.join(workDir, "real-combined");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      ui: "base",
      authz: "rebac",
      org: "single",
      locale: "fr",
      i18n: "url",
      logging: "winston",
      ci: "gitlab",
      observability: ["posthog"],
      backup: false,
      ai: "claude",
    });

    // Base UI overlay won over Radix.
    const uiDeps = JSON.parse(
      readFileSync(path.join(targetDir, "packages/ui/package.json"), "utf8")
    ).dependencies;
    expect(uiDeps["@base-ui/react"]).toBeDefined();
    expect(uiDeps["@radix-ui/react-dialog"]).toBeUndefined();

    // ReBAC overlay won, and its _delete.json wiped the RBAC migrations.
    const permissions = readFileSync(
      path.join(targetDir, "packages/contracts/src/permissions.ts"),
      "utf8"
    );
    expect(permissions).toContain("projectRelations");
    expect(permissions).not.toContain('"manager"');
    expect(
      readFileSync(
        path.join(targetDir, "packages/db/drizzle/0001_init.sql"),
        "utf8"
      )
    ).toContain("project_member");

    // French fallback locale.
    expect(
      readFileSync(path.join(targetDir, "packages/i18n/src/config.ts"), "utf8")
    ).toContain('DEFAULT_LOCALE: Locale = "fr"');

    // org-single applied AFTER ui-base: its UI-neutral org-switcher wins.
    expect(
      readFileSync(
        path.join(targetDir, "apps/web/src/components/org-switcher.tsx"),
        "utf8"
      )
    ).not.toContain("@repo/ui/components");
    // i18n-url middleware + the wave-0 locale-switcher extraction survive.
    expect(
      readFileSync(path.join(targetDir, "apps/web/src/middleware.ts"), "utf8")
    ).toContain("NextResponse.rewrite");
    expect(
      existsSync(
        path.join(targetDir, "apps/web/src/components/locale-switcher.tsx")
      )
    ).toBe(true);

    // winston overlay replaced the api logger deps.
    const apiDeps = JSON.parse(
      readFileSync(path.join(targetDir, "apps/api/package.json"), "utf8")
    ).dependencies;
    expect(apiDeps["nest-winston"]).toBeDefined();
    expect(apiDeps["nestjs-pino"]).toBeUndefined();

    // ci-gitlab overlay: .gitlab-ci.yml present, .github removed by _delete.json.
    expect(existsSync(path.join(targetDir, ".gitlab-ci.yml"))).toBe(true);
    expect(existsSync(path.join(targetDir, ".github"))).toBe(false);

    // backup=false pruned the tooling.
    expect(existsSync(path.join(targetDir, "scripts", "backup"))).toBe(false);

    // AGENTS.md stamped with every chosen axis, no leftover markers.
    const agents = readFileSync(path.join(targetDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("Base UI");
    expect(agents).toContain("ReBAC");
    expect(agents).toContain("single-organization");
    expect(agents).toContain("fr (Français)");
    expect(agents).toContain("URL-prefixed");
    expect(agents).toContain("winston");
    expect(agents).toContain("GitLab CI");
    expect(agents).toContain("posthog");
    for (const marker of [
      "__UI_VARIANT__",
      "__AUTHZ_VARIANT__",
      "__ORG_VARIANT__",
      "__LOCALE_VARIANT__",
      "__I18N_VARIANT__",
      "__LOGGING_VARIANT__",
      "__CI_VARIANT__",
      "__OBSERVABILITY_VARIANT__",
    ]) {
      expect(agents, `marker left: ${marker}`).not.toContain(marker);
    }

    // Variant rules resolved to the base/rebac/winston triple, no leftovers.
    const rulesDir = path.join(targetDir, ".claude", "rules");
    expect(readFileSync(path.join(rulesDir, "ui.md"), "utf8")).toContain(
      "Base UI primitives"
    );
    expect(readFileSync(path.join(rulesDir, "authz.md"), "utf8")).toContain(
      "ReBAC"
    );
    expect(existsSync(path.join(rulesDir, "logging.md"))).toBe(true);
    for (const leftover of [
      "authz.rbac.md",
      "authz.rebac.md",
      "ui.radix.md",
      "ui.base.md",
      "logging.pino.md",
      "logging.winston.md",
    ]) {
      expect(existsSync(path.join(rulesDir, leftover))).toBe(false);
    }
  });

  describe("org variant", () => {
    it("applies the single-org overlay when org=single", () => {
      const targetDir = path.join(workDir, "real-org-single");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        org: "single",
      });

      // auth.ts single-org deltas.
      const auth = readFileSync(
        path.join(targetDir, "packages/auth/src/auth.ts"),
        "utf8"
      );
      expect(auth).toContain("allowUserToCreateOrganization: false");
      expect(auth).toContain("DEFAULT_ORG");
      // org-switcher stub is UI-library-neutral (applied after ui-base).
      expect(
        readFileSync(
          path.join(targetDir, "apps/web/src/components/org-switcher.tsx"),
          "utf8"
        )
      ).not.toContain("@repo/ui/components");
    });
  });

  describe("i18n routing variant", () => {
    it("applies the url-prefix overlay when i18n=url", () => {
      const targetDir = path.join(workDir, "real-i18n-url");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        i18n: "url",
      });

      const middleware = readFileSync(
        path.join(targetDir, "apps/web/src/middleware.ts"),
        "utf8"
      );
      expect(middleware).toContain("LOCALE_HEADER");
      expect(middleware).toContain("NextResponse.rewrite");
      expect(
        readFileSync(
          path.join(targetDir, "apps/web/src/lib/navigation.tsx"),
          "utf8"
        )
      ).toContain("localizeHref");
    });
  });

  describe("logging variant", () => {
    it("applies the winston overlay when logging=winston", () => {
      const targetDir = path.join(workDir, "real-winston");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        logging: "winston",
      });

      const apiDeps = JSON.parse(
        readFileSync(path.join(targetDir, "apps/api/package.json"), "utf8")
      ).dependencies;
      expect(apiDeps["nest-winston"]).toBeDefined();
      expect(apiDeps.winston).toBeDefined();
      expect(apiDeps["nestjs-pino"]).toBeUndefined();
    });
  });

  describe("ci variant", () => {
    it("applies the gitlab overlay and stamps the prod branch into .gitlab-ci.yml", () => {
      const targetDir = path.join(workDir, "real-gitlab");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        ci: "gitlab",
        prodBranch: "master",
      });

      expect(existsSync(path.join(targetDir, ".gitlab-ci.yml"))).toBe(true);
      // _delete.json removed GitHub Actions + release-please.
      expect(existsSync(path.join(targetDir, ".github"))).toBe(false);
      expect(
        existsSync(path.join(targetDir, "release-please-config.json"))
      ).toBe(false);
      expect(
        existsSync(path.join(targetDir, ".release-please-manifest.json"))
      ).toBe(false);
      const gitlabCi = readFileSync(
        path.join(targetDir, ".gitlab-ci.yml"),
        "utf8"
      );
      expect(gitlabCi).toContain("master");
      expect(gitlabCi).not.toContain("__PROD_BRANCH__");
      // GitLab-flavored releases doc, no release-please references.
      expect(
        readFileSync(path.join(targetDir, "docs/releases.md"), "utf8")
      ).not.toContain("release-please");
    });
  });

  describe("observability stamping", () => {
    it("stamps chosen collectors to true in .env.example AND .env", () => {
      const targetDir = path.join(workDir, "real-obs");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        observability: ["sentry", "otel"],
      });

      for (const file of [".env.example", ".env"]) {
        const env = readFileSync(path.join(targetDir, file), "utf8");
        expect(env, file).toMatch(/^SENTRY_ENABLED=true$/m);
        expect(env, file).toMatch(/^NEXT_PUBLIC_SENTRY_ENABLED=true$/m);
        expect(env, file).toMatch(/^OTEL_ENABLED=true$/m);
        expect(env, file).toMatch(/^POSTHOG_ENABLED=false$/m);
        expect(env, file).toMatch(/^NEXT_PUBLIC_POSTHOG_ENABLED=false$/m);
      }
    });

    it("leaves every collector false by default", () => {
      const targetDir = path.join(workDir, "real-obs-default");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
      });

      const env = readFileSync(path.join(targetDir, ".env"), "utf8");
      expect(env).toMatch(/^SENTRY_ENABLED=false$/m);
      expect(env).toMatch(/^POSTHOG_ENABLED=false$/m);
      expect(env).toMatch(/^OTEL_ENABLED=false$/m);
    });
  });

  describe("feature-flag stamping", () => {
    it("stamps flags=none (emails off) into both env files", () => {
      const targetDir = path.join(workDir, "real-flags-none");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        featureFlags: [],
      });

      for (const file of [".env.example", ".env"]) {
        const env = readFileSync(path.join(targetDir, file), "utf8");
        expect(env, file).toMatch(/^EMAILS_ENABLED=false$/m);
        expect(env, file).toMatch(/^REQUIRE_EMAIL_VERIFICATION=false$/m);
      }
    });

    it("stamps require-email-verification=true when chosen", () => {
      const targetDir = path.join(workDir, "real-flags-verify");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
        featureFlags: ["require-email-verification", "emails-enabled"],
      });

      const env = readFileSync(path.join(targetDir, ".env"), "utf8");
      expect(env).toMatch(/^REQUIRE_EMAIL_VERIFICATION=true$/m);
      expect(env).toMatch(/^EMAILS_ENABLED=true$/m);
    });

    it("keeps the template defaults when flags are omitted", () => {
      const targetDir = path.join(workDir, "real-flags-default");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "real-app",
      });

      const env = readFileSync(path.join(targetDir, ".env"), "utf8");
      expect(env).toMatch(/^EMAILS_ENABLED=true$/m);
      expect(env).toMatch(/^REQUIRE_EMAIL_VERIFICATION=false$/m);
    });
  });

  describe("backup pruning", () => {
    it("prunes the backup tooling when backup=false", () => {
      const targetDir = path.join(workDir, "real-no-backup");
      scaffold({
        templateDir: REAL_TEMPLATE,
        variantsDir: REAL_VARIANTS,
        targetDir,
        projectName: "no-backup-app",
        backup: false,
      });

      expect(existsSync(path.join(targetDir, "scripts", "backup"))).toBe(false);
      expect(existsSync(path.join(targetDir, "docs", "backup.md"))).toBe(false);
      const compose = readFileSync(
        path.join(targetDir, "docker-compose.yml"),
        "utf8"
      );
      expect(compose).not.toContain("backup-db");
      expect(compose).not.toContain("BEGIN backup");
      const envExample = readFileSync(
        path.join(targetDir, ".env.example"),
        "utf8"
      );
      expect(envExample).not.toContain("BACKUP_DIR");
      expect(readFileSync(path.join(targetDir, ".env"), "utf8")).not.toContain(
        "BACKUP_DIR"
      );
      const pkg = JSON.parse(
        readFileSync(path.join(targetDir, "package.json"), "utf8")
      );
      expect(pkg.scripts["backup:db"]).toBeUndefined();
      expect(pkg.scripts["restore:files"]).toBeUndefined();
      expect(
        readFileSync(path.join(targetDir, "README.md"), "utf8")
      ).not.toContain("backup.md");
      const deployment = readFileSync(
        path.join(targetDir, "docs", "deployment.md"),
        "utf8"
      );
      expect(deployment).not.toContain("backup:db");
      // The generic day-2 advice survives the prune.
      expect(deployment).toContain("**Backups**");
    });

    it("throws when a backup-marked file has lost a marker", () => {
      const templateDir = makeFixtureTemplate();
      writeFileSync(
        path.join(templateDir, "docker-compose.yml"),
        "services:\n  # BEGIN backup\n  backup-db:\n    image: x\n"
      );
      expect(() =>
        scaffold({
          templateDir,
          targetDir: path.join(workDir, "bad-backup-marker"),
          projectName: "acme-erp",
          ai: "none",
          backup: false,
        })
      ).toThrow(/Backup markers not found/);
    });

    it("throws when a backup-line file has nothing to prune", () => {
      const templateDir = makeFixtureTemplate();
      // Marker files must strip cleanly so the line-strip guard is reached.
      writeFileSync(
        path.join(templateDir, ".env.example"),
        "DATABASE_URL=postgres://localhost:5432/app\nBETTER_AUTH_SECRET=\n# BEGIN backup\nBACKUP_DIR=./backups\n# END backup\n"
      );
      writeFileSync(
        path.join(templateDir, "docker-compose.yml"),
        "services:\n  # BEGIN backup\n  backup-db:\n    image: x\n  # END backup\n"
      );
      // README is a branch-marked file too — keep the marker so stampProdBranch
      // (which runs before pruneBackup) doesn't throw first.
      writeFileSync(
        path.join(templateDir, "README.md"),
        "# App\n\nBranch: __PROD_BRANCH__. No backup references here.\n"
      );
      expect(() =>
        scaffold({
          templateDir,
          targetDir: path.join(workDir, "bad-backup-line"),
          projectName: "acme-erp",
          ai: "none",
          backup: false,
        })
      ).toThrow(/No backup references found/);
    });
  });
});
