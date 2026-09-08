import { Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

/**
 * Better-Auth core table — a READ MODEL, empty at runtime whenever
 * secondaryStorage (Redis) is configured, which the api always does. Do not
 * query this from feature code; it exists so `pnpm auth:schema` has
 * something to diff against and so ad-hoc ops queries can still work.
 */
@Entity({ name: "session" })
@Unique("session_token_key", ["token"])
export class Session {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "text" })
  token!: string;

  @Column({ type: "text", nullable: true })
  ipAddress!: string | null;

  @Column({ type: "text", nullable: true })
  userAgent!: string | null;

  @Index("session_userId_idx")
  @Column({ type: "text" })
  userId!: string;

  @Column({ type: "text", nullable: true })
  impersonatedBy!: string | null;

  /** Organization plugin: the tenant this session currently acts within. */
  @Column({ type: "text", nullable: true })
  activeOrganizationId!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
