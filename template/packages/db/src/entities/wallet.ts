import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

/**
 * Reference "points wallet" — shows the template's transaction idiom
 * (tenant() = one transaction; row lock + atomic conditional UPDATE + this
 * CHECK as a backstop). See docs/database.md "Transactions".
 */
@Entity({ name: "wallet" })
@Unique("wallet_organizationId_userId_key", ["organizationId", "userId"])
@Check("wallet_balance_nonnegative", '"balance" >= 0')
export class Wallet {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("wallet_organizationId_idx")
  @Column({ type: "text" })
  organizationId!: string;

  @Index("wallet_userId_idx")
  @Column({ type: "text" })
  userId!: string;

  @Column({ type: "integer", default: 0 })
  balance!: number;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
