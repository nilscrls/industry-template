import { Column, Entity, PrimaryColumn, Unique } from "typeorm";

/**
 * Better-Auth organization plugin table — the tenancy foundation. Every
 * tenant-owned row (projects, files, audit entries) carries an
 * `organizationId` foreign key to this table. A read model; Better-Auth
 * owns writes.
 */
@Entity({ name: "organization" })
@Unique("organization_slug_key", ["slug"])
export class Organization {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text" })
  slug!: string;

  @Column({ type: "text", nullable: true })
  logo!: string | null;

  @Column({ type: "text", nullable: true })
  metadata!: string | null;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  // No default — Better-Auth never sets this column at insert time (kept
  // as today so an unset value stays NULL rather than silently defaulting).
  @Column({ type: "timestamptz", nullable: true })
  updatedAt!: Date | null;
}
