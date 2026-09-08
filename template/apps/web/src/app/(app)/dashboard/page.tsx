"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ByStatusChart,
  CreatedPerDayChart,
} from "@/components/dashboard/charts";
import { PointsCard } from "@/components/dashboard/points-card";
import { orpc } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/use-app-mutation";

function StatsSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["total", "draft", "active", "archived"].map((key) => (
          <Skeleton className="h-28" key={key} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

/**
 * The stats query's pending/error states only replace the stats section —
 * the points wallet has its own query and must render either way (a stats
 * outage shouldn't take the wallet down with it, and vice versa).
 */
function Stats() {
  const t = useTranslations("dashboard");
  const tStatus = useTranslations("projects.status");
  const errorMessage = useApiErrorMessage();
  const { data, isPending, error } = useQuery(
    orpc.projects.stats.queryOptions()
  );

  if (isPending) {
    return <StatsSkeleton />;
  }
  if (error) {
    return <p className="text-destructive text-sm">{errorMessage(error)}</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>{t("totalProjects")}</CardDescription>
            <CardTitle className="font-semibold text-3xl tabular-nums">
              {data.total}
            </CardTitle>
          </CardHeader>
        </Card>
        {data.byStatus.map((entry) => (
          <Card key={entry.status}>
            <CardHeader>
              <CardDescription>{tStatus(entry.status)}</CardDescription>
              <CardTitle className="font-semibold text-3xl tabular-nums">
                {entry.count}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("createdPerDay")}</CardTitle>
            <CardDescription>{t("createdPerDayDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CreatedPerDayChart data={data.createdPerDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("byStatus")}</CardTitle>
            <CardDescription>{t("byStatusDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ByStatusChart data={data.byStatus} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <div className="grid gap-4">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <PointsCard />
      <Stats />
    </div>
  );
}
