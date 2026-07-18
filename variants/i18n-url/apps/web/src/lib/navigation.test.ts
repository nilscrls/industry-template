import { describe, expect, it } from "vitest";
import { delocalizePathname, localizeHref } from "./navigation";

describe("localizeHref", () => {
  it.each([
    ["/projects", "/fr/projects"],
    ["/", "/fr"],
    ["/en/projects", "/en/projects"], // idempotent — never double-prefixes
    ["https://example.com/x", "https://example.com/x"],
    ["//evil.example", "//evil.example"],
    ["?page=2", "?page=2"],
  ])("localizeHref(fr, %s) → %s", (href, expected) => {
    expect(localizeHref("fr", href)).toBe(expected);
  });
});

describe("delocalizePathname", () => {
  it.each([
    ["/en/projects", "/projects"],
    ["/en", "/"],
    ["/projects", "/projects"],
    ["/enx/projects", "/enx/projects"],
  ])("%s → %s", (pathname, expected) => {
    expect(delocalizePathname(pathname)).toBe(expected);
  });
});
