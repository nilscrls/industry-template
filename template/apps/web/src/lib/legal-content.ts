import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLocale } from "next-intl/server";

/** Allowlist — the doc name is part of a file path, never accept free text. */
export const LEGAL_DOCS = ["mentions", "privacy", "terms"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

/**
 * Server-only: read the markdown for a legal document in the visitor's
 * locale, falling back to English when no translation exists.
 */
export async function readLegalContent(doc: LegalDoc): Promise<string> {
  const locale = await getLocale();
  const contentDir = path.join(process.cwd(), "content", "legal");
  try {
    return await readFile(path.join(contentDir, `${doc}.${locale}.md`), "utf8");
  } catch {
    return await readFile(path.join(contentDir, `${doc}.en.md`), "utf8");
  }
}
