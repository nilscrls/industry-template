import { Injectable } from "@nestjs/common";
import type {
  OrganizationSummary,
  Paginated,
  PaginationQuery,
} from "@repo/contracts";
import { Member, Organization } from "@repo/db";
import type { EntityManager } from "typeorm";
import { DbService } from "../db/db.module";

type ListQuery = PaginationQuery & { search?: string | undefined };

@Injectable()
export class OrganizationsService {
  constructor(private readonly dbService: DbService) {}

  /**
   * Admin overview across ALL tenants — deliberately not org-scoped. The
   * member RLS policy grants cross-tenant reads only when the tenant
   * context marks the session admin (guarded by @RequireAbility upstream).
   */
  async list(query: ListQuery): Promise<Paginated<OrganizationSummary>> {
    const buildCountQuery = (m: EntityManager) => {
      const qb = m.createQueryBuilder(Organization, "o");
      if (query.search) {
        qb.andWhere("o.name ILIKE :search", { search: `%${query.search}%` });
      }
      return qb;
    };

    // Sequential — one QueryRunner/connection serves both queries inside
    // this transaction.
    const [rows, total] = await this.dbService.tenant(async (m) => {
      const qb = m
        .createQueryBuilder(Organization, "o")
        .leftJoin(Member, "member", "member.organizationId = o.id")
        .select("o.id", "id")
        .addSelect("o.name", "name")
        .addSelect("o.slug", "slug")
        .addSelect("o.createdAt", "createdAt")
        .addSelect("count(member.id)", "memberCount")
        .groupBy("o.id")
        .orderBy("o.createdAt", "DESC");
      if (query.search) {
        qb.andWhere("o.name ILIKE :search", { search: `%${query.search}%` });
      }
      const foundRows = await qb
        .offset((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .getRawMany<{
          createdAt: Date;
          id: string;
          memberCount: string;
          name: string;
          slug: string;
        }>();
      const rowCount = await buildCountQuery(m).getCount();
      return [foundRows, rowCount] as const;
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        memberCount: Number(row.memberCount),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
