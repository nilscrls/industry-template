/**
 * Authorization data lives in OpenFGA (`packages/fga/model.fga` + tuples),
 * not in application tables. This module is intentionally empty in the RBAC
 * variant; the ReBAC variant overlays it with the `project_member`
 * relationship table (the DB source of truth mirrored into FGA).
 */
export {};
