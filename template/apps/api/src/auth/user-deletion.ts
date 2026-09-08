import type { DeletedUser } from "@repo/auth";
import { AuditLog, FileObject, Member } from "@repo/db";
import type { DataSource } from "typeorm";
import type { StorageService } from "../storage/storage.service";

/**
 * GDPR account-deletion hooks wired into Better-Auth (auth.module.ts).
 *
 * beforeDelete blocks while the user is the sole owner of any organization
 * (GitHub model: transfer or delete the organization first) and prefetches
 * the user's blob keys — after the deletion the fileObject rows are gone
 * (FK cascade), so the keys must be captured up front.
 *
 * Runs against the BYPASSRLS authDataSource (never `dbService.tenant()`):
 * these hooks fire outside any request's tenant transaction, and the
 * sole-owner check must see every organization's memberships regardless of
 * which one (if any) is "active".
 */
export function createUserDeletionHooks(
  authDataSource: DataSource,
  storage: StorageService,
  cleanupAuthorization?: (userId: string) => Promise<void>
) {
  // Keyed by user id: beforeDelete and afterDelete are separate callbacks
  // within one deleteUser call; the map hands the prefetched keys across.
  const pendingBlobKeys = new Map<string, string[]>();

  async function assertNotSoleOwner(userId: string): Promise<void> {
    const manager = authDataSource.manager;
    const owned = await manager.find(Member, {
      select: { organizationId: true },
      where: { userId, role: "owner" },
    });
    if (owned.length === 0) {
      return;
    }
    const orgIds = owned.map((row) => row.organizationId);
    const otherOwners = await manager
      .createQueryBuilder(Member, "m")
      .select("m.organizationId", "organizationId")
      .where("m.organizationId IN (:...orgIds)", { orgIds })
      .andWhere("m.role = :role", { role: "owner" })
      .andWhere("m.userId != :userId", { userId })
      .getRawMany<{ organizationId: string }>();
    const covered = new Set(otherOwners.map((row) => row.organizationId));
    if (orgIds.some((id) => !covered.has(id))) {
      throw new Error(
        "You are the only owner of an organization. Transfer ownership or delete the organization first."
      );
    }
  }

  return {
    beforeDelete: async (user: DeletedUser): Promise<void> => {
      await assertNotSoleOwner(user.id);
      const files = await authDataSource.manager.find(FileObject, {
        select: { storageKey: true },
        where: { ownerId: user.id },
      });
      pendingBlobKeys.set(
        user.id,
        files.map((file) => file.storageKey)
      );
    },

    afterDelete: async (user: DeletedUser): Promise<void> => {
      const keys = pendingBlobKeys.get(user.id) ?? [];
      pendingBlobKeys.delete(user.id);
      for (const key of keys) {
        await storage.deleteObject(key);
      }
      // Erasure includes the authorization store (memberships, roles, grants).
      await cleanupAuthorization?.(user.id);
      // Direct insert (not AuditService.audited): the request context is a
      // Better-Auth route, and the actor no longer exists. Store no personal
      // data — the row documents that an erasure happened, nothing else.
      // Note: Wallet.userId is FK CASCADE and WalletEntry.walletId is FK
      // CASCADE / WalletEntry.actorId is FK SET NULL (see packages/db
      // migrations) — the wallet tables need no explicit cleanup here.
      await authDataSource.manager.insert(AuditLog, {
        organizationId: null,
        actorId: null,
        action: "user.delete",
        entityType: "User",
        entityId: null,
        payload: null,
        requestId: null,
      });
    },
  };
}
