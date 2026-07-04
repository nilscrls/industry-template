import { z } from "zod";
import { base } from "./base.js";
import { paginatedSchema, paginationQuerySchema } from "./pagination.js";
import { projectRelationSchema } from "./permissions.js";

export const projectStatuses = ["draft", "active", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return projectStatuses.includes(value as ProjectStatus);
}

export const projectSortFields = ["name", "createdAt", "updatedAt"] as const;
export type ProjectSortField = (typeof projectSortFields)[number];

export function isProjectSortField(value: unknown): value is ProjectSortField {
  return projectSortFields.includes(value as ProjectSortField);
}

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

export const projectMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.email(),
  relation: projectRelationSchema,
});

export type ProjectMember = z.infer<typeof projectMemberSchema>;

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
  sortBy: z.enum(projectSortFields).default("createdAt"),
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

  listMembers: base
    .route({
      method: "GET",
      path: "/projects/{id}/members",
      summary: "List project members",
      tags: ["projects"],
    })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ members: z.array(projectMemberSchema) })),

  setMember: base
    .route({
      method: "PUT",
      path: "/projects/{id}/members/{userId}",
      summary: "Grant or change a member's relation",
      tags: ["projects"],
    })
    .input(
      z.object({
        id: z.uuid(),
        userId: z.string(),
        relation: projectRelationSchema,
      })
    )
    .output(projectMemberSchema),

  removeMember: base
    .route({
      method: "DELETE",
      path: "/projects/{id}/members/{userId}",
      summary: "Remove a member",
      tags: ["projects"],
    })
    .input(z.object({ id: z.uuid(), userId: z.string() }))
    .output(z.object({ userId: z.string() })),
};
