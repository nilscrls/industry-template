import path from "node:path";
import { defaultRolePermissions } from "@repo/contracts";
import { createDb, rolePermission, user } from "@repo/db";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  RedisContainer,
  type StartedRedisContainer,
} from "@testcontainers/redis";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Full-stack integration suite: real Postgres + Redis (Testcontainers), the
 * exact production middleware stack (createApp), HTTP in via supertest.
 */
let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let app: Awaited<ReturnType<typeof import("../src/app.setup.js")["createApp"]>>;
let server: Parameters<typeof request>[0];

// vitest runs with cwd = apps/api
const MIGRATIONS = path.resolve(process.cwd(), "../../packages/db/drizzle");

beforeAll(async () => {
  [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:17-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  // env.ts reads process.env at import time — set everything first.
  // The schema has no defaults, so every server var must be present here.
  process.env.NODE_ENV = "test";
  process.env.API_PORT = "3001";
  process.env.DATABASE_URL = postgres.getConnectionUri();
  process.env.REDIS_URL = redis.getConnectionUrl();
  process.env.BETTER_AUTH_SECRET = "integration-test-secret-0123456789abcdef";
  process.env.WEB_URL = "http://localhost:3000";
  process.env.S3_ENDPOINT = "http://localhost:9000";
  process.env.S3_PUBLIC_ENDPOINT = "http://localhost:9000";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY = "minioadmin";
  process.env.S3_SECRET_KEY = "minioadmin";
  process.env.S3_BUCKET = "uploads";
  process.env.SMTP_HOST = "localhost";
  process.env.SMTP_PORT = "1025";
  process.env.SMTP_SECURE = "false";
  process.env.MAIL_FROM = "Test <test@example.com>";
  process.env.LOG_LEVEL = "warn";
  process.env.LOG_FILE_ENABLED = "false";
  process.env.LOG_DIR = "./logs";

  const { db, pool } = createDb(process.env.DATABASE_URL);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(rolePermission).values(
    Object.entries(defaultRolePermissions).flatMap(([role, rules]) =>
      rules.map((rule) => ({
        role,
        action: rule.action,
        subject: rule.subject,
        conditions: rule.conditions ?? null,
        inverted: rule.inverted ?? false,
      }))
    )
  );
  await pool.end();

  const { createApp } = await import("../src/app.setup.js");
  app = await createApp();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await Promise.all([postgres?.stop(), redis?.stop()]);
});

async function signUp(name: string, email: string) {
  const agent = request.agent(server);
  const response = await agent
    .post("/auth/sign-up/email")
    .send({ name, email, password: "Password123!" });
  if (response.status !== 200) {
    throw new Error(`sign-up failed (${response.status}): ${response.text}`);
  }
  return agent;
}

describe("api integration", () => {
  it("reports readiness once db and redis are reachable", async () => {
    const response = await request(server).get("/health/ready");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("serializes unauthenticated access with a typed error code", async () => {
    const response = await request(server).get("/projects");
    expect(response.status).toBe(401);
    expect(response.body.data.code).toBe("AUTH_UNAUTHORIZED");
    expect(response.body.data.traceId).toBeTruthy();
  });

  it("runs the full project lifecycle with ownership enforcement", async () => {
    const alice = await signUp("Alice", "alice@example.com");
    const bob = await signUp("Bob", "bob@example.com");

    const created = await alice
      .post("/projects")
      .send({ name: "Alice's line", status: "active" });
    expect(created.status).toBe(200);
    const projectId: string = created.body.id;
    expect(projectId).toBeTruthy();

    const listed = await alice.get("/projects").query({ search: "Alice" });
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(
      projectId
    );

    // Members read everything, but only mutate what they own.
    const read = await bob.get(`/projects/${projectId}`);
    expect(read.status).toBe(200);

    const forbidden = await bob
      .patch(`/projects/${projectId}`)
      .send({ name: "hijack" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.data.code).toBe("AUTH_FORBIDDEN");

    const updated = await alice
      .patch(`/projects/${projectId}`)
      .send({ status: "archived" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("archived");

    const missing = await alice.get(
      "/projects/00000000-0000-4000-8000-000000000000"
    );
    expect(missing.status).toBe(404);
    expect(missing.body.data.code).toBe("RESOURCE_NOT_FOUND");

    const stats = await alice.get("/projects/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBeGreaterThan(0);
    expect(stats.body.createdPerDay).toHaveLength(30);
  });

  it("scopes file listings to the owner for members", async () => {
    const carol = await signUp("Carol", "carol@example.com");
    const dave = await signUp("Dave", "dave@example.com");

    const presigned = await carol.post("/files/presign-upload").send({
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(presigned.status).toBe(200);
    expect(presigned.body.uploadUrl).toContain("uploads");
    expect(presigned.body.method).toBe("PUT");

    const carolList = await carol.get("/files");
    expect(carolList.body.items).toHaveLength(1);
    const daveList = await dave.get("/files");
    expect(daveList.body.items).toHaveLength(0);
  });

  it("exposes admin endpoints to admins only", async () => {
    const eve = await signUp("Eve", "eve@example.com");
    const noAccess = await eve.get("/users");
    expect(noAccess.status).toBe(403);

    // Promote via db, as an operator would; permissions cache is per-user.
    const { db, pool } = createDb(process.env.DATABASE_URL as string);
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, "eve@example.com"));
    await pool.end();

    // The signed cookie cache still carries the old role — a fresh sign-in
    // picks up the promotion (same as a real user re-logging in).
    const eveAdmin = request.agent(server);
    const signIn = await eveAdmin
      .post("/auth/sign-in/email")
      .send({ email: "eve@example.com", password: "Password123!" });
    expect(signIn.status).toBe(200);

    const access = await eveAdmin.get("/users");
    expect(access.status).toBe(200);
    expect(access.body.total).toBeGreaterThanOrEqual(5);

    const me = await eveAdmin.get("/me/permissions");
    expect(me.status).toBe(200);
    expect(me.body.rules.length).toBeGreaterThan(0);
  });
});
