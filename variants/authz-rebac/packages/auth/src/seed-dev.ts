import { createDb, project, projectMember, user } from "@repo/db";
import { count, eq } from "drizzle-orm";
import { createAuth } from "./auth.js";

const PASSWORD = "Password123!";
const FIXTURES = [
  { email: "admin@example.com", name: "Ada Admin", role: "admin" },
  { email: "manager@example.com", name: "Manny Manager", role: "member" },
  { email: "member@example.com", name: "Mia Member", role: "member" },
] as const;

type Db = ReturnType<typeof createDb>["db"];
type Auth = ReturnType<typeof createAuth>;

function requireEnv(): {
  connectionString: string;
  secret: string;
  webUrl: string;
} {
  const connectionString = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const webUrl = process.env.WEB_URL;
  if (connectionString && secret && webUrl) {
    return { connectionString, secret, webUrl };
  }
  const missing = Object.entries({
    DATABASE_URL: connectionString,
    BETTER_AUTH_SECRET: secret,
    WEB_URL: webUrl,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  console.error(`Missing env: ${missing.join(", ")} — declare them in .env`);
  process.exit(1);
}

async function ensureUsers(db: Db, auth: Auth): Promise<void> {
  for (const fixture of FIXTURES) {
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, fixture.email));
    if (existing.length === 0) {
      await auth.api.signUpEmail({
        body: { email: fixture.email, password: PASSWORD, name: fixture.name },
      });
    }
    await db
      .update(user)
      .set({ role: fixture.role, emailVerified: true })
      .where(eq(user.email, fixture.email));
  }
}

async function seedProject(
  db: Db,
  owner: { id: string },
  other: { id: string } | undefined,
  status: "draft" | "active" | "archived",
  ownerIndex: number,
  statusIndex: number
): Promise<void> {
  const daysAgo = ownerIndex * 4 + statusIndex * 2;
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const [created] = await db
    .insert(project)
    .values({
      name: `Demo ${status} project ${ownerIndex + 1}.${statusIndex + 1}`,
      description: "Seeded demo data — safe to delete.",
      status,
      ownerId: owner.id,
      createdAt,
      updatedAt: createdAt,
    })
    .returning();
  if (!created) {
    return;
  }
  // ReBAC: the owner relation is the grant, not the ownerId column.
  await db.insert(projectMember).values({
    projectId: created.id,
    userId: owner.id,
    relation: "owner",
  });
  // Cross-membership demos: the other member gets editor access to the
  // first project, viewer access to the second.
  if (other && statusIndex === 0) {
    await db.insert(projectMember).values({
      projectId: created.id,
      userId: other.id,
      relation: "editor",
    });
  }
  if (other && statusIndex === 1) {
    await db.insert(projectMember).values({
      projectId: created.id,
      userId: other.id,
      relation: "viewer",
    });
  }
}

async function seedProjects(db: Db): Promise<void> {
  const [projectCount] = await db.select({ value: count() }).from(project);
  if (!projectCount || projectCount.value > 0) {
    return;
  }
  const members = await db
    .select({ id: user.id, email: user.email })
    .from(user);
  const owners = members.filter((row) => row.email !== "admin@example.com");
  const statuses = ["draft", "active", "active", "archived"] as const;
  for (const [ownerIndex, owner] of owners.entries()) {
    const other = owners.find((row) => row.id !== owner.id);
    for (const [statusIndex, status] of statuses.entries()) {
      await seedProject(db, owner, other, status, ownerIndex, statusIndex);
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
  const { db, pool } = createDb(connectionString);
  const auth = createAuth({
    db,
    secret,
    baseUrl: `${webUrl}/api/auth`,
    trustedOrigins: [webUrl],
    sendEmail: () => Promise.resolve(),
  });

  try {
    await ensureUsers(db, auth);
    await seedProjects(db);

    console.log("Dev fixtures ready (ReBAC: grants via project_member):");
    for (const fixture of FIXTURES) {
      console.log(`  ${fixture.role.padEnd(8)} ${fixture.email} / ${PASSWORD}`);
    }
    console.log(
      "  cross-grants: each member is editor/viewer on one of the other's projects"
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
