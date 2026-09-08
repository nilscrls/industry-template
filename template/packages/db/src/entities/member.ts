import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Better-Auth organization plugin table — a user's membership in a tenant.
 * A read model; Better-Auth owns writes. `role` here is the org-plugin
 * membership role ('owner'/'member') — unrelated to and NOT renamed
 * alongside the app-level admin/manager/user role on `user.role`.
 *
 * RLS: the user's own memberships stay readable pre-tenant (org switcher,
 * GDPR export); admins read across tenants (member counts). Better-Auth
 * itself uses the BYPASSRLS app_auth pool.
 */
@Entity({ name: "member" })
export class Member {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Index("member_organizationId_idx")
  @Column({ type: "text" })
  organizationId!: string;

  @Index("member_userId_idx")
  @Column({ type: "text" })
  userId!: string;

  @Column({ type: "text", default: "member" })
  role!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
