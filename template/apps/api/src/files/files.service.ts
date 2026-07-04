import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { asSubject } from "@repo/auth";
import type { FileObject, Paginated, PaginationQuery } from "@repo/contracts";
import { fileObject } from "@repo/db";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { forbidden, notFound } from "../common/app-error";
import { currentAbility, currentUser } from "../common/request-context";
import type { DbService } from "../db/db.module";
import {
  PRESIGN_TTL_SECONDS,
  type StorageService,
} from "../storage/storage.service";

type ListQuery = PaginationQuery & { search?: string | undefined };
type PresignInput = Pick<FileObject, "fileName" | "contentType" | "sizeBytes">;
type FileRow = typeof fileObject.$inferSelect;

@Injectable()
export class FilesService {
  constructor(
    private readonly dbService: DbService,
    private readonly storage: StorageService
  ) {}

  private get db() {
    return this.dbService.db;
  }

  async list(query: ListQuery): Promise<Paginated<FileObject>> {
    const user = currentUser();
    // Probe with a foreign owner: true only for unconditional read rules
    // (admin/manager). Owner-conditioned roles get scoped to their own rows.
    const readsAll = currentAbility().can(
      "read",
      asSubject("File", { ownerId: `__not__${user.id}` })
    );
    const where = and(
      readsAll ? undefined : eq(fileObject.ownerId, user.id),
      query.search ? ilike(fileObject.fileName, `%${query.search}%`) : undefined
    );

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(fileObject)
        .where(where)
        .orderBy(desc(fileObject.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(fileObject).where(where),
    ]);

    const total = totals[0]?.value ?? 0;
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async presignUpload(input: PresignInput) {
    const user = currentUser();
    const id = randomUUID();
    const safeName = input.fileName.replace(/[^\w.\- ]/g, "_");
    const storageKey = `${user.id}/${id}/${safeName}`;

    const [row] = await this.db
      .insert(fileObject)
      .values({
        id,
        fileName: safeName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        storageKey,
        ownerId: user.id,
      })
      .returning();
    if (!row) {
      throw notFound("File");
    }

    const uploadUrl = await this.storage.presignUpload(
      storageKey,
      input.contentType
    );
    return {
      file: this.toDto(row),
      uploadUrl,
      method: "PUT" as const,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    };
  }

  async presignDownload(id: string) {
    const row = await this.findRow(id);
    if (!currentAbility().can("read", asSubject("File", { ...row }))) {
      throw forbidden("read", "File");
    }
    const downloadUrl = await this.storage.presignDownload(
      row.storageKey,
      row.fileName
    );
    return { downloadUrl, expiresInSeconds: PRESIGN_TTL_SECONDS };
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.findRow(id);
    if (!currentAbility().can("delete", asSubject("File", { ...row }))) {
      throw forbidden("delete", "File");
    }
    await this.storage.deleteObject(row.storageKey);
    await this.db.delete(fileObject).where(eq(fileObject.id, id));
    return { id };
  }

  private async findRow(id: string): Promise<FileRow> {
    const [row] = await this.db
      .select()
      .from(fileObject)
      .where(eq(fileObject.id, id));
    if (!row) {
      throw notFound("File");
    }
    return row;
  }

  private toDto(row: FileRow): FileObject {
    return {
      id: row.id,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
