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
    ]) {
      expect(existsSync(path.join(targetDir, file)), `missing ${file}`).toBe(
        true
      );
    }
  });
});
