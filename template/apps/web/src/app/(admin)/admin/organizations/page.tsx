"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
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
import { useFormatter, useTranslations } from "next-intl";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { orpc } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/use-app-mutation";

const PAGE_SIZE = 10;

/** URL is the source of truth — same pattern as the projects table. */
const searchParams = {
  page: parseAsInteger.withDefault(1),
  search: parseAsString.withDefault(""),
};

export default function AdminOrganizationsPage() {
  const t = useTranslations("admin.organizations");
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const [params, setParams] = useQueryStates(searchParams);

  const { data, isPending, error } = useQuery(
    orpc.organizations.list.queryOptions({
      input: {
        page: params.page,
        pageSize: PAGE_SIZE,
        ...(params.search ? { search: params.search } : {}),
      },
      placeholderData: keepPreviousData,
    })
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-lg">{t("title")}</h2>
        <Input
          className="ml-auto w-40 sm:w-64"
          onChange={(event) =>
            setParams({ search: event.target.value, page: 1 })
          }
          placeholder={t("searchPlaceholder")}
          value={params.search}
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm">{errorMessage(error)}</p>
      ) : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name")}</TableHead>
              <TableHead>{t("fields.slug")}</TableHead>
              <TableHead>{t("fields.members")}</TableHead>
              <TableHead>{t("fields.createdAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending
              ? Array.from({ length: 5 }, (_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                  <TableRow key={index}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : (data?.items ?? []).map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell className="font-medium">
                      {organization.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {organization.slug}
                    </TableCell>
                    <TableCell>{organization.memberCount}</TableCell>
                    <TableCell>
                      {format.dateTime(new Date(organization.createdAt), {
                        dateStyle: "medium",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
            {!isPending && (data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={4}
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
    </div>
  );
}
