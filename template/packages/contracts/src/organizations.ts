import { z } from "zod";
import { base } from "./base.js";
import { paginatedSchema, paginationQuerySchema } from "./pagination.js";

export const organizationSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  memberCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});

export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

/**
 * Admin surface only. Member-facing organization management (create, switch,
 * invite) goes through Better-Auth's own /auth/organization/* endpoints.
 */
export const organizationsContract = {
  list: base
    .route({
      method: "GET",
      path: "/organizations",
      summary: "List organizations",
      tags: ["organizations"],
    })
    .input(
      paginationQuerySchema.extend({ search: z.string().max(100).optional() })
    )
    .output(paginatedSchema(organizationSummarySchema)),
};
