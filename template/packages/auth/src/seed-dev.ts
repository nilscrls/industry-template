import { createDb, project, user } from "@repo/db";
import { count, eq } from "drizzle-orm";
import { createAuth } from "./auth.js";

/** Dev fixtures — refuses to run in production. Idempotent. */
if (process.env.NODE_ENV === "production") {
  console.log("seed:dev skipped (NODE_ENV=production)");
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const PASSWORD = "Password123!";
const FIXTURES = [
  { email: "admin@example.com", name: "Ada Admin", role: "admin" },
  { email: "manager@example.com", name: "Manny Manager", role: "manager" },
  { email: "member@example.com", name: "Mia Member", role: "member" },
] as const;

const { db, pool } = createDb(connectionString);
const auth = createAuth({
  db,
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-seed-secret",
  baseUrl: process.env.WEB_URL ? `${process.env.WEB_URL}/api` : "http://localhost:3000/api",
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:3000"],
  sendEmail: () => Promise.resolve(),
});

try {
  for (const fixture of FIXTURES) {
    const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, fixture.email));
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

  const [projectCount] = await db.select({ value: count() }).from(project);
  if (projectCount && projectCount.value === 0) {
    const members = await db.select({ id: user.id, email: user.email }).from(user);
    const owners = members.filter((row) => row.email !== "admin@example.com");
    const statuses = ["draft", "active", "active", "archived"] as const;
    const rows = owners.flatMap((owner, ownerIndex) =>
      statuses.map((status, statusIndex) => {
        const daysAgo = ownerIndex * 4 + statusIndex * 2;
        const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        return {
          name: `Demo ${status} project ${ownerIndex + 1}.${statusIndex + 1}`,
          description: "Seeded demo data — safe to delete.",
          status,
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
