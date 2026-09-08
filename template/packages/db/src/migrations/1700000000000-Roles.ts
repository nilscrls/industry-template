// biome-ignore-all lint/style/useFilenamingConvention: TypeORM orders migrations by the 13 trailing digits of the CLASS name, so the filename must carry them too (1700000000000-Roles.ts, not kebab-case).
import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * RLS principals + privileges. Runs FIRST (later migrations create policies
 * that reference these roles) as the owner (DATABASE_URL_MIGRATIONS).
 *
 * The roles normally already exist with LOGIN + passwords (created by
 * packages/db/sql/init-roles.sh on first postgres boot). On a database
 * where that script never ran (managed Postgres), they are created NOLOGIN
 * here and the operator enables them:
 *   ALTER ROLE app_user LOGIN PASSWORD '...';
 *   ALTER ROLE app_auth LOGIN PASSWORD '...' BYPASSRLS;
 *
 * NOTE: no FORCE ROW LEVEL SECURITY anywhere — the owner must keep
 * bypassing the policies (migrations and seeds legitimately cross tenants).
 *
 * TypeORM orders migrations by the 13 trailing digits of the CLASS name
 * (filenames don't matter); a class name without 13 trailing digits throws.
 */
export class Roles1700000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE ROLE app_user NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE ROLE app_auth NOLOGIN BYPASSRLS;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      "GRANT USAGE ON SCHEMA public TO app_user, app_auth;"
    );
    // Tables don't exist yet: default privileges make every table/sequence
    // the owner creates from now on (all later migrations) readable/
    // writable by the app roles automatically.
    await queryRunner.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_auth;"
    );
    await queryRunner.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user, app_auth;"
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM app_user, app_auth;"
    );
    await queryRunner.query(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_user, app_auth;"
    );
    await queryRunner.query(
      "REVOKE USAGE ON SCHEMA public FROM app_user, app_auth;"
    );
    await queryRunner.query("DROP ROLE IF EXISTS app_auth;");
    await queryRunner.query("DROP ROLE IF EXISTS app_user;");
  }
}
