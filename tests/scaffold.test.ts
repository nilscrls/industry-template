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
    ]) {
      expect(existsSync(path.join(targetDir, file)), `missing ${file}`).toBe(
        true
      );
    }

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
    ).toContain("defaultRolePermissions");
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
    expect(permissions).not.toContain("defaultRolePermissions");
    expect(
      readFileSync(
        path.join(targetDir, "packages/db/src/schema/permissions.ts"),
        "utf8"
      )
    ).toContain("projectMember");
    // The RBAC migrations are replaced wholesale by the manifest.
    const migrations = readFileSync(
      path.join(targetDir, "packages/db/drizzle/meta/_journal.json"),
      "utf8"
    );
    expect(migrations).not.toContain("yielding_cloak");
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
    const rulesDir = path.join(targetDir, ".claude", "rules");
    for (const rule of [
      "api.md",
      "web.md",
      "db.md",
      "testing.md",
      "authz.md",
      "ui.md",
    ]) {
      expect(existsSync(path.join(rulesDir, rule)), `missing ${rule}`).toBe(
        true
      );
    }
    // Variant rule selection: rebac authz + default radix ui, no leftovers.
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

  it("composes ui=base + authz=rebac + locale=fr + ai=claude in one scaffold", () => {
    const targetDir = path.join(workDir, "real-combined");
    scaffold({
      templateDir: REAL_TEMPLATE,
      variantsDir: REAL_VARIANTS,
      targetDir,
      projectName: "real-app",
      ui: "base",
      authz: "rebac",
      locale: "fr",
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
    expect(permissions).not.toContain("defaultRolePermissions");
    const journal = readFileSync(
      path.join(targetDir, "packages/db/drizzle/meta/_journal.json"),
      "utf8"
    );
    expect(journal).not.toContain("yielding_cloak");

    // French fallback locale.
    expect(
      readFileSync(path.join(targetDir, "packages/i18n/src/config.ts"), "utf8")
    ).toContain('DEFAULT_LOCALE: Locale = "fr"');

    // AGENTS.md stamped with all three chosen variants, no leftover markers.
    const agents = readFileSync(path.join(targetDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("Base UI");
    expect(agents).toContain("ReBAC");
    expect(agents).toContain("fr (Français)");
    expect(agents).not.toContain("__UI_VARIANT__");

    // Variant rules resolved to the base/rebac pair, no leftovers.
    const rulesDir = path.join(targetDir, ".claude", "rules");
    expect(readFileSync(path.join(rulesDir, "ui.md"), "utf8")).toContain(
      "Base UI primitives"
    );
    expect(readFileSync(path.join(rulesDir, "authz.md"), "utf8")).toContain(
      "ReBAC"
    );
    for (const leftover of [
      "authz.rbac.md",
      "authz.rebac.md",
      "ui.radix.md",
      "ui.base.md",
    ]) {
      expect(existsSync(path.join(rulesDir, leftover))).toBe(false);
    }
  });
});
