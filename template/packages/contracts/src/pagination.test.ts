import { describe, expect, it } from "vitest";
import { z } from "zod";
import { paginatedSchema, paginationQuerySchema } from "./pagination";

describe("paginationQuerySchema", () => {
  it("applies defaults when the query is empty", () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sortOrder: "desc",
    });
  });

  it("coerces numeric strings from the query string", () => {
    expect(paginationQuerySchema.parse({ page: "3", pageSize: "50" })).toEqual({
      page: 3,
      pageSize: 50,
      sortOrder: "desc",
    });
  });

  it("rejects a non-positive page", () => {
    expect(paginationQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects a page size beyond the 100 ceiling", () => {
    expect(paginationQuerySchema.safeParse({ pageSize: "101" }).success).toBe(
      false
    );
  });

  it("rejects an unknown sort order", () => {
    expect(
      paginationQuerySchema.safeParse({ sortOrder: "sideways" }).success
    ).toBe(false);
  });
});

describe("paginatedSchema", () => {
  const schema = paginatedSchema(z.object({ id: z.string() }));

  it("validates a well-formed page envelope", () => {
    const page = {
      items: [{ id: "a" }, { id: "b" }],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };
    expect(schema.parse(page)).toEqual(page);
  });

  it("rejects items that do not match the item schema", () => {
    const bad = {
      items: [{ id: 42 }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };
    expect(schema.safeParse(bad).success).toBe(false);
  });
});
