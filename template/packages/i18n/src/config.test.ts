import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, resolveLocale, SUPPORTED_LOCALES } from "./config";

describe("resolveLocale", () => {
  it("passes through a supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(resolveLocale(locale)).toBe(locale);
    }
  });

  it("falls back to the default for an unknown locale", () => {
    expect(resolveLocale("de")).toBe(DEFAULT_LOCALE);
  });

  it("falls back to the default for undefined (no cookie/header)", () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });
});
