import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/** Better-Auth core table — a read model; Better-Auth owns writes. */
@Entity({ name: "account" })
export class Account {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  accountId!: string;

  @Column({ type: "text" })
  providerId!: string;

  @Index("account_userId_idx")
  @Column({ type: "text" })
  userId!: string;

  @Column({ type: "text", nullable: true })
  accessToken!: string | null;

  @Column({ type: "text", nullable: true })
  refreshToken!: string | null;

  @Column({ type: "text", nullable: true })
  idToken!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  accessTokenExpiresAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  refreshTokenExpiresAt!: Date | null;

  @Column({ type: "text", nullable: true })
  scope!: string | null;

  @Column({ type: "text", nullable: true })
  password!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
