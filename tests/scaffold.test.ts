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
    for (const rule of ["api.md", "web.md", "db.md", "testing.md"]) {
      expect(
        existsSync(path.join(targetDir, ".claude", "rules", rule)),
        `missing .claude/rules/${rule}`
      ).toBe(true);
    }
    // The overlay ships `_claude` (npm-safe); the scaffold must rename it.
    expect(existsSync(path.join(targetDir, "_claude"))).toBe(false);
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
});
