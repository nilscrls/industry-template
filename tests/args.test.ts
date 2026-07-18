import { afterEach, describe, expect, it, vi } from "vitest";
import { boolFlag, enumFlag, listFlag, parseArgs } from "../src/args.js";
import { FEATURE_FLAGS, OBSERVABILITY_TOOLS } from "../src/scaffold.js";

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
      org: undefined,
      locale: undefined,
      i18n: undefined,
      logging: undefined,
      ci: undefined,
      release: undefined,
      ai: undefined,
      branch: undefined,
      observability: undefined,
      featureFlags: undefined,
      backup: undefined,
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
      "--org=single",
      "--locale=fr",
      "--i18n=url",
      "--logging=winston",
      "--ci=gitlab",
      "--release=commit-and-tag-version",
      "--ai=none",
      "--branch=master",
    ]);
    expect(flags).toMatchObject({
      directory: "app",
      ui: "base",
      authz: "rebac",
      org: "single",
      locale: "fr",
      i18n: "url",
      logging: "winston",
      ci: "gitlab",
      release: "commit-and-tag-version",
      ai: "none",
      branch: "master",
    });
  });

  it("parses list and boolean flags", () => {
    expect(parseArgs(["--flags=none"]).featureFlags).toEqual([]);
    expect(parseArgs(["--observability=sentry,posthog"]).observability).toEqual(
      ["sentry", "posthog"]
    );
    expect(parseArgs(["--no-backup"]).backup).toBe(false);
    expect(parseArgs(["--backup"]).backup).toBe(true);
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

describe("listFlag", () => {
  it("returns undefined when the flag is absent", () => {
    expect(listFlag([], "observability", OBSERVABILITY_TOOLS)).toBeUndefined();
  });

  it("parses a single value", () => {
    expect(
      listFlag(["--observability=sentry"], "observability", OBSERVABILITY_TOOLS)
    ).toEqual(["sentry"]);
  });

  it("parses multiple values in argv order", () => {
    expect(
      listFlag(
        ["--observability=sentry,otel"],
        "observability",
        OBSERVABILITY_TOOLS
      )
    ).toEqual(["sentry", "otel"]);
  });

  it("collapses duplicates", () => {
    expect(
      listFlag(
        ["--observability=sentry,sentry"],
        "observability",
        OBSERVABILITY_TOOLS
      )
    ).toEqual(["sentry"]);
  });

  it("treats a lone `none` as an empty selection", () => {
    expect(
      listFlag(["--observability=none"], "observability", OBSERVABILITY_TOOLS)
    ).toEqual([]);
  });

  it("rejects `none` mixed with values", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    listFlag(
      ["--observability=none,sentry"],
      "observability",
      OBSERVABILITY_TOOLS
    );

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --observability=none,sentry")
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("rejects an unknown value and lists the accepted ones", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    listFlag(["--observability=datadog"], "observability", OBSERVABILITY_TOOLS);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("sentry, posthog, otel")
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("rejects an empty value", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      // swallow
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    listFlag(["--flags="], "flags", FEATURE_FLAGS);

    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("boolFlag", () => {
  it("returns undefined when absent", () => {
    expect(boolFlag([], "backup")).toBeUndefined();
  });

  it("parses --backup and --backup=true as true", () => {
    expect(boolFlag(["--backup"], "backup")).toBe(true);
    expect(boolFlag(["--backup=true"], "backup")).toBe(true);
  });

  it("parses --no-backup and --backup=false as false", () => {
    expect(boolFlag(["--no-backup"], "backup")).toBe(false);
    expect(boolFlag(["--backup=false"], "backup")).toBe(false);
  });

  it("lets --no-backup win over --backup", () => {
    expect(boolFlag(["--backup", "--no-backup"], "backup")).toBe(false);
  });

  it("exits on an invalid value", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    boolFlag(["--backup=maybe"], "backup");

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --backup=maybe")
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
