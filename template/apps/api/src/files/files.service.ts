import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { FileObject, Paginated, PaginationQuery } from "@repo/contracts";
import { fileObject } from "@repo/db";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { forbidden, notFound } from "../common/app-error";
import { activeOrganizationId, currentUser } from "../common/request-context";
import { DbService } from "../db/db.module";
import { FgaService } from "../fga/fga.service";
import {
  PRESIGN_TTL_SECONDS,
  StorageService,
} from "../storage/storage.service";

type ListQuery = PaginationQuery & { search?: string | undefined };
type PresignInput = Pick<FileObject, "fileName" | "contentType" | "sizeBytes">;
type FileRow = typeof fileObject.$inferSelect;

@Injectable()
export class FilesService {
  constructor(
    private readonly dbService: DbService,
    private readonly storage: StorageService,
    private readonly fga: FgaService
  ) {}

  async list(query: ListQuery): Promise<Paginated<FileObject>> {
    const user = currentUser();
    const orgId = activeOrganizationId();
    if (!orgId) {
      return {
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: 0,
      };
    }
    // Managers/admins list every file in the org; members only their own
    // (see can_read_all_files in packages/fga/model.fga).
    const readsAll = await this.fga.check(
      this.fga.me(),
      "can_read_all_files",
      this.fga.ref.org(orgId)
    );
    const where = and(
      eq(fileObject.organizationId, orgId),
      readsAll ? undefined : eq(fileObject.ownerId, user.id),
      query.search ? ilike(fileObject.fileName, `%${query.search}%`) : undefined
    );

    const [rows, totals] = await this.dbService.tenant((db) =>
      Promise.all([
        db
          .select()
          .from(fileObject)
          .where(where)
          .orderBy(desc(fileObject.createdAt))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ value: count() }).from(fileObject).where(where),
      ])
    );

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
    const orgId = activeOrganizationId();
    if (!orgId) {
      // Uploading requires a tenant to upload into.
      throw forbidden("create", "File");
    }
    const id = randomUUID();
    const safeName = input.fileName.replace(/[^\w.\- ]/g, "_");
    const storageKey = `${orgId}/${user.id}/${id}/${safeName}`;

    const row = await this.dbService.tenant(async (db) => {
      const [created] = await db
        .insert(fileObject)
        .values({
          id,
          fileName: safeName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          storageKey,
          organizationId: orgId,
          ownerId: user.id,
        })
        .returning();
      if (!created) {
        throw notFound("File");
      }
      return created;
    });

    // Tuples AFTER the DB commit (Postgres is the source of truth). A
    // failure here surfaces as a 500 — rerun `pnpm fga:sync` to reconcile.
    await this.fga.writeTuples([
      {
        user: this.fga.ref.org(orgId),
        relation: "org",
        object: this.fga.ref.file(row.id),
      },
      {
        user: this.fga.ref.user(user.id),
        relation: "owner",
        object: this.fga.ref.file(row.id),
      },
    ]);

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
    const canRead = await this.fga.check(
      this.fga.me(),
      "can_read",
      this.fga.ref.file(row.id)
    );
    if (!canRead) {
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
    const canDelete = await this.fga.check(
      this.fga.me(),
      "can_delete",
      this.fga.ref.file(row.id)
    );
    if (!canDelete) {
      throw forbidden("delete", "File");
    }
    await this.storage.deleteObject(row.storageKey);
    await this.dbService.tenant((db) =>
      db.delete(fileObject).where(eq(fileObject.id, id))
    );
    await this.fga.deleteObjectTuples(this.fga.ref.file(id));
    return { id };
  }

  /** Rows outside the active organization do not exist for this request. */
  private async findRow(id: string): Promise<FileRow> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      throw notFound("File");
    }
    const [row] = await this.dbService.tenant((db) =>
      db
        .select()
        .from(fileObject)
        .where(and(eq(fileObject.id, id), eq(fileObject.organizationId, orgId)))
    );
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
      organizationId: row.organizationId,
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
