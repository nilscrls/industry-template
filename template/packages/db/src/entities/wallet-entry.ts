import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * One ledger row per wallet mutation (positive credit / negative spend).
 * Carries its own `organizationId` (mirrors the wallet's) and `userId` (the
 * wallet owner) so its RLS policy needs no join back to `wallet`.
 */
@Entity({ name: "walletEntry" })
export class WalletEntry {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("walletEntry_walletId_idx")
  @Column({ type: "uuid" })
  walletId!: string;

  @Index("walletEntry_organizationId_idx")
  @Column({ type: "text" })
  organizationId!: string;

  /** The wallet owner — not necessarily the actor (see `actorId`). */
  @Column({ type: "text" })
  userId!: string;

  /** Positive credit / negative spend. */
  @Column({ type: "integer" })
  amount!: number;

  @Column({ type: "varchar", length: 200 })
  reason!: string;

  /** Who performed the mutation; null once that user is deleted. */
  @Column({ type: "text", nullable: true })
  actorId!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
