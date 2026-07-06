import { describe, expect, it } from "vitest";
import {
  columnFiltersToParams,
  type ProjectsSearchParams,
  paramsToColumnFilters,
  paramsToSorting,
  sortingToParams,
} from "./search-params";

const base: ProjectsSearchParams = {
  page: 1,
  search: "",
  status: null,
  sortBy: "createdAt",
  sortOrder: "desc",
};

describe("paramsToColumnFilters", () => {
  it("omits empty filters", () => {
    expect(paramsToColumnFilters(base)).toEqual([]);
  });

  it("maps search to the name column and status to the status column", () => {
    expect(
      paramsToColumnFilters({ ...base, search: "acme", status: "active" })
    ).toEqual([
      { id: "name", value: "acme" },
      { id: "status", value: "active" },
    ]);
  });
});

describe("columnFiltersToParams", () => {
  it("reads search and status back out of column filters", () => {
    expect(
      columnFiltersToParams([
        { id: "name", value: "acme" },
        { id: "status", value: "archived" },
      ])
    ).toEqual({ search: "acme", status: "archived" });
  });

  it("falls back to empty/null for missing or invalid values", () => {
    expect(
      columnFiltersToParams([{ id: "status", value: "not-a-status" }])
    ).toEqual({ search: "", status: null });
  });

  it("round-trips with paramsToColumnFilters", () => {
    const params = { ...base, search: "widget", status: "draft" as const };
    expect(columnFiltersToParams(paramsToColumnFilters(params))).toEqual({
      search: "widget",
      status: "draft",
    });
  });
});

describe("sorting bridge", () => {
  it("derives a single sorting descriptor from the params", () => {
    expect(
      paramsToSorting({ ...base, sortBy: "name", sortOrder: "asc" })
    ).toEqual([{ id: "name", desc: false }]);
  });

  it("maps a valid sorting state back to params", () => {
    expect(sortingToParams([{ id: "name", desc: true }])).toEqual({
      sortBy: "name",
      sortOrder: "desc",
    });
  });

  it("falls back to the default sort for an unknown column", () => {
    expect(sortingToParams([{ id: "bogus", desc: false }])).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("falls back to the default sort when nothing is sorted", () => {
    expect(sortingToParams([])).toEqual({
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });
});
