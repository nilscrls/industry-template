import { pgRole } from "drizzle-orm/pg-core";

/**
 * Database principals (declared `existing`: created by the grants migration
 * / compose init script, not by drizzle-kit):
 *
 * - `app_user` — the API's runtime role. Subject to the row-level-security
 *   policies below; a query that forgets its organization filter still
 *   cannot cross a tenant boundary.
 * - `app_auth` — BYPASSRLS role used ONLY by the Better-Auth adapter, which
 *   must read `member` before a tenant context exists (session creation)
 *   and owns the user-scoped auth tables.
 * - the owner (e.g. `postgres`) — migrations and seeds; bypasses RLS as the
 *   table owner would, so seeding across tenants keeps working.
 */
export const appUserRole = pgRole("app_user").existing();
export const appAuthRole = pgRole("app_auth").existing();
