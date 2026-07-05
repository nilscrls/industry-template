"use client";

import type { FeatureFlag } from "@repo/contracts";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { client, orpc } from "@/lib/api";
import { useApiErrorMessage, useAppMutation } from "@/lib/use-app-mutation";

export default function AdminFlagsPage() {
  const t = useTranslations("admin.flags");
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState("");

  const { data, isPending, error } = useQuery(orpc.flags.list.queryOptions());

  const overrideMutation = useAppMutation({
    mutationFn: (input: { key: string; value: boolean | null }) =>
      client.flags.setOverride(input),
    successMessage: "flagOverrideSaved",
    onSuccess: () => {
      setNewKey("");
      queryClient.invalidateQueries({ queryKey: orpc.flags.key() });
    },
  });

  function overrideControls(flag: FeatureFlag) {
    return (
      <div className="flex justify-end gap-1">
        <Button
          disabled={overrideMutation.isPending || flag.override === true}
          onClick={() =>
            overrideMutation.mutate({ key: flag.key, value: true })
          }
          size="sm"
          variant="outline"
        >
          {t("forceOn")}
        </Button>
        <Button
          disabled={overrideMutation.isPending || flag.override === false}
          onClick={() =>
            overrideMutation.mutate({ key: flag.key, value: false })
          }
          size="sm"
          variant="outline"
        >
          {t("forceOff")}
        </Button>
        <Button
          disabled={overrideMutation.isPending || flag.override === null}
          onClick={() =>
            overrideMutation.mutate({ key: flag.key, value: null })
          }
          size="sm"
          variant="ghost"
        >
          {t("clearOverride")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-lg">{t("title")}</h2>
        {/* Overrides can target flags PostHog has not shipped yet. */}
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (newKey.trim()) {
              overrideMutation.mutate({ key: newKey.trim(), value: true });
            }
          }}
        >
          <Input
            className="w-48 sm:w-64"
            onChange={(event) => setNewKey(event.target.value)}
            placeholder={t("newOverridePlaceholder")}
            value={newKey}
          />
          <Button
            disabled={!newKey.trim() || overrideMutation.isPending}
            type="submit"
          >
            {t("addOverride")}
          </Button>
        </form>
      </div>

      <p className="text-muted-foreground text-sm">{t("description")}</p>

      {error ? (
        <p className="text-destructive text-sm">{errorMessage(error)}</p>
      ) : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.key")}</TableHead>
              <TableHead>{t("fields.state")}</TableHead>
              <TableHead>{t("fields.source")}</TableHead>
              <TableHead className="text-right">
                {t("fields.override")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              (data?.items ?? []).map((flag) => (
                <TableRow key={flag.key}>
                  <TableCell className="font-mono text-sm">
                    {flag.key}
                  </TableCell>
                  <TableCell>
                    <Badge variant={flag.enabled ? "default" : "secondary"}>
                      {flag.enabled ? t("on") : t("off")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`sources.${flag.source}`)}
                  </TableCell>
                  <TableCell>{overrideControls(flag)}</TableCell>
                </TableRow>
              ))
            )}
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
    </div>
  );
}
