import type { SessionData } from "@repo/auth";
import { describe, expect, it, vi } from "vitest";
import { requestContext } from "../common/request-context";
import type { DbService } from "../db/db.module";
import { WalletService } from "./wallet.service";

function contextFor(organizationId: string | null) {
  return {
    requestId: "req-1",
    user: { id: "user-1" } as SessionData["user"],
    session: {
      session: { activeOrganizationId: organizationId },
      user: { id: "user-1" },
    } as unknown as SessionData,
  };
}

/** A `createQueryBuilder(Wallet, "w")...getOne()` chain returning `wallet`. */
function lockedWalletBuilder(wallet: { balance: number; id: string } | null) {
  return {
    setLock: () => ({
      where: () => ({
        getOne: () => Promise.resolve(wallet),
      }),
    }),
  };
}

describe("WalletService.spend", () => {
  it("throws WALLET_INSUFFICIENT_BALANCE {balance:0} with no active organization", async () => {
    const dbService = {
      dataSource: {},
      tenant: vi.fn(),
    } as unknown as DbService;
    const service = new WalletService(dbService);

    await requestContext.run(contextFor(null), async () => {
      await expect(
        service.spend({ amount: 10, reason: "test" })
      ).rejects.toMatchObject({
        data: {
          code: "WALLET_INSUFFICIENT_BALANCE",
          params: { balance: 0, requested: 10 },
        },
      });
    });
    // The no-active-org branch never opens a transaction.
    expect(dbService.tenant).not.toHaveBeenCalled();
  });

  it("throws WALLET_INSUFFICIENT_BALANCE when the locked wallet's balance is too low", async () => {
    const wallet = { id: "wallet-1", balance: 5 };
    const fakeManager = {
      createQueryBuilder: (..._args: unknown[]) => lockedWalletBuilder(wallet),
    };
    const dbService = {
      dataSource: {},
      tenant: (fn: (m: typeof fakeManager) => unknown) => fn(fakeManager),
    } as unknown as DbService;
    const service = new WalletService(dbService);

    await requestContext.run(contextFor("org-1"), async () => {
      await expect(
        service.spend({ amount: 10, reason: "test" })
      ).rejects.toMatchObject({
        data: {
          code: "WALLET_INSUFFICIENT_BALANCE",
          params: { balance: 5, requested: 10 },
        },
      });
    });
  });

  it("throws WALLET_INSUFFICIENT_BALANCE {balance:0} when the user has no wallet yet", async () => {
    const fakeManager = {
      createQueryBuilder: (..._args: unknown[]) => lockedWalletBuilder(null),
    };
    const dbService = {
      dataSource: {},
      tenant: (fn: (m: typeof fakeManager) => unknown) => fn(fakeManager),
    } as unknown as DbService;
    const service = new WalletService(dbService);

    await requestContext.run(contextFor("org-1"), async () => {
      await expect(
        service.spend({ amount: 10, reason: "test" })
      ).rejects.toMatchObject({
        data: {
          code: "WALLET_INSUFFICIENT_BALANCE",
          params: { balance: 0, requested: 10 },
        },
      });
    });
  });
});

describe("WalletService.me", () => {
  it("returns a zero balance and no entries with no active organization", async () => {
    const dbService = {
      dataSource: {},
      tenant: vi.fn(),
    } as unknown as DbService;
    const service = new WalletService(dbService);

    const result = await requestContext.run(contextFor(null), () =>
      service.me()
    );

    expect(result).toEqual({ balance: 0, entries: [] });
    expect(dbService.tenant).not.toHaveBeenCalled();
  });
});
