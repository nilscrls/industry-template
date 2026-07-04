"use client";

import type { ProjectStatus, projectStatsSchema } from "@repo/contracts";
import { useFormatter, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { z } from "zod";

type Stats = z.infer<typeof projectStatsSchema>;

/** Fixed status → hue assignment (contract order); never reassigned by rank. */
const STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: "var(--chart-1)",
  active: "var(--chart-2)",
  archived: "var(--chart-3)",
};

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;

interface TooltipPayload {
  name?: string;
  value?: number | string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!(active && payload?.length)) {
    return null;
  }
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{payload[0]?.value}</p>
    </div>
  );
}

export function CreatedPerDayChart({ data }: { data: Stats["createdPerDay"] }) {
  const format = useFormatter();
  const points = data.map((point) => ({
    ...point,
    label: format.dateTime(new Date(`${point.date}T00:00:00Z`), {
      day: "numeric",
      month: "short",
    }),
  }));

  return (
    <ResponsiveContainer height={240} width="100%">
      <AreaChart
        data={points}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          axisLine={false}
          dataKey="label"
          minTickGap={24}
          tick={AXIS_TICK}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickLine={false}
          width={32}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ stroke: "var(--border)" }}
        />
        <Area
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
          dataKey="count"
          dot={false}
          fill="var(--chart-1)"
          fillOpacity={0.15}
          stroke="var(--chart-1)"
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ByStatusChart({ data }: { data: Stats["byStatus"] }) {
  const t = useTranslations("projects.status");
  const bars = data.map((entry) => ({
    ...entry,
    label: t(entry.status),
  }));

  return (
    <ResponsiveContainer height={240} width="100%">
      <BarChart
        barCategoryGap="25%"
        data={bars}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          stroke="var(--border)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          axisLine={false}
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tick={AXIS_TICK}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {bars.map((entry) => (
            <Cell fill={STATUS_COLORS[entry.status]} key={entry.status} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
