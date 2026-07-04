import {
  isProjectSortField,
  isProjectStatus,
  projectSortFields,
  projectStatuses,
  sortOrders,
} from "@repo/contracts";
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import {
  type inferParserType,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

/**
 * URL is the source of truth for the projects table: pagination, filters and
 * sorting survive reloads and are shareable. Parsers derive from the contract
 * literals, so an out-of-range value in the URL falls back instead of leaking
 * an unchecked string into the API input.
 */
export const projectsSearchParams = {
  page: parseAsInteger.withDefault(1),
  search: parseAsString.withDefault(""),
  status: parseAsStringLiteral(projectStatuses),
  sortBy: parseAsStringLiteral(projectSortFields).withDefault("createdAt"),
  sortOrder: parseAsStringLiteral(sortOrders).withDefault("desc"),
};

export type ProjectsSearchParams = inferParserType<typeof projectsSearchParams>;

/**
 * TanStack Table ↔ URL bridge. Column ids map to query params
 * (`name` column ⇄ `search`, `status` column ⇄ `status`), so toolbar
 * inputs can drive the table's own filter pipeline while nuqs owns the state.
 */
export function paramsToColumnFilters(
  params: ProjectsSearchParams
): ColumnFiltersState {
  return [
    ...(params.search ? [{ id: "name", value: params.search }] : []),
    ...(params.status ? [{ id: "status", value: params.status }] : []),
  ];
}

export function columnFiltersToParams(
  filters: ColumnFiltersState
): Pick<ProjectsSearchParams, "search" | "status"> {
  const search = filters.find((filter) => filter.id === "name")?.value;
  const status = filters.find((filter) => filter.id === "status")?.value;
  return {
    search: typeof search === "string" ? search : "",
    status: isProjectStatus(status) ? status : null,
  };
}

export function paramsToSorting(params: ProjectsSearchParams): SortingState {
  return [{ id: params.sortBy, desc: params.sortOrder === "desc" }];
}

export function sortingToParams(
  sorting: SortingState
): Pick<ProjectsSearchParams, "sortBy" | "sortOrder"> {
  const primary = sorting[0];
  if (!(primary && isProjectSortField(primary.id))) {
    return { sortBy: "createdAt", sortOrder: "desc" };
  }
  return { sortBy: primary.id, sortOrder: primary.desc ? "desc" : "asc" };
}
