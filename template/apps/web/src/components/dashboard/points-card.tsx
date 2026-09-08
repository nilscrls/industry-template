"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { spendSchema } from "@repo/contracts";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { client, orpc } from "@/lib/api";
import { useApiErrorMessage, useAppMutation } from "@/lib/use-app-mutation";

type FormValues = z.infer<typeof spendSchema>;

/**
 * Own query + own skeleton/error text, deliberately independent of the
 * stats card above it: a stats failure must never hide the wallet, and a
 * wallet failure must never hide the stats.
 */
export function PointsCard() {
  const t = useTranslations("dashboard.points");
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(orpc.wallet.me.queryOptions());

  const form = useForm<FormValues>({
    resolver: zodResolver(spendSchema),
    defaultValues: { amount: 1, reason: "" },
  });

  const spendMutation = useAppMutation({
    mutationFn: (values: FormValues) => client.wallet.spend(values),
    successMessage: "pointsSpent",
    onSuccess: () => {
      form.reset({ amount: 1, reason: "" });
      queryClient.invalidateQueries({ queryKey: orpc.wallet.me.key() });
    },
  });

  const onSubmit = form.handleSubmit((values) => spendMutation.mutate(values));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isPending && <Skeleton className="h-9 w-24" />}
        {error && (
          <p className="text-destructive text-sm">{errorMessage(error)}</p>
        )}
        {data && (
          <p className="font-semibold text-3xl tabular-nums">
            {t("balance", { balance: data.balance })}
          </p>
        )}
        <Form {...form}>
          <form className="flex flex-wrap items-end gap-4" onSubmit={onSubmit}>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.amount")}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="w-24"
                      min={1}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                      type="number"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>{t("fields.reason")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button disabled={spendMutation.isPending} type="submit">
              {t("spendAction")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
