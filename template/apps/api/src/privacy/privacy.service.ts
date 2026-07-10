import { Injectable } from "@nestjs/common";
import type { MeExport } from "@repo/contracts";
import { auditLog, fileObject, member, organization, project, user } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import { notFound } from "../common/app-error";
import { currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";

/**
 * GDPR self-service: data export (portability). Account deletion goes
 * through Better-Auth's deleteUser flow (see auth.module.ts hooks).
 * Everything here is scoped to the AUTHENTICATED user — no id parameter,
 * so there is nothing to tamper with.
 */
@Injectable()
export class PrivacyService {
  constructor(private readonly dbService: DbService) {}

  private get db() {
    return this.dbService.db;
  }

  async exportMyData(): Promise<MeExport> {
    const me = currentUser();
    const [row] = await this.db.select().from(user).where(eq(user.id, me.id));
    if (!row) {
      throw notFound("User");
    }

    const [memberships, projects, files, auditEntries] = await Promise.all([
      this.db
        .select({
          organizationId: member.organizationId,
          organizationName: organization.name,
          role: member.role,
          createdAt: member.createdAt,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(eq(member.userId, me.id)),
      this.db.select().from(project).where(eq(project.ownerId, me.id)),
      this.db.select().from(fileObject).where(eq(fileObject.ownerId, me.id)),
      // The user's own activity across all organizations — it is their data.
      this.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.actorId, me.id))
        .orderBy(desc(auditLog.createdAt)),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.emailVerified,
        role: row.role ?? "member",
        createdAt: row.createdAt.toISOString(),
      },
      memberships: memberships.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        organizationId: p.organizationId,
        createdAt: p.createdAt.toISOString(),
      })),
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
        organizationId: f.organizationId,
        createdAt: f.createdAt.toISOString(),
      })),
      auditEntries: auditEntries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        organizationId: entry.organizationId,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }
}
