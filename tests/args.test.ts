import { afterEach, describe, expect, it, vi } from "vitest";
import { enumFlag, parseArgs } from "../src/args.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enumFlag", () => {
  it("returns undefined when the flag is absent", () => {
    expect(enumFlag([], "ui", ["radix", "base"])).toBeUndefined();
  });

  it("returns the value when it is one of the allowed choices", () => {
    expect(enumFlag(["--ui=base"], "ui", ["radix", "base"])).toBe("base");
  });

  it("reads the flag from anywhere in argv", () => {
    expect(
      enumFlag(["my-app", "--yes", "--authz=rebac"], "authz", ["rbac", "rebac"])
    ).toBe("rebac");
  });

  it("prints the accepted values and exits on an invalid choice", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    enumFlag(["--ui=material"], "ui", ["radix", "base"]);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --ui=material")
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining("radix, base"));
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("parseArgs", () => {
  it("defaults to git + install on, no variants, empty flags", () => {
    expect(parseArgs([])).toEqual({
      directory: undefined,
      yes: false,
      git: true,
      install: true,
      ui: undefined,
      authz: undefined,
      locale: undefined,
      ai: undefined,
      branch: undefined,
    });
  });

  it("takes the first non-flag token as the directory", () => {
    expect(parseArgs(["my-app", "--yes"]).directory).toBe("my-app");
  });

  it("ignores flags when picking the positional directory", () => {
    expect(parseArgs(["--no-git", "acme"]).directory).toBe("acme");
  });

  it("accepts both --yes and -y", () => {
    expect(parseArgs(["-y"]).yes).toBe(true);
    expect(parseArgs(["--yes"]).yes).toBe(true);
  });

  it("turns setup steps off with --no-git and --no-install", () => {
    const flags = parseArgs(["--no-git", "--no-install"]);
    expect(flags.git).toBe(false);
    expect(flags.install).toBe(false);
  });

  it("parses every variant flag", () => {
    const flags = parseArgs([
      "app",
      "--ui=base",
      "--authz=rebac",
      "--locale=fr",
      "--ai=none",
      "--branch=master",
    ]);
    expect(flags).toMatchObject({
      directory: "app",
      ui: "base",
      authz: "rebac",
      locale: "fr",
      ai: "none",
      branch: "master",
    });
  });

  it("rejects an invalid --branch value", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    parseArgs(["--branch=trunk"]);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --branch=trunk")
    );
    expect(error).toHaveBeenCalledWith(expect.stringContaining("main, master"));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
