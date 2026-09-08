import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * ReBAC relationship tuples: who holds which relation to which project.
 * The relation decides the granted actions (see `relationActions` in
 * @repo/contracts). One row per (project, user); changing a relation is an
 * upsert on the composite (projectId, userId) primary key.
 *
 * Deliberately has NO row-level security (see docs/authorization.md):
 * every read is already scoped by an explicit `projectId` whose row was
 * fetched through `project`'s own RLS policy first, so there is no tenant
 * boundary left for this table to enforce on its own.
 */
@Entity({ name: "projectMember" })
export class ProjectMember {
  @PrimaryColumn({ type: "uuid" })
  projectId!: string;

  @Index("projectMember_userId_idx")
  @PrimaryColumn({ type: "text" })
  userId!: string;

  @Column({ type: "text" })
  relation!: "owner" | "editor" | "viewer";

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
