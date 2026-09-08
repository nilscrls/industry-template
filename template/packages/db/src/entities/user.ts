import { Column, Entity, PrimaryColumn, Unique } from "typeorm";

/**
 * Better-Auth core table (+ admin plugin fields). This is a READ MODEL —
 * Better-Auth owns writes via its own `pg.Pool` adapter (`createAuth`), never
 * TypeORM repositories. Regenerate the shape with `pnpm auth:schema` after
 * enabling new Better-Auth plugins, then diff against this file.
 */
@Entity({ name: "user" })
@Unique("user_email_key", ["email"])
export class User {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text" })
  email!: string;

  @Column({ type: "boolean", default: false })
  emailVerified!: boolean;

  @Column({ type: "text", nullable: true })
  image!: string | null;

  @Column({ type: "text", default: "user" })
  role!: string;

  /** twoFactor plugin: opt-in per user. */
  @Column({ type: "boolean", default: false })
  twoFactorEnabled!: boolean;

  @Column({ type: "boolean", default: false })
  banned!: boolean;

  @Column({ type: "text", nullable: true })
  banReason!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  banExpires!: Date | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
