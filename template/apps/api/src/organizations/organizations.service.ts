import { Injectable } from "@nestjs/common";
import type {
  OrganizationSummary,
  Paginated,
  PaginationQuery,
} from "@repo/contracts";
import { member, organization } from "@repo/db";
import { count, desc, eq, ilike } from "drizzle-orm";
import { DbService } from "../db/db.module";

type ListQuery = PaginationQuery & { search?: string | undefined };

@Injectable()
export class OrganizationsService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.db;
  }

  /** Admin overview across ALL tenants — deliberately not org-scoped. */
  async list(query: ListQuery): Promise<Paginated<OrganizationSummary>> {
    const where = query.search
      ? ilike(organization.name, `%${query.search}%`)
      : undefined;

    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          createdAt: organization.createdAt,
          memberCount: count(member.id),
        })
        .from(organization)
        .leftJoin(member, eq(member.organizationId, organization.id))
        .where(where)
        .groupBy(organization.id)
        .orderBy(desc(organization.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(organization).where(where),
    ]);

    const total = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        memberCount: row.memberCount,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
