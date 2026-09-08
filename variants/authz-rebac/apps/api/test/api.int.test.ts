import { randomUUID } from "node:crypto";
import {
  AuditLog,
  createDataSource,
  createPool,
  Member,
  Project,
  User,
  Wallet,
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
import { betterAuth } from "better-auth";
import { admin, organization, twoFactor } from "better-auth/plugins";
import request from "supertest";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Full-stack integration suite: real Postgres + Redis (Testcontainers), the
 * exact production middleware stack (createApp), HTTP in via supertest.
 * ReBAC flavor: grants come from project_member relations, not roles.
 */
let postgres: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let openfga: StartedTestContainer;
let app: Awaited<ReturnType<typeof import("../src/app.setup.js")["createApp"]>>;
let server: Parameters<typeof request>[0];

/**
 * Owner (unrestricted) DataSource: runs the migrations, then backs every
 * fixture/assertion query for the rest of the suite (`owner.manager`).
 */
let owner: DataSource;

/** Operator-style FGA access for test fixtures (mirrors `pnpm fga:sync`). */
function fgaClient() {
  return createFgaClient({
    apiUrl: process.env.FGA_API_URL as string,
    storeId: process.env.FGA_STORE_ID as string,
    apiToken: process.env.FGA_API_TOKEN as string,
  });
}

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
  // This suite fires rapid sign-ups/sign-ins from one IP; the limiter has
  // its own dedicated suite (test/rate-limit.int.test.ts).
  process.env.AUTH_RATE_LIMIT_ENABLED = "false";
  process.env.REQUIRE_EMAIL_VERIFICATION = "false";
  process.env.EMAILS_ENABLED = "true";
  process.env.MICROSOFT_CLIENT_ID = "test-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
  process.env.MICROSOFT_TENANT_ID = "common";
  process.env.WEB_URL = "http://localhost:3000";
  // Read only when scaffolded with --api=direct; harmless otherwise.
  process.env.API_PUBLIC_URL = "http://localhost:3001";
  process.env.COOKIE_DOMAIN = "localhost";
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

  owner = createDataSource(ownerUrl);
  await owner.initialize();
  await owner.runMigrations();
  // The roles migration creates them NOLOGIN (no init script inside
  // Testcontainers) — enable them exactly like an operator would.
  await owner.query("ALTER ROLE app_user LOGIN PASSWORD 'app_user'");
  await owner.query("ALTER ROLE app_auth LOGIN PASSWORD 'app_auth'");

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
  await owner?.destroy();
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

async function currentUserId(agent: request.Agent): Promise<string> {
  const session = await agent.get("/auth/get-session");
  return session.body.user.id;
}

/** Create an organization and make it the agent's active tenant. */
async function createOrganization(
  agent: request.Agent,
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
  const target = await owner.manager.findOneBy(User, { email });
  if (!target) {
    throw new Error(`no user with email ${email}`);
  }
  await owner.manager.insert(Member, {
    id: randomUUID(),
    organizationId,
    userId: target.id,
    role: "member",
  });
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

/** Operator-style app-level role change straight into the database. */
async function setAppRole(
  email: string,
  role: "admin" | "manager" | "user"
): Promise<string> {
  const target = await owner.manager.findOneByOrFail(User, { email });
  await owner.manager.update(User, { id: target.id }, { role });
  return target.id;
}

/** Join the organization and make it the agent's active tenant. */
async function joinOrganization(
  agent: request.Agent,
  organizationId: string,
  email: string
): Promise<void> {
  await addMemberByEmail(organizationId, email);
  const activated = await agent
    .post("/auth/organization/set-active")
    .send({ organizationId });
  if (activated.status !== 200) {
    throw new Error(
      `set-active failed (${activated.status}): ${activated.text}`
    );
  }
}

// Shared across the ordered tests below: the first organization created.
let acmeOrgId: string;

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

  it("gives a fresh sign-up the default 'user' role and empty lists, not errors", async () => {
    const noorg = await signUp("Norg", "noorg@example.com");

    const noorgRow = await owner.manager.findOneByOrFail(User, {
      email: "noorg@example.com",
    });
    expect(noorgRow.role).toBe("user");

    const listed = await noorg.get("/projects");
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(0);

    const stats = await noorg.get("/projects/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(0);

    const denied = await noorg
      .post("/projects")
      .send({ name: "orphan", status: "draft" });
    expect(denied.status).toBe(403);
    expect(denied.body.data.code).toBe("AUTH_FORBIDDEN");
  });

  it("scopes projects to memberships and walks the relation ladder", async () => {
    const alice = await signUp("Alice", "alice@example.com");
    acmeOrgId = await createOrganization(alice, "Acme", "acme");
    const bob = await signUp("Bob", "bob@example.com");
    // Same tenant for both: this suite exercises the relation ladder, so the
    // org boundary must not be what hides the project from Bob.
    await joinOrganization(bob, acmeOrgId, "bob@example.com");
    const bobId = await currentUserId(bob);

    // Creating grants the owner relation.
    const created = await alice
      .post("/projects")
      .send({ name: "Alice's line", status: "active" });
    expect(created.status).toBe(200);
    const projectId: string = created.body.id;
    expect(projectId).toBeTruthy();

    const aliceList = await alice.get("/projects");
    expect(
      aliceList.body.items.map((item: { id: string }) => item.id)
    ).toContain(projectId);

    // No relation → the project does not exist for Bob.
    const bobList = await bob.get("/projects");
    expect(bobList.status).toBe(200);
    expect(bobList.body.items).toHaveLength(0);
    const bobRead = await bob.get(`/projects/${projectId}`);
    expect(bobRead.status).toBe(403);
    expect(bobRead.body.data.code).toBe("AUTH_FORBIDDEN");

    // Owner grants Bob `editor` → read + update, but not delete/manage.
    const granted = await alice
      .put(`/projects/${projectId}/members/${bobId}`)
      .send({ relation: "editor" });
    expect(granted.status).toBe(200);
    expect(granted.body.relation).toBe("editor");

    const bobReadAfter = await bob.get(`/projects/${projectId}`);
    expect(bobReadAfter.status).toBe(200);
    const bobUpdate = await bob
      .patch(`/projects/${projectId}`)
      .send({ status: "archived" });
    expect(bobUpdate.status).toBe(200);
    expect(bobUpdate.body.status).toBe("archived");
    const bobDelete = await bob.delete(`/projects/${projectId}`);
    expect(bobDelete.status).toBe(403);

    // Editors cannot manage members.
    const aliceId = await currentUserId(alice);
    const bobGrants = await bob
      .put(`/projects/${projectId}/members/${aliceId}`)
      .send({ relation: "viewer" });
    expect(bobGrants.status).toBe(403);

    // Demote Bob to viewer → updates stop.
    const demoted = await alice
      .put(`/projects/${projectId}/members/${bobId}`)
      .send({ relation: "viewer" });
    expect(demoted.status).toBe(200);
    const bobUpdateDenied = await bob
      .patch(`/projects/${projectId}`)
      .send({ status: "active" });
    expect(bobUpdateDenied.status).toBe(403);

    // Revoke → back to invisible.
    const removed = await alice.delete(
      `/projects/${projectId}/members/${bobId}`
    );
    expect(removed.status).toBe(200);
    const bobReadRevoked = await bob.get(`/projects/${projectId}`);
    expect(bobReadRevoked.status).toBe(403);

    // The last owner cannot be removed or demoted.
    const selfDemote = await alice
      .put(`/projects/${projectId}/members/${aliceId}`)
      .send({ relation: "viewer" });
    expect(selfDemote.status).toBe(403);
    const selfRemove = await alice.delete(
      `/projects/${projectId}/members/${aliceId}`
    );
    expect(selfRemove.status).toBe(403);

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

    // Alice's acme project (created above) is invisible from another tenant,
    // even though relation rows are the grant inside a tenant.
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

  it("exposes admin endpoints to admins only, bypassing memberships", async () => {
    const eve = await signUp("Eve", "eve@example.com");
    const noAccess = await eve.get("/users");
    expect(noAccess.status).toBe(403);

    // Promote via db + tuple, as an operator would (db row is the source
    // of truth; the tuple is what fga:sync would derive from it).
    const eveId = await setAppRole("eve@example.com", "admin");
    await fgaClient().writeTuples([
      { user: ref.user(eveId), relation: "admin", object: ref.system() },
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

    // Admins bypass relations, not the tenant boundary: they still act
    // within their active organization.
    await joinOrganization(eveAdmin, acmeOrgId, "eve@example.com");
    const projects = await eveAdmin.get("/projects");
    expect(projects.status).toBe(200);
    expect(projects.body.total).toBeGreaterThan(0);

    // Capability snapshot straight from FGA — no cache lag on role changes.
    const me = await eveAdmin.get("/me/permissions");
    expect(me.status).toBe(200);
    expect(me.body.system).toContain("can_manage_user");
    expect(me.body.org).toContain("can_read_audit_log");

    // eve's ORIGINAL session: FGA checks have no cache lag, so the
    // promotion applies to existing sessions immediately — but that session
    // still has no active org, so org-scoped audit reads answer with an
    // empty page while the system-scoped org overview now succeeds.
    const staleSessionRead = await eve.get("/audit-logs");
    expect(staleSessionRead.status).toBe(200);
    expect(staleSessionRead.body.items).toHaveLength(0);
    const staleSessionOrgs = await eve.get("/organizations");
    expect(staleSessionOrgs.status).toBe(200);

    const organizations = await eveAdmin.get("/organizations");
    expect(organizations.status).toBe(200);
    expect(organizations.body.total).toBeGreaterThan(0);

    const logs = await eveAdmin.get("/audit-logs");
    expect(logs.status).toBe(200);
    expect(logs.body.total).toBeGreaterThan(0);
    const actions = logs.body.items.map(
      (item: { action: string }) => item.action
    );
    expect(actions).toContain("project.create");
    expect(actions).toContain("project.member.set");
    const created = logs.body.items.find(
      (item: { action: string }) => item.action === "project.create"
    );
    expect(created.organizationId).toBe(acmeOrgId);
    expect(created.actorEmail).toBe("alice@example.com");
    expect(created.requestId).toBeTruthy();
  });

  it("enforces row-level security even on queries with no WHERE clause", async () => {
    // Simulates a forgotten organization filter: connect as the runtime
    // role (app_user) and select everything.
    const appUser = createDataSource(process.env.DATABASE_URL as string);
    await appUser.initialize();
    try {
      // No tenant context → the policies match nothing.
      const bare = await appUser.manager.find(Project);
      expect(bare).toHaveLength(0);

      // Tenant context → only that tenant's rows, without any WHERE.
      const scoped = await withTenant(
        appUser,
        { organizationId: acmeOrgId, userId: null },
        (m) => m.find(Project)
      );
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.every((row) => row.organizationId === acmeOrgId)).toBe(
        true
      );

      // Cross-tenant writes violate the WITH CHECK clause.
      const [foreign] = scoped;
      if (!foreign) {
        throw new Error("expected an acme project to exist");
      }
      await expect(
        withTenant(
          appUser,
          { organizationId: "some-other-org", userId: null },
          (m) =>
            m.insert(Project, {
              name: "smuggled",
              status: "draft",
              organizationId: foreign.organizationId,
              ownerId: foreign.ownerId,
            })
        )
      ).rejects.toMatchObject({
        message: expect.stringMatching(/row-level security/),
      });
    } finally {
      await appUser.destroy();
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
    const users = await owner.manager.find(User, {
      where: { email: "erin@example.com" },
    });
    const events = await owner.manager.find(AuditLog, {
      where: { action: "user.delete" },
    });
    expect(users).toHaveLength(0);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)?.actorId).toBeNull();
  });

  it("guards the points wallet against concurrent double-spends", async () => {
    // ReBAC has no 'manager' role — only admins may credit another
    // member's wallet (model.fga: `define can_manage_wallet: admin`).
    const admin1 = await signUp("Wally", "wally@example.com");
    const wallyId = await setAppRole("wally@example.com", "admin");
    await fgaClient().writeTuples([
      { user: ref.user(wallyId), relation: "admin", object: ref.system() },
    ]);
    await joinOrganization(admin1, acmeOrgId, "wally@example.com");
    // The signed cookie cache still carries the old role — re-sign-in picks
    // up the promotion (same pattern as the admin-promotion test above).
    const wallyAdmin = request.agent(server);
    await wallyAdmin
      .post("/auth/sign-in/email")
      .send({ email: "wally@example.com", password: "Password123!" });
    await wallyAdmin
      .post("/auth/organization/set-active")
      .send({ organizationId: acmeOrgId });

    // Bob is a plain member (no admin relation) and already in acme
    // (earlier test).
    const bob = request.agent(server);
    await bob
      .post("/auth/sign-in/email")
      .send({ email: "bob@example.com", password: "Password123!" });
    await bob
      .post("/auth/organization/set-active")
      .send({ organizationId: acmeOrgId });
    const bobRow = await owner.manager.findOneByOrFail(User, {
      email: "bob@example.com",
    });

    // A plain member may not credit — only admins.
    const nonAdminCredit = await bob
      .post("/wallet/credit")
      .send({ userId: bobRow.id, amount: 10, reason: "self-serve" });
    expect(nonAdminCredit.status).toBe(403);

    const credited = await wallyAdmin
      .post("/wallet/credit")
      .send({ userId: bobRow.id, amount: 100, reason: "welcome bonus" });
    expect(credited.status).toBe(200);
    expect(credited.body.balance).toBe(100);

    // Ten concurrent spends of 60 against a balance of 100: exactly one can
    // succeed; the row lock + atomic conditional UPDATE serialize the rest
    // into a clean 409, never a negative balance.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        bob.post("/wallet/spend").send({ amount: 60, reason: "spree" })
      )
    );
    const ok = attempts.filter((r) => r.status === 200);
    const conflicts = attempts.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    for (const conflict of conflicts) {
      expect(conflict.body.data.code).toBe("WALLET_INSUFFICIENT_BALANCE");
    }

    const me = await bob.get("/wallet/me");
    expect(me.status).toBe(200);
    expect(me.body.balance).toBe(40);
    expect(me.body.entries).toHaveLength(2);
    for (const entry of me.body.entries) {
      expect(entry.id).toBeTruthy();
    }

    // Zero (and negative) amounts fail contract validation, not the
    // balance check.
    const zeroSpend = await bob
      .post("/wallet/spend")
      .send({ amount: 0, reason: "nothing" });
    expect(zeroSpend.status).toBe(400);
    expect(zeroSpend.body.data.code).toBe("VALIDATION_FAILED");

    // The CHECK constraint is a backstop of last resort, not a user-facing
    // path: an owner-connection write that slips past application logic
    // still can't drive the balance negative.
    const bobWallet = await owner.manager.findOneByOrFail(Wallet, {
      organizationId: acmeOrgId,
      userId: bobRow.id,
    });
    await expect(
      owner.query('update "wallet" set "balance" = -1 where "id" = $1', [
        bobWallet.id,
      ])
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("better-auth schema drift", () => {
  it("stays in sync with the hand-written auth tables (pnpm auth:schema)", async () => {
    // Introspects the LIVE database via a plain pg Pool — no
    // secondaryStorage, so this mirrors exactly what `pnpm auth:schema`
    // (the @better-auth/cli) would report against packages/auth's
    // auth-cli.ts config. Any non-empty result means the entities in
    // packages/db/src/entities have drifted from what Better-Auth expects.
    const pool = createPool(process.env.DATABASE_URL_MIGRATIONS as string);
    try {
      const { getMigrations } = await import("better-auth/db/migration");
      const { toBeCreated, toBeAdded } = await getMigrations({
        database: pool,
        emailAndPassword: { enabled: true },
        plugins: [
          admin({ defaultRole: "user", adminRoles: ["admin"] }),
          organization(),
          twoFactor(),
        ],
      });
      expect(toBeCreated).toHaveLength(0);
      expect(toBeAdded).toHaveLength(0);
      // betterAuth() is constructed (not just the config object) so a
      // plugin/schema mismatch that only surfaces at instantiation time
      // (not at getMigrations time) also fails this test.
      betterAuth({
        database: pool,
        emailAndPassword: { enabled: true },
        plugins: [
          admin({ defaultRole: "user", adminRoles: ["admin"] }),
          organization(),
          twoFactor(),
        ],
      });
    } finally {
      await pool.end();
    }
  });
});
