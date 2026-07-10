#!/bin/sh
# Runs once on the FIRST postgres boot (docker-entrypoint-initdb.d).
# Creates the RLS principals with their passwords; the grants migration
# (packages/db/drizzle) later grants table privileges — it also creates the
# roles NOLOGIN if this script never ran (e.g. managed Postgres), in which
# case the operator sets LOGIN + passwords manually:
#   ALTER ROLE app_user LOGIN PASSWORD '...';
#   ALTER ROLE app_auth LOGIN PASSWORD '...';  -- + BYPASSRLS
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  DO \$\$ BEGIN
    CREATE ROLE app_user LOGIN PASSWORD '${APP_USER_PASSWORD:-app_user}';
  EXCEPTION WHEN duplicate_object THEN
    ALTER ROLE app_user LOGIN PASSWORD '${APP_USER_PASSWORD:-app_user}';
  END \$\$;

  DO \$\$ BEGIN
    CREATE ROLE app_auth LOGIN PASSWORD '${APP_AUTH_PASSWORD:-app_auth}' BYPASSRLS;
  EXCEPTION WHEN duplicate_object THEN
    ALTER ROLE app_auth LOGIN PASSWORD '${APP_AUTH_PASSWORD:-app_auth}' BYPASSRLS;
  END \$\$;
EOSQL

# Separate database for OpenFGA's own storage (same postgres instance).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
  SELECT 'CREATE DATABASE openfga OWNER "$POSTGRES_USER"'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'openfga')\gexec
EOSQL
