import { Injectable } from "@nestjs/common";
import type { MeExport } from "@repo/contracts";
import {
  AuditLog,
  FileObject,
  Member,
  Organization,
  Project,
  User,
  Wallet,
  WalletEntry,
} from "@repo/db";
import { notFound } from "../common/app-error";
import { activeOrganizationId, currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";

const WALLET_EXPORT_ENTRY_LIMIT = 20;

/**
 * GDPR self-service: data export (portability). Account deletion goes
 * through Better-Auth's deleteUser flow (see auth.module.ts hooks).
 * Everything here is scoped to the AUTHENTICATED user — no id parameter,
 * so there is nothing to tamper with.
 */
@Injectable()
export class PrivacyService {
  constructor(private readonly dbService: DbService) {}

  async exportMyData(): Promise<MeExport> {
    const me = currentUser();
    // The wallet is org-scoped (one row per organizationId+userId); the
    // export reports the ACTIVE organization's wallet — a user with no
    // active organization has no wallet to report (balance 0, no entries).
    const orgId = activeOrganizationId();
    // tenant() also pins app.current_user_id — the RLS "own rows" clauses
    // are what make this export span the user's organizations. Sequential
    // (not Promise.all): one TypeORM QueryRunner executes queries serially
    // over its single connection inside this transaction.
    const { row, memberships, projects, files, auditEntries, wallet } =
      await this.dbService.tenant(async (m) => {
        const foundRow = await m.findOne(User, { where: { id: me.id } });
        const foundMemberships = await m
          .createQueryBuilder(Member, "member")
          .innerJoin(
            Organization,
            "organization",
            "organization.id = member.organizationId"
          )
          .select("member.organizationId", "organizationId")
          .addSelect("organization.name", "organizationName")
          .addSelect("member.role", "role")
          .addSelect("member.createdAt", "createdAt")
          .where("member.userId = :userId", { userId: me.id })
          .getRawMany<{
            createdAt: Date;
            organizationId: string;
            organizationName: string;
            role: string;
          }>();
        const foundProjects = await m.find(Project, {
          where: { ownerId: me.id },
        });
        const foundFiles = await m.find(FileObject, {
          where: { ownerId: me.id },
        });
        // The user's own activity across all organizations — their data.
        const foundAuditEntries = await m.find(AuditLog, {
          where: { actorId: me.id },
          order: { createdAt: "DESC" },
        });
        const foundWallet = orgId
          ? await m.findOne(Wallet, {
              where: { organizationId: orgId, userId: me.id },
            })
          : null;
        const foundEntries = foundWallet
          ? await m.find(WalletEntry, {
              where: { walletId: foundWallet.id },
              order: { createdAt: "DESC" },
              take: WALLET_EXPORT_ENTRY_LIMIT,
            })
          : [];
        return {
          row: foundRow,
          memberships: foundMemberships,
          projects: foundProjects,
          files: foundFiles,
          auditEntries: foundAuditEntries,
          wallet: {
            balance: foundWallet?.balance ?? 0,
            entries: foundEntries,
          },
        };
      });
    if (!row) {
      throw notFound("User");
    }

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.emailVerified,
        role: row.role ?? "user",
        createdAt: row.createdAt.toISOString(),
      },
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organizationName,
        role: m.role,
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
      wallet: {
        balance: wallet.balance,
        entries: wallet.entries.map((entry) => ({
          id: entry.id,
          amount: entry.amount,
          reason: entry.reason,
          actorId: entry.actorId,
          createdAt: entry.createdAt.toISOString(),
        })),
      },
    };
  }
}
