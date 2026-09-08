import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Better-Auth core table — a READ MODEL, empty at runtime whenever
 * secondaryStorage (Redis) is configured, which the api always does. Do not
 * query this from feature code.
 */
@Entity({ name: "verification" })
export class Verification {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Index("verification_identifier_idx")
  @Column({ type: "text" })
  identifier!: string;

  @Column({ type: "text" })
  value!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
