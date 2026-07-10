-- RLS principals + privileges. Runs FIRST (later migrations create policies
-- that reference these roles) as the owner (DATABASE_URL_MIGRATIONS).
--
-- The roles normally already exist with LOGIN + passwords (created by
-- packages/db/sql/init-roles.sh on first postgres boot). On a database where
-- that script never ran (managed Postgres), they are created NOLOGIN here
-- and the operator enables them:
--   ALTER ROLE app_user LOGIN PASSWORD '...';
--   ALTER ROLE app_auth LOGIN PASSWORD '...' BYPASSRLS;
--
-- NOTE: no FORCE ROW LEVEL SECURITY anywhere — the owner must keep
-- bypassing the policies (migrations and seeds legitimately cross tenants).
DO $$ BEGIN
  CREATE ROLE app_user NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE ROLE app_auth NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user, app_auth;--> statement-breakpoint
-- Tables don't exist yet: default privileges make every table/sequence the
-- owner creates from now on (all later migrations) readable/writable by
-- the app roles automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_auth;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user, app_auth;
