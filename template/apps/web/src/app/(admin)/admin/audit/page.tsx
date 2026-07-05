"use client";

import { Badge } from "@repo/ui/components/badge";
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

const PAGE_SIZE = 20;

/** URL is the source of truth — same pattern as the projects table. */
const searchParams = {
  page: parseAsInteger.withDefault(1),
  action: parseAsString.withDefault(""),
};

export default function AdminAuditPage() {
  const t = useTranslations("admin.audit");
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const [params, setParams] = useQueryStates(searchParams);

  const { data, isPending, error } = useQuery(
    orpc.audit.list.queryOptions({
      input: {
        page: params.page,
        pageSize: PAGE_SIZE,
        ...(params.action ? { action: params.action } : {}),
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
            setParams({ action: event.target.value, page: 1 })
          }
          placeholder={t("actionFilterPlaceholder")}
          value={params.action}
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm">{errorMessage(error)}</p>
      ) : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.when")}</TableHead>
              <TableHead>{t("fields.actor")}</TableHead>
              <TableHead>{t("fields.action")}</TableHead>
              <TableHead>{t("fields.entity")}</TableHead>
              <TableHead>{t("fields.requestId")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending
              ? Array.from({ length: 5 }, (_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : (data?.items ?? []).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {format.dateTime(new Date(entry.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.actorEmail ?? t("deletedActor")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{entry.entityType}</span>
                      {entry.entityId ? (
                        <span className="ml-1 text-muted-foreground text-xs">
                          {entry.entityId.slice(0, 8)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {entry.requestId?.slice(0, 8) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
            {!isPending && (data?.items ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={5}
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
