import { randomUUID } from "node:crypto";
import path from "node:path";
import { defaultRolePermissions } from "@repo/contracts";
import { createDb, member, rolePermission, user } from "@repo/db";
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

// Shared across the ordered tests below: the first organization created.
let acmeOrgId: string;

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
  process.env.MICROSOFT_CLIENT_ID = "test-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
  process.env.MICROSOFT_TENANT_ID = "common";
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
  process.env.OTEL_ENABLED = "false";
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
  process.env.OTEL_SERVICE_NAME = "api";
  process.env.SENTRY_ENABLED = "false";
  process.env.SENTRY_DSN = "test-dsn";
  process.env.POSTHOG_ENABLED = "false";
  process.env.POSTHOG_API_KEY = "test-key";
  process.env.POSTHOG_HOST = "https://eu.i.posthog.com";
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

/** Create an organization and make it the agent's active tenant. */
async function createOrganization(
  agent: ReturnType<typeof request.agent>,
  name: string,
  slug: string
): Promise<string> {
  const created = await agent
    .post("/auth/organization/create")
    .send({ name, slug });
  if (created.status !== 200) {
    throw new Error(
      `organization create failed (${created.status}): ${created.text}`
    );
  }
  const organizationId: string =
    created.body.id ?? created.body.organization?.id;
  const activated = await agent
    .post("/auth/organization/set-active")
    .send({ organizationId });
  if (activated.status !== 200) {
    throw new Error(
      `set-active failed (${activated.status}): ${activated.text}`
    );
  }
  return organizationId;
}

