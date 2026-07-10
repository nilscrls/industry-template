import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Markdown } from "@/lib/markdown";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicPages.changelog");
  return { title: t("title") };
}

/**
 * Renders the release-please-maintained changelog. Read at request time
 * (the locale cookie makes the page dynamic anyway); the file ships in the
 * standalone output via outputFileTracingIncludes in next.config.ts.
 */
export default async function ChangelogPage() {
  const source = await readFile(
    path.join(process.cwd(), "content", "changelog.md"),
    "utf8"
  );
  return <Markdown source={source} />;
}
