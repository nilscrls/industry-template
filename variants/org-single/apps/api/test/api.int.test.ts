import {
  AuditLog,
  createDataSource,
  createPool,
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
 * Full-stack integration suite: real Postgres + Redis + OpenFGA
 * (Testcontainers), the exact production middleware stack (createApp),
 * HTTP in via supertest.
 *
 * Single-org variant: there is exactly one workspace and every signup
 * auto-joins it (the first signup bootstraps it and becomes owner), so this
 * suite drops the multi-tenant org-creation / cross-org-leak scenarios and
 * asserts the auto-join instead. Kept authz-agnostic (no rbac grants /
 * manager-role snapshots) so it survives both the rbac and rebac scaffolds.
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

// Shared across the ordered tests below: the one auto-joined workspace and
// the first two users who land in it (Alice bootstraps it as owner).
let workspaceId: string;
let alice: ReturnType<typeof request.agent>;
let bob: ReturnType<typeof request.agent>;

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

  it("auto-joins every signup into the single workspace", async () => {
    alice = await signUp("Alice", "alice@example.com");

    // Better-Auth may defer `user.create.after` (which bootstraps the
    // workspace and inserts the membership) until after sign-up's own
    // transaction scope — i.e. after `session.create.before` already read
    // `member` and stamped the session's activeOrganizationId. If that
    // provisioning isn't visible to the very first session, the auth.ts
    // hooks need the fallback documented in D3 (session.create.before
    // provisions inline when it finds no membership). Assert immediately,
    // with no intervening set-active, that the fresh cookie already carries
    // a usable tenant.
    const created = await alice
      .post("/projects")
      .send({ name: "provisioning-check", status: "draft" });
    expect(created.status).toBe(200);
    expect(created.body.organizationId).toBeTruthy();

    const orgs = await alice.get("/auth/organization/list");
    expect(orgs.status).toBe(200);
    expect(orgs.body).toHaveLength(1);
    expect(orgs.body[0].slug).toBe("workspace");
    workspaceId = orgs.body[0].id;
    expect(created.body.organizationId).toBe(workspaceId);

    // Second signup joins the same workspace (as a member, not another org).
    bob = await signUp("Bob", "bob@example.com");
    const bobOrgs = await bob.get("/auth/organization/list");
    expect(bobOrgs.body).toHaveLength(1);
    expect(bobOrgs.body[0].id).toBe(workspaceId);

    // Client-side organization creation is disabled.
    const denied = await bob
      .post("/auth/organization/create")
      .send({ name: "Rogue Org", slug: "rogue-org" });
    expect(denied.status).toBeGreaterThanOrEqual(400);
  });

  it("runs the full project lifecycle with ownership enforcement", async () => {
    // Alice and Bob already share the one workspace (auto-joined above) and
    // their sessions carry activeOrganizationId — no org setup needed.
    const created = await alice
      .post("/projects")
      .send({ name: "Alice's line", status: "active" });
    expect(created.status).toBe(200);
    const projectId: string = created.body.id;
    expect(projectId).toBeTruthy();
    expect(created.body.organizationId).toBe(workspaceId);

    const listed = await alice.get("/projects").query({ search: "Alice" });
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toContain(
      projectId
    );

    // Same workspace: members read everything, mutate only what they own.
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

    // Both share the workspace, but files stay scoped to their owner.
    const carolList = await carol.get("/files");
    expect(carolList.body.items).toHaveLength(1);
    const daveList = await dave.get("/files");
    expect(daveList.body.items).toHaveLength(0);
  });

  it("captures mutations in the audit log, visible to admins per tenant", async () => {
    // Non-admins never read the audit log.
    const deniedRead = await alice.get("/audit-logs");
    expect(deniedRead.status).toBe(403);
    const deniedOrgs = await alice.get("/organizations");
    expect(deniedOrgs.status).toBe(403);

    // Promote a fresh user to admin via db + tuple, as an operator would (db
    // row is the source of truth; the tuple is what fga:sync would derive).
    // Eve auto-joined the workspace at signup, so her session already carries
    // the workspace as the active tenant — no set-active needed.
    await signUp("Eve", "eve@example.com");
    const eveRow = await owner.manager.findOneByOrFail(User, {
      email: "eve@example.com",
    });
    await owner.manager.update(User, { id: eveRow.id }, { role: "admin" });
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
    expect(created.organizationId).toBe(workspaceId);
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

    // The admin org overview lists the one workspace with its member count.
    const organizations = await eveAdmin.get("/organizations");
    expect(organizations.status).toBe(200);
    const workspace = organizations.body.items.find(
      (item: { slug: string }) => item.slug === "workspace"
    );
    expect(workspace).toBeTruthy();
    expect(workspace.memberCount).toBeGreaterThanOrEqual(2);
  });

  it("rejects cross-origin writes and ships hardened headers", async () => {
    const signedIn = request.agent(server);
    await signedIn
      .post("/auth/sign-in/email")
      .send({ email: "alice@example.com", password: "Password123!" });

    // A browser-forged cross-site write carries the attacker's Origin.
    const forged = await signedIn
      .post("/projects")
      .set("Origin", "https://evil.example.com")
      .send({ name: "csrf", status: "draft" });
    expect(forged.status).toBe(403);

    // The web app's own Origin passes.
    const legit = await signedIn
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
    const signedIn = request.agent(server);
    await signedIn
      .post("/auth/sign-in/email")
      .send({ email: "alice@example.com", password: "Password123!" });
    const denied = await signedIn.get("/feature-flags");
    expect(denied.status).toBe(403);

    // Eve is a workspace admin by now — a fresh sign-in activates it directly.
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
    const appUser = createDataSource(process.env.DATABASE_URL as string);
    await appUser.initialize();
    try {
      // No tenant context → the policies match nothing.
      const bare = await appUser.manager.find(Project);
      expect(bare).toHaveLength(0);

      // Tenant context → only that tenant's rows, without any WHERE.
      const scoped = await withTenant(
        appUser,
        { organizationId: workspaceId, userId: null },
        (m) => m.find(Project)
      );
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.every((row) => row.organizationId === workspaceId)).toBe(
        true
      );

      // Cross-tenant writes violate the WITH CHECK clause.
      const [foreign] = scoped;
      if (!foreign) {
        throw new Error("expected a workspace project to exist");
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
    const created = await dana
      .post("/projects")
      .send({ name: "Dana's project", status: "draft" });
    expect(created.status).toBe(200);

    const exported = await dana.get("/me/export");
    expect(exported.status).toBe(200);
    expect(exported.body.user.email).toBe("dana@example.com");
    // Dana auto-joined the workspace as a member (Alice bootstrapped it).
    expect(exported.body.memberships).toContainEqual(
      expect.objectContaining({ organizationId: workspaceId, role: "member" })
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

  it("guards the points wallet against concurrent double-spends", async () => {
    // Crediting needs the `can_manage_wallet` org capability. This suite
    // stays authz-agnostic (it also runs under --authz=rebac, whose model
    // has no manager role), so the creditor is an admin — the one principal
    // that holds the capability in both models.
    await signUp("Grace", "grace@example.com");
    const graceRow = await owner.manager.findOneByOrFail(User, {
      email: "grace@example.com",
    });
    await owner.manager.update(User, { id: graceRow.id }, { role: "admin" });
    await fgaClient().writeTuples([
      { user: ref.user(graceRow.id), relation: "admin", object: ref.system() },
    ]);
    // The signed cookie cache still carries the old role — re-sign-in picks
    // up the promotion (same pattern as the admin test above). Her session
    // already carries the workspace: single-org mode auto-joins at signup,
    // so there is no set-active step.
    const graceAdmin = request.agent(server);
    await graceAdmin
      .post("/auth/sign-in/email")
      .send({ email: "grace@example.com", password: "Password123!" });

    const hank = await signUp("Hank", "hank@example.com");
    const hankRow = await owner.manager.findOneByOrFail(User, {
      email: "hank@example.com",
    });

    // A plain member may not credit — the capability is admin-only here.
    const nonAdminCredit = await hank
      .post("/wallet/credit")
      .send({ userId: hankRow.id, amount: 10, reason: "self-serve" });
    expect(nonAdminCredit.status).toBe(403);

    const credited = await graceAdmin
      .post("/wallet/credit")
      .send({ userId: hankRow.id, amount: 100, reason: "welcome bonus" });
    expect(credited.status).toBe(200);
    expect(credited.body.balance).toBe(100);

    // Ten concurrent spends of 60 against a balance of 100: exactly one can
    // succeed; the row lock + atomic conditional UPDATE serialize the rest
    // into a clean 409, never a negative balance.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        hank.post("/wallet/spend").send({ amount: 60, reason: "spree" })
      )
    );
    const ok = attempts.filter((r) => r.status === 200);
    const conflicts = attempts.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    for (const conflict of conflicts) {
      expect(conflict.body.data.code).toBe("WALLET_INSUFFICIENT_BALANCE");
    }

    const me = await hank.get("/wallet/me");
    expect(me.status).toBe(200);
    expect(me.body.balance).toBe(40);
    expect(me.body.entries).toHaveLength(2);
    for (const entry of me.body.entries) {
      expect(entry.id).toBeTruthy();
    }

    // Zero (and negative) amounts fail contract validation, not the balance
    // check.
    const zeroSpend = await hank
      .post("/wallet/spend")
      .send({ amount: 0, reason: "nothing" });
    expect(zeroSpend.status).toBe(400);
    expect(zeroSpend.body.data.code).toBe("VALIDATION_FAILED");

    // The CHECK constraint is a backstop of last resort, not a user-facing
    // path: an owner-connection write that slips past application logic
    // still can't drive the balance negative.
    const hankWallet = await owner.manager.findOneByOrFail(Wallet, {
      organizationId: workspaceId,
      userId: hankRow.id,
    });
    await expect(
      owner.query('update "wallet" set "balance" = -1 where "id" = $1', [
        hankWallet.id,
      ])
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("blocks account deletion for sole organization owners, then erases", async () => {
    // Alice bootstrapped the workspace and is its sole owner → blocked with
    // an actionable message. The workspace must survive the suite, so we do
    // NOT delete it — a plain member is erased instead.
    const aliceAgent = request.agent(server);
    await aliceAgent
      .post("/auth/sign-in/email")
      .send({ email: "alice@example.com", password: "Password123!" });
    const blocked = await aliceAgent
      .post("/auth/delete-user")
      .send({ password: "Password123!" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/only owner/i);

    // Bob joined as a member, not an owner → erasure goes through.
    const bobAgent = request.agent(server);
    await bobAgent
      .post("/auth/sign-in/email")
      .send({ email: "bob@example.com", password: "Password123!" });
    const deleted = await bobAgent
      .post("/auth/delete-user")
      .send({ password: "Password123!" });
    expect(deleted.status).toBe(200);

    // Session is dead and the account cannot sign in again.
    const afterwards = await bobAgent.get("/projects");
    expect(afterwards.status).toBe(401);
    const signIn = await request(server)
      .post("/auth/sign-in/email")
      .send({ email: "bob@example.com", password: "Password123!" });
    expect(signIn.status).not.toBe(200);

    // The user row is gone; the erasure left an anonymized audit event.
    const users = await owner.manager.find(User, {
      where: { email: "bob@example.com" },
    });
    const events = await owner.manager.find(AuditLog, {
      where: { action: "user.delete" },
    });
    expect(users).toHaveLength(0);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)?.actorId).toBeNull();
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
