import { z } from "zod";
import { base } from "./base.js";

/**
 * Reference "points wallet" — shows the template's transaction idiom (a
 * balance that can never go negative under concurrent spends). See
 * docs/database.md "Transactions".
 */
export const walletEntrySchema = z.object({
  id: z.uuid(),
  /** Positive credit / negative spend. */
  amount: z.number().int(),
  reason: z.string().min(1).max(200),
  /** Who performed the mutation; null once that user is deleted. */
  actorId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type WalletEntry = z.infer<typeof walletEntrySchema>;

export const walletSchema = z.object({
  balance: z.number().int(),
  /** Last 20 entries, newest first. */
  entries: z.array(walletEntrySchema),
});
export type Wallet = z.infer<typeof walletSchema>;

export const spendSchema = z.object({
  amount: z.number().int().min(1),
  reason: z.string().min(1).max(200),
});

export const creditSchema = z.object({
  userId: z.string(),
  amount: z.number().int().min(1),
  reason: z.string().min(1).max(200),
});

export const walletContract = {
  /** No active org, or no wallet yet → zero balance, no entries. Never 4xx. */
  me: base
    .route({
      method: "GET",
      path: "/wallet/me",
      summary: "My points wallet",
      tags: ["wallet"],
    })
    .output(walletSchema),

  spend: base
    .route({
      method: "POST",
      path: "/wallet/spend",
      summary: "Spend points from my wallet",
      tags: ["wallet"],
    })
    .input(spendSchema)
    .output(z.object({ balance: z.number().int() })),

  credit: base
    .route({
      method: "POST",
      path: "/wallet/credit",
      summary: "Credit points to a member's wallet",
      tags: ["wallet"],
    })
    .input(creditSchema)
    .output(z.object({ balance: z.number().int() })),
};
