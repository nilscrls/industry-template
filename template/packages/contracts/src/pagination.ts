import { z } from "zod";

export const sortOrders = ["asc", "desc"] as const;
export type SortOrder = (typeof sortOrders)[number];

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(sortOrders).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  });
}

export interface Paginated<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
