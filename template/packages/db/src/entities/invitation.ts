import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Better-Auth organization plugin table — a pending invite into a tenant.
 * A read model; Better-Auth owns writes.
 */
@Entity({ name: "invitation" })
export class Invitation {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Index("invitation_organizationId_idx")
  @Column({ type: "text" })
  organizationId!: string;

  @Index("invitation_email_idx")
  @Column({ type: "text" })
  email!: string;

  @Column({ type: "text", nullable: true })
  role!: string | null;

  @Column({ type: "text", default: "pending" })
  status!: string;

  @Column({ type: "timestamptz" })
  expiresAt!: Date;

  @Column({ type: "text" })
  inviterId!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
