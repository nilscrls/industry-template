import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  auditLog,
  createDb,
  member,
  project,
  user,
  withTenant,
} from "@repo/db";
import { createFgaClient, loadModelJson, ref } from "@repo/fga";
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
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Full-stack integration suite: real Postgres + Redis + OpenFGA
 * (Testcontainers), the exact production middleware stack (createApp),
 * HTTP in via supertest.
 */
let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let openfga: StartedTestContainer;
let app: Awaited<ReturnType<typeof import("../src/app.setup.js")["createApp"]>>;
let server: Parameters<typeof request>[0];

/** Operator-style FGA access for test fixtures (mirrors `pnpm fga:sync`). */
function fgaClient() {
  return createFgaClient({
    apiUrl: process.env.FGA_API_URL as string,
    storeId: process.env.FGA_STORE_ID as string,
    apiToken: process.env.FGA_API_TOKEN as string,
  });
}

// vitest runs with cwd = apps/api
const MIGRATIONS = path.resolve(process.cwd(), "../../packages/db/drizzle");

// Shared across the ordered tests below: the first organization created.
let acmeOrgId: string;

beforeAll(async () => {
  [postgres, redis, openfga] = await Promise.all([
    new PostgreSqlContainer("postgres:17-alpine").start(),
    new RedisContainer("redis:7-alpine").start(),
    // In-memory datastore: fast, throwaway, no auth (tests only).
    new GenericContainer("openfga/openfga:v1")
      .withCommand(["run"])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/healthz", 8080).forStatusCode(200))
      .start(),
  ]);

  // env.ts reads process.env at import time — set everything first.
  // The schema has no defaults, so every server var must be present here.
  const ownerUrl = postgres.getConnectionUri();
  const roleUrl = (role: string) => {
    const url = new URL(ownerUrl);
    url.username = role;
    url.password = role;
    return url.toString();
  };
  process.env.NODE_ENV = "test";
  process.env.API_PORT = "3001";
  // Owner for migrations/seeds; restricted app_user for the api runtime;
  // BYPASSRLS app_auth for Better-Auth — same principals as production.
  process.env.DATABASE_URL_MIGRATIONS = ownerUrl;
  process.env.DATABASE_URL = roleUrl("app_user");
  process.env.DATABASE_URL_AUTH = roleUrl("app_auth");
  process.env.REDIS_URL = redis.getConnectionUrl();
  process.env.FGA_API_URL = `http://${openfga.getHost()}:${openfga.getMappedPort(8080)}`;
  process.env.FGA_API_TOKEN = "test-token";
  process.env.FGA_MODEL_ID = "";
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

  const { pool, db } = createDb(ownerUrl);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  // The roles migration creates them NOLOGIN (no init script inside
  // Testcontainers) — enable them exactly like an operator would.
  await pool.query("ALTER ROLE app_user LOGIN PASSWORD 'app_user'");
  await pool.query("ALTER ROLE app_auth LOGIN PASSWORD 'app_auth'");
  await pool.end();

  // Same as `pnpm fga:bootstrap`: create the store + write the model.
  const admin = createFgaClient({
    apiUrl: process.env.FGA_API_URL,
    apiToken: process.env.FGA_API_TOKEN,
  });
  const store = await admin.createStore({ name: "integration-tests" });
  process.env.FGA_STORE_ID = store.id;
  await createFgaClient({
    apiUrl: process.env.FGA_API_URL,
    apiToken: process.env.FGA_API_TOKEN,
    storeId: store.id,
  }).writeAuthorizationModel(loadModelJson());

  const { createApp } = await import("../src/app.setup.js");
  app = await createApp();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await Promise.all([postgres?.stop(), redis?.stop(), openfga?.stop()]);
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
  const { db, pool } = createDb(process.env.DATABASE_URL_MIGRATIONS as string);
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
  // Direct inserts bypass the Better-Auth hooks — mirror the tuple by hand
  // (operators would run `pnpm fga:sync`).
  await fgaClient().writeTuples([
    {
      user: ref.user(target.id),
      relation: "member",
      object: ref.org(organizationId),
    },
  ]);
}

describe("api integration", () => {
  it("reports readiness once db and redis are reachable", async () => {
    const response = await request(server).get("/health/ready");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("defaults every response to no-store, with an explicit public opt-in for docs", async () => {
    // Authenticated JSON must never be stored by a shared cache (IDOR).
    const authed = await request(server).get("/projects");
    expect(authed.headers["cache-control"]).toBe("private, no-store");

    // The Express-mounted Better-Auth handler is covered too.
    const auth = await request(server).post("/auth/sign-in/email").send({});
    expect(auth.headers["cache-control"]).toBe("private, no-store");

    // Health stays no-store (Terminus sets its own equivalent header).
    const health = await request(server).get("/health/ready");
    expect(health.headers["cache-control"]).toContain("no-store");

    // openapi.json is caller-independent and opts into public caching.
    const docs = await request(server).get("/openapi.json");
    expect(docs.status).toBe(200);
    expect(docs.headers["cache-control"]).toBe("public, max-age=300");
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

    // Promote via db + tuple, as an operator would (db row is the source
    // of truth; the tuple is what fga:sync would derive from it).
    const { db, pool } = createDb(
      process.env.DATABASE_URL_MIGRATIONS as string
    );
    const [eveRow] = await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, "eve@example.com"))
      .returning({ id: user.id });
    await pool.end();
    if (!eveRow) {
      throw new Error("expected eve to exist");
    }
    await fgaClient().writeTuples([
      { user: ref.user(eveRow.id), relation: "admin", object: ref.system() },
    ]);

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

    // Capability snapshot straight from FGA — no cache lag on role changes.
    const me = await eveAdmin.get("/me/permissions");
    expect(me.status).toBe(200);
    expect(me.body.system).toContain("can_manage_user");
    expect(me.body.system).toContain("can_manage_organization");
  });

  it("lets admins deny a member's access to a single project", async () => {
    // Bob is an acme member and can read Alice's project (earlier test).
    const bob = request.agent(server);
    await bob
      .post("/auth/sign-in/email")
      .send({ email: "bob@example.com", password: "Password123!" });
    const eveAdmin = request.agent(server);
    await eveAdmin
      .post("/auth/sign-in/email")
      .send({ email: "eve@example.com", password: "Password123!" });

    const projects = await bob.get("/projects");
    const target = projects.body.items[0];
    expect(target).toBeTruthy();
    const before = await bob.get(`/projects/${target.id}`);
    expect(before.status).toBe(200);

    // Look bob up, then deny him that one project. Deny beats every allow.
    const users = await eveAdmin.get("/users").query({ search: "bob" });
    const bobId = users.body.items[0].id;
    const denied = await eveAdmin.put(`/users/${bobId}/grants`).send({
      grants: [{ object: `project:${target.id}`, relation: "denied_read" }],
    });
    expect(denied.status).toBe(200);

    const after = await bob.get(`/projects/${target.id}`);
    expect(after.status).toBe(403);

    // Grants are readable and replaceable; clearing restores access.
    const read = await eveAdmin.get(`/users/${bobId}/grants`);
    expect(read.body.grants).toContainEqual({
      object: `project:${target.id}`,
      relation: "denied_read",
    });
    await eveAdmin.put(`/users/${bobId}/grants`).send({ grants: [] });
    const restored = await bob.get(`/projects/${target.id}`);
    expect(restored.status).toBe(200);
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

  it("enforces row-level security even on queries with no WHERE clause", async () => {
    // Simulates a forgotten organization filter: connect as the runtime
    // role (app_user) and select everything.
    const { db, pool } = createDb(process.env.DATABASE_URL as string);
    try {
      // No tenant context → the policies match nothing.
      const bare = await db.select().from(project);
      expect(bare).toHaveLength(0);

      // Tenant context → only that tenant's rows, without any WHERE.
      const scoped = await withTenant(
        db,
        { organizationId: acmeOrgId, userId: null },
        (tx) => tx.select().from(project)
      );
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.every((row) => row.organizationId === acmeOrgId)).toBe(
        true
      );

      // Cross-tenant writes violate the WITH CHECK clause.
      const [foreign] = await withTenant(
        db,
        { organizationId: acmeOrgId, userId: null },
        (tx) => tx.select().from(project).limit(1)
      );
      if (!foreign) {
        throw new Error("expected an acme project to exist");
      }
      // Drizzle wraps the pg error — the RLS violation is the cause.
      await expect(
        withTenant(
          db,
          { organizationId: "some-other-org", userId: null },
          (tx) =>
            tx.insert(project).values({
              name: "smuggled",
              status: "draft",
              organizationId: foreign.organizationId,
              ownerId: foreign.ownerId,
            })
        )
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(/row-level security/),
        }),
      });
    } finally {
      await pool.end();
    }
  });

  it("exports the requesting user's data as JSON (GDPR portability)", async () => {
    const dana = await signUp("Dana", "dana@example.com");
    const orgId = await createOrganization(dana, "Dana Co", "dana-co");
    const created = await dana
      .post("/projects")
      .send({ name: "Dana's project", status: "draft" });
    expect(created.status).toBe(200);

    const exported = await dana.get("/me/export");
    expect(exported.status).toBe(200);
    expect(exported.body.user.email).toBe("dana@example.com");
    expect(exported.body.memberships).toContainEqual(
      expect.objectContaining({ organizationId: orgId, role: "owner" })
    );
    expect(exported.body.projects).toContainEqual(
      expect.objectContaining({ name: "Dana's project" })
    );
    expect(Array.isArray(exported.body.files)).toBe(true);
    // The export itself is audited — visible in her own audit entries on a
    // subsequent export.
    const again = await dana.get("/me/export");
    expect(again.body.auditEntries).toContainEqual(
      expect.objectContaining({ action: "user.exportData" })
    );
  });

  it("blocks account deletion for sole organization owners, then erases", async () => {
    const erin = await signUp("Erin", "erin@example.com");
    const orgId = await createOrganization(erin, "Erin Co", "erin-co");

    // Sole owner of Erin Co → blocked with an actionable message.
    const blocked = await erin
      .post("/auth/delete-user")
      .send({ password: "Password123!" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/only owner/i);

    // Delete the organization, then erasure goes through.
    const orgGone = await erin
      .post("/auth/organization/delete")
      .send({ organizationId: orgId });
    expect(orgGone.status).toBe(200);
    const deleted = await erin
      .post("/auth/delete-user")
      .send({ password: "Password123!" });
    expect(deleted.status).toBe(200);

    // Session is dead and the account cannot sign in again.
    const afterwards = await erin.get("/projects");
    expect(afterwards.status).toBe(401);
    const signIn = await request(server)
      .post("/auth/sign-in/email")
      .send({ email: "erin@example.com", password: "Password123!" });
    expect(signIn.status).not.toBe(200);

    // The user row is gone; the erasure left an anonymized audit event.
    const { db, pool } = createDb(
      process.env.DATABASE_URL_MIGRATIONS as string
    );
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, "erin@example.com"));
    const events = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.delete"));
    await pool.end();
    expect(users).toHaveLength(0);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)?.actorId).toBeNull();
  });
});
