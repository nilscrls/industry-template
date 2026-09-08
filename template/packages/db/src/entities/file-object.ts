import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

// pg's node-postgres driver returns bigint as a string (JS numbers lose
// precision above 2^53); the app only ever stores byte sizes well under
// that ceiling, so round-trip through Number for ergonomics at the cost of
// (never-reached) precision beyond Number.MAX_SAFE_INTEGER.
const bigintTransformer = {
  to: (value: number): number => value,
  from: (value: string): number => Number(value),
};

@Entity({ name: "fileObject" })
@Unique("fileObject_storageKey_key", ["storageKey"])
export class FileObject {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  fileName!: string;

  @Column({ type: "varchar", length: 255 })
  contentType!: string;

  @Column({ type: "bigint", transformer: bigintTransformer })
  sizeBytes!: number;

  /** Object key in the S3 bucket — never exposed to clients directly. */
  @Column({ type: "text" })
  storageKey!: string;

  @Index("fileObject_organizationId_idx")
  @Column({ type: "text" })
  organizationId!: string;

  @Index("fileObject_ownerId_idx")
  @Column({ type: "text" })
  ownerId!: string;

  @Column({ type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}
