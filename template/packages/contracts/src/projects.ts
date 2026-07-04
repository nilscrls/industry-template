import { z } from "zod";
import { base } from "./base.js";
import { paginatedSchema, paginationQuerySchema } from "./pagination.js";

export const projectStatuses = ["draft", "active", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable(),
  status: z.enum(projectStatuses),
  ownerId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  name: projectSchema.shape.name,
  description: z.string().max(2000).optional(),
  status: z.enum(projectStatuses).default("draft"),
});

export const updateProjectSchema = z.object({
  name: projectSchema.shape.name.optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(projectStatuses).optional(),
});

export const listProjectsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  status: z.enum(projectStatuses).optional(),
  sortBy: z.enum(["name", "createdAt", "updatedAt"]).default("createdAt"),
});

export const projectStatsSchema = z.object({
  total: z.number().int().min(0),
  byStatus: z.array(
    z.object({
      status: z.enum(projectStatuses),
      count: z.number().int().min(0),
    })
  ),
  createdPerDay: z.array(
    z.object({ date: z.iso.date(), count: z.number().int().min(0) })
  ),
});

export const projectsContract = {
  list: base
    .route({
      method: "GET",
      path: "/projects",
      summary: "List projects",
      tags: ["projects"],
    })
    .input(listProjectsQuerySchema)
    .output(paginatedSchema(projectSchema)),

  stats: base
    .route({
      method: "GET",
      path: "/projects/stats",
      summary: "Dashboard statistics",
      tags: ["projects"],
    })
    .output(projectStatsSchema),

  find: base
    .route({
      method: "GET",
      path: "/projects/{id}",
      summary: "Get one project",
      tags: ["projects"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(projectSchema),

  create: base
    .route({
      method: "POST",
      path: "/projects",
      summary: "Create a project",
      tags: ["projects"],
    })
    .input(createProjectSchema)
    .output(projectSchema),

  update: base
    .route({
      method: "PATCH",
      path: "/projects/{id}",
      summary: "Update a project",
      tags: ["projects"],
    })
    .input(updateProjectSchema.extend({ id: z.uuid() }))
    .output(projectSchema),

  remove: base
    .route({
      method: "DELETE",
      path: "/projects/{id}",
      summary: "Delete a project",
      tags: ["projects"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ id: z.uuid() })),
};
