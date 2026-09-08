import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Append-only audit trail. Rows outlive their actor and organization
 * (`set null`, not cascade) — deleting a user must not erase their history.
 */
@Entity({ name: "auditLog" })
export class AuditLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("auditLog_organizationId_idx")
  @Column({ type: "text", nullable: true })
  organizationId!: string | null;

  @Index("auditLog_actorId_idx")
  @Column({ type: "text", nullable: true })
  actorId!: string | null;

  /** Dot-scoped verb, e.g. `project.update`. */
  @Column({ type: "text" })
  action!: string;

  @Index("auditLog_entityType_idx")
  @Column({ type: "text" })
  entityType!: string;

  @Column({ type: "text", nullable: true })
  entityId!: string | null;

  /** Minimal input snapshot of the mutation. */
  @Column({ type: "jsonb", nullable: true })
  payload!: Record<string, unknown> | null;

  /** Correlates with the `traceId` field of logs and traces. */
  @Column({ type: "text", nullable: true })
  requestId!: string | null;

  @Index("auditLog_createdAt_idx")
  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
