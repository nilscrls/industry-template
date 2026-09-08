import { projectStatuses } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type { DbService } from "../db/db.module";
import type { FgaService } from "../fga/fga.service";
import type { CacheService } from "../redis/cache.service";
import { ProjectsService } from "./projects.service";

/**
 * Called with no active organization (no request scope), stats() takes the
 * empty branch — no DB or FGA access — so the dense 30-day series shape can
 * be pinned without Postgres. Keep this branch DB-free in both the rbac and
 * rebac projects.service (this spec must pass against either).
 */
const service = new ProjectsService(
  {
    dataSource: {},
    tenant: (fn: (m: unknown) => unknown) => fn({}),
  } as unknown as DbService,
  {} as unknown as CacheService,
  {} as unknown as FgaService
);

describe("ProjectsService.stats (no active organization)", () => {
  it("returns zeroed totals and a per-status breakdown for every status", async () => {
    const stats = await service.stats();
    expect(stats.total).toBe(0);
    expect(stats.byStatus).toEqual(
      projectStatuses.map((status) => ({ status, count: 0 }))
    );
  });

  it("returns a dense, ascending 30-day series ending today (UTC), all zero", async () => {
    const { createdPerDay } = await service.stats();
    expect(createdPerDay).toHaveLength(30);
    expect(createdPerDay.every((day) => day.count === 0)).toBe(true);

    const dates = createdPerDay.map((day) => day.date);
    // Strictly ascending and gap-free (consecutive calendar days).
    for (let i = 1; i < dates.length; i++) {
      const prev = Date.parse(`${dates[i - 1]}T00:00:00Z`);
      const curr = Date.parse(`${dates[i]}T00:00:00Z`);
      expect(curr - prev).toBe(86_400_000);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    expect(dates.at(-1)).toBe(today.toISOString().slice(0, 10));
  });
});
