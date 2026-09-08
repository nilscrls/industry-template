import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Better-Auth twoFactor plugin table — encrypted TOTP secret + hashed
 * backup codes. A read model; Better-Auth owns writes. Table name is
 * Better-Auth's own default (`twoFactor`, camelCase — the plugin registers
 * its schema under that key with no modelName override).
 */
@Entity({ name: "twoFactor" })
export class TwoFactor {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Index("twoFactor_secret_idx")
  @Column({ type: "text" })
  secret!: string;

  @Column({ type: "text" })
  backupCodes!: string;

  @Index("twoFactor_userId_idx")
  @Column({ type: "text" })
  userId!: string;

  @Column({ type: "boolean", default: true })
  verified!: boolean;

  @Column({ type: "integer", default: 0 })
  failedVerificationCount!: number;

  @Column({ type: "timestamptz", nullable: true })
  lockedUntil!: Date | null;
}
