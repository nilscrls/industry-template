import type { DeletedUser } from "@repo/auth";
import type { Database } from "@repo/db";
import { auditLog, fileObject, member } from "@repo/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { StorageService } from "../storage/storage.service";

/**
 * GDPR account-deletion hooks wired into Better-Auth (auth.module.ts).
 *
 * beforeDelete blocks while the user is the sole owner of any organization
 * (GitHub model: transfer or delete the organization first) and prefetches
 * the user's blob keys — after the deletion the fileObject rows are gone
 * (FK cascade), so the keys must be captured up front.
 */
export function createUserDeletionHooks(
  db: Database,
  storage: StorageService,
  cleanupAuthorization?: (userId: string) => Promise<void>
) {
  // Keyed by user id: beforeDelete and afterDelete are separate callbacks
  // within one deleteUser call; the map hands the prefetched keys across.
  const pendingBlobKeys = new Map<string, string[]>();

  async function assertNotSoleOwner(userId: string): Promise<void> {
    const owned = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.userId, userId), eq(member.role, "owner")));
    if (owned.length === 0) {
      return;
    }
    const orgIds = owned.map((row) => row.organizationId);
    const otherOwners = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(
        and(
          inArray(member.organizationId, orgIds),
          eq(member.role, "owner"),
          ne(member.userId, userId)
        )
      );
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
      const files = await db
        .select({ storageKey: fileObject.storageKey })
        .from(fileObject)
        .where(eq(fileObject.ownerId, user.id));
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
      await db.insert(auditLog).values({
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
