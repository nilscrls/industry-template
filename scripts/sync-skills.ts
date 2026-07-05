/**
 * Vendors third-party Claude Code skills into the ai-claude overlay
 * (`variants/ai-claude/_claude/skills/`), recording provenance in
 * `vendored.lock.json`. Maintainer tool — not shipped in the npm package.
 *
 * Usage: pnpm sync-skills   (requires the `gh` CLI, authenticated)
 *
 * Only vendor content with an explicit redistribution grant (MIT /
 * Apache-2.0). Keep each skill's license text alongside its files.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

interface VendoredSkill {
  /** Skill directory inside the source repo. */
  dir: string;
  /** Repo-root files to copy into the skill dir, e.g. the repo license. */
  extraFiles?: Record<string, string>;
  /** Redistribution grant — where the license actually lives. */
  license: string;
  /** Target directory name under _claude/skills. */
  name: string;
  ref: string;
  repo: string;
}

const SKILLS: VendoredSkill[] = [
  {
    name: "react-best-practices",
    repo: "vercel-labs/agent-skills",
    ref: "main",
    dir: "skills/react-best-practices",
    license: "MIT — declared in the skill's SKILL.md frontmatter",
  },
  {
    name: "next-dev-loop",
    repo: "vercel/next.js",
    ref: "canary",
    dir: "skills/next-dev-loop",
    extraFiles: { "license.md": "LICENSE.md" },
    license: "MIT — vercel/next.js repository license (copied as LICENSE.md)",
  },
  {
    name: "webapp-testing",
    repo: "anthropics/skills",
    ref: "main",
    dir: "skills/webapp-testing",
    license: "Apache-2.0 — per-folder LICENSE.txt (shipped with the skill)",
  },
];

const SKILLS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "variants",
  "ai-claude",
  "_claude",
  "skills"
);

function ghApi(endpoint: string): unknown {
  const stdout = execFileSync("gh", ["api", endpoint], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

interface ContentsEntry {
  download_url: string | null;
  name: string;
  path: string;
  type: "dir" | "file" | "submodule" | "symlink";
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
}

async function downloadDir(
  repo: string,
  commit: string,
  repoPath: string,
  dest: string
): Promise<void> {
  mkdirSync(dest, { recursive: true });
  const entries = ghApi(
    `repos/${repo}/contents/${repoPath}?ref=${commit}`
  ) as ContentsEntry[];
  for (const entry of entries) {
    // Some upstream repos keep packaged .zip copies next to the sources.
    if (entry.name.endsWith(".zip")) {
      continue;
    }
    if (entry.type === "dir") {
      await downloadDir(repo, commit, entry.path, path.join(dest, entry.name));
    } else if (entry.type === "file" && entry.download_url) {
      await downloadFile(entry.download_url, path.join(dest, entry.name));
    }
  }
}

async function main(): Promise<void> {
  const lock: {
    commit: string;
    license: string;
    name: string;
    ref: string;
    repo: string;
    sourceDir: string;
  }[] = [];

  for (const skill of SKILLS) {
    const { sha } = ghApi(`repos/${skill.repo}/commits/${skill.ref}`) as {
      sha: string;
    };
    const dest = path.join(SKILLS_DIR, skill.name);
    console.log(`Vendoring ${skill.repo}@${sha.slice(0, 7)}:${skill.dir}`);
    rmSync(dest, { recursive: true, force: true });
    await downloadDir(skill.repo, sha, skill.dir, dest);
    for (const [source, target] of Object.entries(skill.extraFiles ?? {})) {
      await downloadFile(
        `https://raw.githubusercontent.com/${skill.repo}/${sha}/${source}`,
        path.join(dest, target)
      );
    }
    lock.push({
      name: skill.name,
      repo: skill.repo,
      ref: skill.ref,
      commit: sha,
      sourceDir: skill.dir,
      license: skill.license,
    });
  }

  writeFileSync(
    path.join(SKILLS_DIR, "vendored.lock.json"),
    `${JSON.stringify({ syncedAt: new Date().toISOString(), skills: lock }, null, 2)}\n`
  );
  console.log(`Done: ${lock.length} skills → ${SKILLS_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
