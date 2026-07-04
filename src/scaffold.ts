import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ScaffoldOptions = {
  templateDir: string;
  targetDir: string;
  projectName: string;
};

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

export function validateProjectName(name: string): string | undefined {
  if (name.length === 0) {
    return "Project name is required";
  }
  if (name.length > 214) {
    return "Project name must be at most 214 characters";
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return "Use lowercase letters, digits, '.', '_' and '-' (must start with a letter or digit)";
  }
  return undefined;
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

/** npm strips `.gitignore` from published packages, so the template stores `_gitignore`. */
function restoreDotfiles(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name === "_gitignore") {
      const parent = entry.parentPath;
      renameSync(path.join(parent, "_gitignore"), path.join(parent, ".gitignore"));
    }
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
    const key = SECRET_KEYS.find((candidate) => line.startsWith(`${candidate}=`));
    if (key) {
      return `${key}=${randomBytes(32).toString("hex")}`;
    }
    return line;
  });
  writeFileSync(path.join(targetDir, ".env"), resolved.join("\n"));
}

export function scaffold(options: ScaffoldOptions): void {
  const { templateDir, targetDir, projectName } = options;
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
  restoreDotfiles(targetDir);
  setProjectName(targetDir, projectName);
  writeDotEnv(targetDir);
}
