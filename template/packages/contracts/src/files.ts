import * as z from "zod";
import { base } from "./base.js";
import { paginatedSchema, paginationQuerySchema } from "./pagination.js";

export const MAX_UPLOAD_SIZE_MB = 50;

export const fileObjectSchema = z.object({
  id: z.uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  ownerId: z.string(),
  createdAt: z.iso.datetime(),
});

export type FileObject = z.infer<typeof fileObjectSchema>;

export const filesContract = {
  list: base
    .route({ method: "GET", path: "/files", summary: "List files", tags: ["files"] })
    .input(paginationQuerySchema.extend({ search: z.string().max(255).optional() }))
    .output(paginatedSchema(fileObjectSchema)),

  /**
   * The browser uploads straight to object storage with the returned URL —
   * the API stays the authority (authz + metadata) without streaming bytes.
   */
  presignUpload: base
    .route({ method: "POST", path: "/files/presign-upload", summary: "Presign an upload", tags: ["files"] })
    .input(
      z.object({
        fileName: fileObjectSchema.shape.fileName,
        contentType: fileObjectSchema.shape.contentType,
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(MAX_UPLOAD_SIZE_MB * 1024 * 1024),
      })
    )
    .output(
      z.object({
        file: fileObjectSchema,
        uploadUrl: z.url(),
        method: z.literal("PUT"),
        expiresInSeconds: z.number().int().positive(),
      })
    ),

  presignDownload: base
    .route({
      method: "GET",
      path: "/files/{id}/download-url",
      summary: "Presign a download",
      tags: ["files"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ downloadUrl: z.url(), expiresInSeconds: z.number().int().positive() })),

  remove: base
    .route({ method: "DELETE", path: "/files/{id}", summary: "Delete a file", tags: ["files"] })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ id: z.uuid() })),
};
