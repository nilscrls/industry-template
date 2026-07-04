"use client";

import { asSubject } from "@repo/auth/ability";
import type { Paginated, Project } from "@repo/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAbility } from "@/lib/ability";
import { client, orpc } from "@/lib/api";
import { useApiErrorMessage, useAppMutation } from "@/lib/use-app-mutation";

const PAGE_SIZE = 10;

const STATUS_VARIANT = {
  draft: "outline",
  active: "default",
  archived: "secondary",
} as const;

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tStatus = useTranslations("projects.status");
  const format = useFormatter();
  const ability = useAbility();
  const errorMessage = useApiErrorMessage();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const input = {
    page,
    pageSize: PAGE_SIZE,
    sortBy: "createdAt" as const,
    sortOrder: "desc" as const,
    ...(search ? { search } : {}),
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
        header: t("fields.name"),
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
        header: t("fields.status"),
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {tStatus(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("fields.createdAt"),
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
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("rowActions")}
                  size="icon"
                  variant="ghost"
                >
                  <MoreHorizontalIcon />
                </Button>
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

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? -1,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-semibold text-2xl">{t("title")}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input
            className="w-40 sm:w-64"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t("searchPlaceholder")}
            value={search}
          />
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
            page,
            totalPages: Math.max(data?.totalPages ?? 1, 1),
          })}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            size="sm"
            variant="outline"
          >
            {t("previous")}
          </Button>
          <Button
            disabled={page >= (data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
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