/** Operator-style membership grant straight into the database. */
async function addMemberByEmail(
  organizationId: string,
  email: string
): Promise<void> {
  const { db, pool } = createDb(process.env.DATABASE_URL as string);
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (!target) {
    await pool.end();
    throw new Error(`no user with email ${email}`);
  }
  await db.insert(member).values({
    id: randomUUID(),
    organizationId,
    userId: target.id,
    role: "member",
  });
  await pool.end();
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

  it("gives users without an organization empty lists, not errors", async () => {
    const noorg = await signUp("Norg", "noorg@example.com");

    const listed = await noorg.get("/projects");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(0);
    expect(listed.body.total).toBe(0);

    const stats = await noorg.get("/projects/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(0);
    expect(stats.body.createdPerDay).toHaveLength(30);

    const files = await noorg.get("/files");
    expect(files.status).toBe(200);
    expect(files.body.items).toHaveLength(0);

    // Creating needs a tenant to create into.
    const denied = await noorg
      .post("/projects")
      .send({ name: "orphan", status: "draft" });
    expect(denied.status).toBe(403);
    expect(denied.body.data.code).toBe("AUTH_FORBIDDEN");
  });

  it("runs the full project lifecycle with ownership enforcement", async () => {
    const alice = await signUp("Alice", "alice@example.com");
    const organizationId = await createOrganization(alice, "Acme", "acme");
    acmeOrgId = organizationId;
    const bob = await signUp("Bob", "bob@example.com");

    const created = await alice
      .post("/projects")
      .send({ name: "Alice's line", status: "active" });
    expect(created.status).toBe(200);
    const projectId: string = created.body.id;
    expect(projectId).toBeTruthy();
    expect(created.body.organizationId).toBe(organizationId);

    const listed = await alice.get("/projects").query({ search: "Alice" });
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(
      projectId
    );

    // Outside the organization the project does not exist.
    const invisible = await bob.get(`/projects/${projectId}`);
    expect(invisible.status).toBe(404);
    const bobList = await bob.get("/projects");
    expect(bobList.body.items).toHaveLength(0);

    // Same organization: members read everything, mutate what they own.
    await addMemberByEmail(organizationId, "bob@example.com");
    const activated = await bob
      .post("/auth/organization/set-active")
      .send({ organizationId });
    expect(activated.status).toBe(200);

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

  it("never leaks projects across organizations", async () => {
    const mallory = await signUp("Mallory", "mallory@example.com");
    await createOrganization(mallory, "Mallory Corp", "mallory-corp");

    // Alice's acme project (created above) must be invisible from another
    // tenant: absent from lists, 404 on direct access, absent from stats.
    const listed = await mallory.get("/projects");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(0);

    const stats = await mallory.get("/projects/stats");
    expect(stats.body.total).toBe(0);
  });

  it("scopes file listings to the owner for members", async () => {
    const carol = await signUp("Carol", "carol@example.com");
    await createOrganization(carol, "Carol Co", "carol-co");
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

  it("captures mutations in the audit log, visible to admins per tenant", async () => {
    // Non-admins never read the audit log.
    const alice = request.agent(server);
    await alice
      .post("/auth/sign-in/email")
      .send({ email: "alice@example.com", password: "Password123!" });
    const deniedRead = await alice.get("/audit-logs");
    expect(deniedRead.status).toBe(403);
    const deniedOrgs = await alice.get("/organizations");
    expect(deniedOrgs.status).toBe(403);

    // Eve (admin) reads the acme trail once she acts within that tenant.
    const eveAdmin = request.agent(server);
    await eveAdmin
      .post("/auth/sign-in/email")
      .send({ email: "eve@example.com", password: "Password123!" });
    await addMemberByEmail(acmeOrgId, "eve@example.com");
    const activated = await eveAdmin
      .post("/auth/organization/set-active")
      .send({ organizationId: acmeOrgId });
    expect(activated.status).toBe(200);

    const logs = await eveAdmin.get("/audit-logs");
    expect(logs.status).toBe(200);
    expect(logs.body.total).toBeGreaterThan(0);
    const actions = logs.body.items.map(
      (item: { action: string }) => item.action
    );
    expect(actions).toContain("project.create");
    expect(actions).toContain("project.update");
    const created = logs.body.items.find(
      (item: { action: string }) => item.action === "project.create"
    );
    expect(created.organizationId).toBe(acmeOrgId);
    expect(created.actorEmail).toBe("alice@example.com");
    expect(created.entityId).toBeTruthy();
    expect(created.requestId).toBeTruthy();

    // Entries filter by action, and stay tenant-scoped.
    const filtered = await eveAdmin
      .get("/audit-logs")
      .query({ action: "project.update" });
    expect(
      filtered.body.items.every(
        (item: { action: string }) => item.action === "project.update"
      )
    ).toBe(true);

    // The admin org overview lists every tenant with member counts.
    const organizations = await eveAdmin.get("/organizations");
    expect(organizations.status).toBe(200);
    const acme = organizations.body.items.find(
      (item: { slug: string }) => item.slug === "acme"
    );
    expect(acme).toBeTruthy();
    expect(acme.memberCount).toBeGreaterThanOrEqual(2);
  });

  it("rejects cross-origin writes and ships hardened headers", async () => {
    const alice = request.agent(server);
    await alice
      .post("/auth/sign-in/email")
      .send({ email: "alice@example.com", password: "Password123!" });

    // A browser-forged cross-site write carries the attacker's Origin.
    const forged = await alice
      .post("/projects")
      .set("Origin", "https://evil.example.com")
      .send({ name: "csrf", status: "draft" });
    expect(forged.status).toBe(403);

    // The web app's own Origin passes.
    const legit = await alice
      .post("/projects")
      .set("Origin", "http://localhost:3000")
      .send({ name: "legit origin", status: "draft" });
    expect(legit.status).toBe(200);

    const response = await request(server).get("/health/ready");
    expect(response.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(response.headers["strict-transport-security"]).toContain("max-age");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("lets admins force feature flags per organization", async () => {
    const alice = request.agent(server);
    await alice
      .post("/auth/sign-in/email")
      .send({ email: "alice@example.com", password: "Password123!" });
    const denied = await alice.get("/feature-flags");
    expect(denied.status).toBe(403);

    // Eve is an acme member by now — a fresh sign-in activates it directly.
    const eveAdmin = request.agent(server);
    await eveAdmin
      .post("/auth/sign-in/email")
      .send({ email: "eve@example.com", password: "Password123!" });

    const forced = await eveAdmin
      .put("/feature-flags/new-dashboard/override")
      .send({ value: true });
    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({
      key: "new-dashboard",
      enabled: true,
      source: "override",
      override: true,
    });

    const listed = await eveAdmin.get("/feature-flags");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toContainEqual(
      expect.objectContaining({ key: "new-dashboard", enabled: true })
    );

    // Clearing falls back to PostHog — disabled here, so the flag is off.
    const cleared = await eveAdmin
      .put("/feature-flags/new-dashboard/override")
      .send({ value: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      key: "new-dashboard",
      enabled: false,
      source: "posthog",
      override: null,
    });

    // Override writes leave an audit trail like any other mutation.
    const logs = await eveAdmin
      .get("/audit-logs")
      .query({ action: "featureFlag.setOverride" });
    expect(logs.body.total).toBeGreaterThanOrEqual(2);
    expect(logs.body.items[0].entityId).toBe("new-dashboard");
  });
});
