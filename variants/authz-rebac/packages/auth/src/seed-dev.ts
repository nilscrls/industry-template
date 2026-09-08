import { randomUUID } from "node:crypto";
import {
  createDataSource,
  createPool,
  Member,
  Organization,
  Project,
  ProjectMember,
  User,
} from "@repo/db";
import type { DataSource } from "typeorm";
import { createAuth } from "./auth.js";

const PASSWORD = "Password123!";
const ORG = { name: "Acme Inc", slug: "acme" } as const;
const FIXTURES = [
  { email: "admin@example.com", name: "Ada Admin", role: "admin" },
  { email: "manager@example.com", name: "Manny Manager", role: "user" },
  { email: "user@example.com", name: "Uma User", role: "user" },
] as const;

type Auth = ReturnType<typeof createAuth>;

function requireEnv(): {
  connectionString: string;
  secret: string;
  webUrl: string;
} {
  // Owner connection: seeds cross tenants and bypass RLS (app_user is not
  // BYPASSRLS, so seeding through it fails on every RLS-protected insert).
  const connectionString =
    process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const webUrl = process.env.WEB_URL;
  if (connectionString && secret && webUrl) {
    return { connectionString, secret, webUrl };
  }
  const missing = Object.entries({
    DATABASE_URL_MIGRATIONS: connectionString,
    BETTER_AUTH_SECRET: secret,
    WEB_URL: webUrl,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  console.error(`Missing env: ${missing.join(", ")} — declare them in .env`);
  process.exit(1);
}

async function ensureUsers(ds: DataSource, auth: Auth): Promise<void> {
  const userRepo = ds.manager.getRepository(User);
  for (const fixture of FIXTURES) {
    const existing = await userRepo.findOne({
      where: { email: fixture.email },
    });
    if (!existing) {
      await auth.api.signUpEmail({
        body: { email: fixture.email, password: PASSWORD, name: fixture.name },
      });
    }
    await userRepo.update(
      { email: fixture.email },
      { role: fixture.role, emailVerified: true }
    );
  }
}

/** One shared demo organization: all fixtures and demo data in one tenant. */
async function ensureOrganization(ds: DataSource): Promise<string> {
  const orgRepo = ds.manager.getRepository(Organization);
  const memberRepo = ds.manager.getRepository(Member);
  const userRepo = ds.manager.getRepository(User);

  let org = await orgRepo.findOne({ where: { slug: ORG.slug } });
  if (!org) {
    // Adopt the earliest organization if one already exists — the
    // single-org variant bootstraps the workspace on first signup.
    org = await orgRepo
      .createQueryBuilder("organization")
      .orderBy("organization.createdAt", "ASC")
      .limit(1)
      .getOne();
  }
  if (!org) {
    org = await orgRepo.save(
      orgRepo.create({ id: randomUUID(), name: ORG.name, slug: ORG.slug })
    );
  }
  if (!org) {
    throw new Error("Failed to seed the demo organization");
  }
  const allUsers = await userRepo.find({ select: { id: true, email: true } });
  for (const row of allUsers) {
    const existing = await memberRepo.findOne({
      where: { userId: row.id, organizationId: org.id },
    });
    if (!existing) {
      await memberRepo.insert({
        id: randomUUID(),
        organizationId: org.id,
        userId: row.id,
        role: row.email === "admin@example.com" ? "owner" : "member",
      });
    }
  }
  return org.id;
}

async function seedProject(
  ds: DataSource,
  orgId: string,
  owner: { id: string },
  other: { id: string } | undefined,
  status: "draft" | "active" | "archived",
  ownerIndex: number,
  statusIndex: number
): Promise<void> {
  const daysAgo = ownerIndex * 4 + statusIndex * 2;
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const projectRepo = ds.manager.getRepository(Project);
  const projectMemberRepo = ds.manager.getRepository(ProjectMember);
  const created = await projectRepo.save(
    projectRepo.create({
      name: `Demo ${status} project ${ownerIndex + 1}.${statusIndex + 1}`,
      description: "Seeded demo data — safe to delete.",
      status,
      organizationId: orgId,
      ownerId: owner.id,
      createdAt,
      updatedAt: createdAt,
    })
  );
  if (!created) {
    return;
  }
  // ReBAC: the owner relation is the grant, not the ownerId column.
  await projectMemberRepo.insert({
    projectId: created.id,
    userId: owner.id,
    relation: "owner",
  });
  // Cross-membership demos: the other member gets editor access to the
  // first project, viewer access to the second.
  if (other && statusIndex === 0) {
    await projectMemberRepo.insert({
      projectId: created.id,
      userId: other.id,
      relation: "editor",
    });
  }
  if (other && statusIndex === 1) {
    await projectMemberRepo.insert({
      projectId: created.id,
      userId: other.id,
      relation: "viewer",
    });
  }
}

async function seedProjects(ds: DataSource, orgId: string): Promise<void> {
  const projectRepo = ds.manager.getRepository(Project);
  const userRepo = ds.manager.getRepository(User);
  const projectCount = await projectRepo.count();
  if (projectCount > 0) {
    return;
  }
  const members = await userRepo.find({ select: { id: true, email: true } });
  const owners = members.filter((row) => row.email !== "admin@example.com");
  const statuses = ["draft", "active", "active", "archived"] as const;
  for (const [ownerIndex, owner] of owners.entries()) {
    const other = owners.find((row) => row.id !== owner.id);
    for (const [statusIndex, status] of statuses.entries()) {
      await seedProject(
        ds,
        orgId,
        owner,
        other,
        status,
        ownerIndex,
        statusIndex
      );
    }
  }
}

/** Dev fixtures — refuses to run in production. Idempotent. */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.log("seed:dev skipped (NODE_ENV=production)");
    return;
  }

  const { connectionString, secret, webUrl } = requireEnv();
  const ds = createDataSource(connectionString);
  const pool = createPool(connectionString);
  await ds.initialize();
  const auth = createAuth({
    pool,
    secret,
    baseUrl: `${webUrl}/api/auth`,
    trustedOrigins: [webUrl],
    sendEmail: () => Promise.resolve(),
  });

  try {
    await ensureUsers(ds, auth);
    const orgId = await ensureOrganization(ds);
    await seedProjects(ds, orgId);

    console.log("Dev fixtures ready (ReBAC: grants via projectMember):");
    for (const fixture of FIXTURES) {
      console.log(`  ${fixture.role.padEnd(8)} ${fixture.email} / ${PASSWORD}`);
    }
    console.log(
      "  cross-grants: each member is editor/viewer on one of the other's projects"
    );
  } finally {
    await ds.destroy();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
