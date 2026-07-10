import { randomUUID } from "node:crypto";
import { createDb, member, organization, project, user } from "@repo/db";
import { and, count, eq } from "drizzle-orm";
import { createAuth } from "./auth.js";

const PASSWORD = "Password123!";
const ORG = { name: "Acme Inc", slug: "acme" } as const;
const FIXTURES = [
  { email: "admin@example.com", name: "Ada Admin", role: "admin" },
  { email: "manager@example.com", name: "Manny Manager", role: "manager" },
  { email: "member@example.com", name: "Mia Member", role: "member" },
] as const;

/** Dev fixtures — refuses to run in production. Idempotent. */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.log("seed:dev skipped (NODE_ENV=production)");
    return;
  }

  // Owner connection: seeds cross tenants and bypass RLS.
  const connectionString =
    process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const webUrl = process.env.WEB_URL;
  if (!(connectionString && secret && webUrl)) {
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

  const { db, pool } = createDb(connectionString);
  const auth = createAuth({
    db,
    secret,
    baseUrl: `${webUrl}/api/auth`,
    trustedOrigins: [webUrl],
    sendEmail: () => Promise.resolve(),
  });

  try {
    for (const fixture of FIXTURES) {
      const existing = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, fixture.email));
      if (existing.length === 0) {
        await auth.api.signUpEmail({
          body: {
            email: fixture.email,
            password: PASSWORD,
            name: fixture.name,
          },
        });
      }
      await db
        .update(user)
        .set({ role: fixture.role, emailVerified: true })
        .where(eq(user.email, fixture.email));
    }

    // One shared demo organization: every fixture user is a member, so all
    // demo data lives in a single tenant out of the box.
    let [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, ORG.slug));
    if (!org) {
      [org] = await db
        .insert(organization)
        .values({ id: randomUUID(), name: ORG.name, slug: ORG.slug })
        .returning({ id: organization.id });
    }
    if (!org) {
      throw new Error("Failed to seed the demo organization");
    }
    const orgId = org.id;
    const allUsers = await db
      .select({ id: user.id, email: user.email })
      .from(user);
    for (const row of allUsers) {
      const existing = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(eq(member.userId, row.id), eq(member.organizationId, orgId))
        );
      if (existing.length === 0) {
        await db.insert(member).values({
          id: randomUUID(),
          organizationId: orgId,
          userId: row.id,
          role: row.email === "admin@example.com" ? "owner" : "member",
        });
      }
    }

    const [projectCount] = await db.select({ value: count() }).from(project);
    if (projectCount && projectCount.value === 0) {
      const owners = allUsers.filter(
        (row) => row.email !== "admin@example.com"
      );
      const statuses = ["draft", "active", "active", "archived"] as const;
      const rows = owners.flatMap((owner, ownerIndex) =>
        statuses.map((status, statusIndex) => {
          const daysAgo = ownerIndex * 4 + statusIndex * 2;
          const createdAt = new Date(
            Date.now() - daysAgo * 24 * 60 * 60 * 1000
          );
          return {
            name: `Demo ${status} project ${ownerIndex + 1}.${statusIndex + 1}`,
            description: "Seeded demo data — safe to delete.",
            status,
            organizationId: orgId,
            ownerId: owner.id,
            createdAt,
            updatedAt: createdAt,
          };
        })
      );
      await db.insert(project).values(rows);
    }

    console.log("Dev fixtures ready:");
    for (const fixture of FIXTURES) {
      console.log(`  ${fixture.role.padEnd(8)} ${fixture.email} / ${PASSWORD}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
