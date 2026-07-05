"use client";

import { asSubject } from "@repo/auth/ability";
import { type Paginated, type Project, projectStatuses } from "@repo/contracts";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { type ReactNode, useMemo, useState } from "react";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { useAbility } from "@/lib/ability";
import { client, orpc } from "@/lib/api";
import { useApiErrorMessage, useAppMutation } from "@/lib/use-app-mutation";
import {
  columnFiltersToParams,
  paramsToColumnFilters,
  paramsToSorting,
  projectsSearchParams,
  sortingToParams,
} from "./search-params";

const PAGE_SIZE = 10;

const STATUS_VARIANT = {
  draft: "outline",
  active: "default",
  archived: "secondary",
} as const;

const SORT_ICONS = {
  asc: ArrowUpIcon,
  desc: ArrowDownIcon,
  none: ArrowUpDownIcon,
} as const;

/** Sortable header: cycles asc → desc through the table's sorting pipeline. */
function SortableHeader<TData>({
  column,
  children,
}: {
  column: Column<TData, unknown>;
  children: ReactNode;
}) {
  const sorted = column.getIsSorted();
  const Icon = SORT_ICONS[sorted || "none"];
  return (
    <Button
      className="-ml-3"
      onClick={() => column.toggleSorting(sorted !== "desc")}
      size="sm"
      variant="ghost"
    >
      {children}
      <Icon className="text-muted-foreground" />
    </Button>
  );
}

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tStatus = useTranslations("projects.status");
  const format = useFormatter();
  const ability = useAbility();
  const errorMessage = useApiErrorMessage();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  // Everything the list depends on lives in the URL (typed by the parsers).
  const [params, setParams] = useQueryStates(projectsSearchParams);
  const columnFilters = paramsToColumnFilters(params);
  const sorting = paramsToSorting(params);

  // The table reports state transitions; nuqs persists them. Filter and sort
  // changes jump back to page 1 so the result set stays coherent.
  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next =
      typeof updater === "function" ? updater(columnFilters) : updater;
    setParams({ ...columnFiltersToParams(next), page: 1 });
  };
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    setParams({ ...sortingToParams(next), page: 1 });
  };

  const input = {
    page: params.page,
    pageSize: PAGE_SIZE,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    ...(params.search ? { search: params.search } : {}),
    ...(params.status ? { status: params.status } : {}),
  };
  const { data, isPending, error } = useQuery(
    orpc.projects.list.queryOptions({
      input,
      placeholderData: keepPreviousData,
    })
  );

  // Deletes rarely fail once the button is visible → optimistic removal.
  const removeMutation = useAppMutation({
    mutationFn: (id: string) => client.projects.remove({ id }),
    successMessage: "projectDeleted",
    optimistic: {
      queryKey: orpc.projects.list.key(),
      update: (previous, id) => {
        const cached = previous as Paginated<Project> | undefined;
        if (!cached) {
          return previous;
        }
        return {
          ...cached,
          items: cached.items.filter((item) => item.id !== id),
          total: cached.total - 1,
        };
      },
    },
  });

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        accessorKey: "name",
        enableColumnFilter: true,
        enableSorting: true,
        header: ({ column }) => (
          <SortableHeader column={column}>{t("fields.name")}</SortableHeader>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.description ? (
              <p className="max-w-64 truncate text-muted-foreground text-xs sm:max-w-96">
                {row.original.description}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "status",
        enableColumnFilter: true,
        enableSorting: false,
        header: t("fields.status"),
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {tStatus(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        enableSorting: true,
        header: ({ column }) => (
          <SortableHeader column={column}>
            {t("fields.createdAt")}
          </SortableHeader>
        ),
        cell: ({ row }) =>
          format.dateTime(new Date(row.original.createdAt), {
            dateStyle: "medium",
          }),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const subject = asSubject("Project", { ...row.original });
          const canUpdate = ability?.can("update", subject) ?? false;
          const canDelete = ability?.can("delete", subject) ?? false;
          if (!(canUpdate || canDelete)) {
            return null;
          }
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={t("rowActions")}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canUpdate ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(row.original);
                      setDialogOpen(true);
                    }}
                  >
                    {t("editAction")}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    onClick={() => removeMutation.mutate(row.original.id)}
                    variant="destructive"
                  >
                    {t("deleteAction")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [ability, format, removeMutation, t, tStatus]
  );

  // Server-driven table: filtering/sorting/pagination all happen in the API,
  // the table only mirrors the URL state and reports transitions.
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    enableSortingRemoval: false,
    pageCount: data?.totalPages ?? -1,
    state: { columnFilters, sorting },
    onColumnFiltersChange,
    onSortingChange,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input
            className="w-40 sm:w-64"
            onChange={(event) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            placeholder={t("searchPlaceholder")}
            value={params.search}
          />
          <Select
            onValueChange={(value) =>
              table
                .getColumn("status")
                ?.setFilterValue(value === "all" ? undefined : value)
            }
            value={params.status ?? "all"}
          >
            <SelectTrigger aria-label={t("statusFilterLabel")} className="w-36">
              <SelectValue placeholder={t("statusFilterLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              {projectStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {tStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ability?.can("create", "Project") ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon />
              <span className="hidden sm:inline">{t("createAction")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm">{errorMessage(error)}</p>
      ) : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isPending
              ? Array.from({ length: 5 }, (_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                  <TableRow key={index}>
                    <TableCell colSpan={columns.length}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            {!isPending && table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t("pageInfo", {
            page: params.page,
            totalPages: Math.max(data?.totalPages ?? 1, 1),
          })}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={params.page <= 1}
            onClick={() => setParams({ page: params.page - 1 })}
            size="sm"
            variant="outline"
          >
            {t("previous")}
          </Button>
          <Button
            disabled={params.page >= (data?.totalPages ?? 1)}
            onClick={() => setParams({ page: params.page + 1 })}
            size="sm"
            variant="outline"
          >
            {t("next")}
          </Button>
        </div>
      </div>

      <ProjectFormDialog
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        project={editing}
      />
    </div>
  );
}
