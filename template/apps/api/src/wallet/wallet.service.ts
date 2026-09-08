import { Injectable } from "@nestjs/common";
import type {
  creditSchema,
  spendSchema,
  Wallet as WalletDto,
} from "@repo/contracts";
import { Member, Wallet, WalletEntry } from "@repo/db";
import type { EntityManager } from "typeorm";
import type { z } from "zod";
import { insufficientBalance, notFound } from "../common/app-error";
import { activeOrganizationId, currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";

type SpendInput = z.infer<typeof spendSchema>;
type CreditInput = z.infer<typeof creditSchema>;

const RECENT_ENTRIES = 20;

/**
 * Reads the `balance` a RETURNING clause handed back. The column is a plain
 * integer, so the pg driver already gives us a number — anything else means
 * the query changed shape, which is a bug, not a user-facing state. Fail
 * loudly (500) instead of inventing a balance the CHECK constraint forbids.
 */
function returnedBalance(raw: unknown): number {
  const balance = (raw as { balance?: unknown }[])[0]?.balance;
  if (typeof balance !== "number") {
    throw new Error("wallet update returned no balance");
  }
  return balance;
}

/**
 * Reference "points wallet" — shows the template's transaction idiom:
 * tenant() = one transaction, a `pessimistic_write` row lock plus an atomic
 * conditional UPDATE (never a blind `save()`), and the DB CHECK constraint
 * as a backstop. See docs/database.md "Transactions".
 */
@Injectable()
export class WalletService {
  constructor(private readonly dbService: DbService) {}

  /** No active org, or no wallet yet — zero balance, never a 4xx. */
  async me(): Promise<WalletDto> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      return { balance: 0, entries: [] };
    }
    const me = currentUser();
    return await this.dbService.tenant(async (manager) => {
      const wallet = await manager.getRepository(Wallet).findOne({
        where: { organizationId: orgId, userId: me.id },
      });
      if (!wallet) {
        return { balance: 0, entries: [] };
      }
      const entries = await this.recentEntries(manager, wallet.id);
      return { balance: wallet.balance, entries };
    });
  }

  async spend(input: SpendInput): Promise<{ balance: number }> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw insufficientBalance(0, input.amount);
    }
    const me = currentUser();
    return await this.dbService.tenant(async (manager) => {
      // Lock the row first so a concurrent spend on the same wallet queues
      // behind this transaction instead of racing the conditional UPDATE.
      const wallet = await manager
        .createQueryBuilder(Wallet, "w")
        .setLock("pessimistic_write")
        .where("w.organizationId = :orgId AND w.userId = :userId", {
          orgId,
          userId: me.id,
        })
        .getOne();
      if (!wallet || wallet.balance < input.amount) {
        throw insufficientBalance(wallet?.balance ?? 0, input.amount);
      }

      // The row lock already makes this safe, but the `balance >= :amount`
      // predicate + affected-row check is the real guarantee — never trust
      // a bare `save()` to have hit anything.
      const result = await manager
        .createQueryBuilder()
        .update(Wallet)
        .set({ balance: () => "balance - :amount", updatedAt: () => "now()" })
        .setParameter("amount", input.amount)
        .where("id = :id AND balance >= :amount", {
          id: wallet.id,
          amount: input.amount,
        })
        .returning(["balance"])
        .execute();
      if (result.affected !== 1) {
        throw insufficientBalance(wallet.balance, input.amount);
      }

      await manager.insert(WalletEntry, {
        walletId: wallet.id,
        organizationId: orgId,
        userId: me.id,
        amount: -input.amount,
        reason: input.reason,
        actorId: me.id,
      });
      return { balance: returnedBalance(result.raw) };
    });
  }

  async credit(input: CreditInput): Promise<{ balance: number }> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw notFound("User");
    }
    const me = currentUser();
    return await this.dbService.tenant(async (manager) => {
      const member = await manager
        .getRepository(Member)
        .findOne({ where: { organizationId: orgId, userId: input.userId } });
      if (!member) {
        throw notFound("User");
      }

      // Atomic upsert: DO UPDATE (not DO NOTHING) so this always returns a
      // row and takes a lock, even when the wallet already existed.
      const [upserted] = await manager.query(
        'insert into "wallet" ("organizationId", "userId", "balance") ' +
          "values ($1, $2, 0) " +
          'on conflict ("organizationId", "userId") do update set "updatedAt" = now() ' +
          'returning "id", "balance"',
        [orgId, input.userId]
      );
      const walletId = upserted.id as string;

      const result = await manager
        .createQueryBuilder()
        .update(Wallet)
        .set({ balance: () => "balance + :amount", updatedAt: () => "now()" })
        .setParameter("amount", input.amount)
        .where("id = :id", { id: walletId })
        .returning(["balance"])
        .execute();
      if (result.affected !== 1) {
        throw notFound("User");
      }

      await manager.insert(WalletEntry, {
        walletId,
        organizationId: orgId,
        userId: input.userId,
        amount: input.amount,
        reason: input.reason,
        actorId: me.id,
      });
      return { balance: returnedBalance(result.raw) };
    });
  }

  private async recentEntries(manager: EntityManager, walletId: string) {
    const rows = await manager.getRepository(WalletEntry).find({
      where: { walletId },
      order: { createdAt: "DESC" },
      take: RECENT_ENTRIES,
    });
    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      reason: row.reason,
      actorId: row.actorId,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
