import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./config";

const MESSAGES_DIR = path.resolve(import.meta.dirname, "..", "messages");

function loadCatalog(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8")
  );
}

/** Every leaf key as a dotted path, e.g. `feedback.saved`. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, val]) => keyPaths(val, prefix ? `${prefix}.${key}` : key)
  );
}

describe("message catalogs", () => {
  const reference = keyPaths(loadCatalog("en")).sort();

  it("ships a catalog for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(() => loadCatalog(locale)).not.toThrow();
    }
  });

  it.each(
    SUPPORTED_LOCALES.filter((locale) => locale !== "en")
  )("%s has exactly the same keys as the English reference", (locale) => {
    const keys = keyPaths(loadCatalog(locale)).sort();
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));
    expect(missing, `keys missing from ${locale}.json`).toEqual([]);
    expect(extra, `keys in ${locale}.json absent from en.json`).toEqual([]);
  });
});
