import { z } from "zod";
import { base } from "./base.js";

/**
 * GDPR data portability (art. 20): everything the app stores about the
 * requesting user, as JSON. Metadata only for files — blobs are downloadable
 * individually through the files endpoints.
 */
export const meExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    role: z.string(),
    createdAt: z.iso.datetime(),
  }),
  memberships: z.array(
    z.object({
      organizationId: z.string(),
      organizationName: z.string(),
      role: z.string(),
      createdAt: z.iso.datetime(),
    })
  ),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      organizationId: z.string(),
      createdAt: z.iso.datetime(),
    })
  ),
  files: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      contentType: z.string(),
      sizeBytes: z.number(),
      organizationId: z.string(),
      createdAt: z.iso.datetime(),
    })
  ),
  auditEntries: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string().nullable(),
      organizationId: z.string().nullable(),
      createdAt: z.iso.datetime(),
    })
  ),
});

export type MeExport = z.infer<typeof meExportSchema>;

export const privacyContract = {
  exportData: base
    .route({
      method: "GET",
      path: "/me/export",
      summary: "Export my personal data (GDPR portability)",
      tags: ["me"],
    })
    .output(meExportSchema),
};
