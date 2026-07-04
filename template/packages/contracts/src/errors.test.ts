import { describe, expect, it } from "vitest";
import { errorData, isApiErrorData } from "./errors.js";

describe("errorData", () => {
  it("builds a validated payload with typed params", () => {
    const data = errorData("RESOURCE_NOT_FOUND", { resource: "Project" }, "trace-1");
    expect(data).toEqual({
      code: "RESOURCE_NOT_FOUND",
      params: { resource: "Project" },
      traceId: "trace-1",
    });
  });

  it("rejects params that do not match the code's schema", () => {
    expect(() =>
      // @ts-expect-error — wrong params shape for FILE_TOO_LARGE
      errorData("FILE_TOO_LARGE", { resource: "File" })
    ).toThrow();
  });
});

describe("isApiErrorData", () => {
  it("accepts a serialized error", () => {
    expect(isApiErrorData({ code: "INTERNAL", params: {} })).toBe(true);
  });

  it("rejects unknown codes", () => {
    expect(isApiErrorData({ code: "NOPE", params: {} })).toBe(false);
  });
});
