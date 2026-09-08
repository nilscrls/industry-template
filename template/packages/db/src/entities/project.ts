import { projectStatuses } from "@repo/contracts";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "project" })
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Index("project_status_idx")
  @Column({
    type: "enum",
    enum: projectStatuses,
    enumName: "project_status",
    default: "draft",
  })
  status!: (typeof projectStatuses)[number];

  @Index("project_organizationId_idx")
  @Column({ type: "text" })
  organizationId!: string;

  @Index("project_ownerId_idx")
  @Column({ type: "text" })
  ownerId!: string;

  @Index("project_createdAt_idx")
  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", default: () => "now()" })
  updatedAt!: Date;
}
