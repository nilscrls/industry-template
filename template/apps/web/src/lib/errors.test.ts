import { describe, expect, it } from "vitest";
import { extractApiError } from "./errors";

describe("extractApiError", () => {
  it("passes through contract-shaped error data", () => {
    const error = {
      data: {
        code: "RESOURCE_NOT_FOUND",
        params: { resource: "Project" },
        traceId: "t-1",
      },
    };
    expect(extractApiError(error)).toEqual(error.data);
  });

  it("degrades unknown failures to INTERNAL", () => {
    expect(extractApiError(new TypeError("fetch failed"))).toEqual({
      code: "INTERNAL",
      params: {},
    });
    expect(extractApiError({ data: { code: "NOT_IN_CATALOG" } })).toEqual({
      code: "INTERNAL",
      params: {},
    });
  });
});
