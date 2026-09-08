import { randomUUID } from "node:crypto";
import {
  createDataSource,
  createPool,
  Member,
  Organization,
  Project,
  User,
} from "@repo/db";
import { createAuth } from "./auth.js";

const PASSWORD = "Password123!";
const ORG = { name: "Acme Inc", slug: "acme" } as const;
const FIXTURES = [
  { email: "admin@example.com", name: "Ada Admin", role: "admin" },
  { email: "manager@example.com", name: "Manny Manager", role: "manager" },
  { email: "user@example.com", name: "Uma User", role: "user" },
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
    const userRepo = ds.manager.getRepository(User);
    const orgRepo = ds.manager.getRepository(Organization);
    const memberRepo = ds.manager.getRepository(Member);
    const projectRepo = ds.manager.getRepository(Project);

    for (const fixture of FIXTURES) {
      const existing = await userRepo.findOne({
        where: { email: fixture.email },
      });
      if (!existing) {
        await auth.api.signUpEmail({
          body: {
            email: fixture.email,
            password: PASSWORD,
            name: fixture.name,
          },
        });
      }
      await userRepo.update(
        { email: fixture.email },
        { role: fixture.role, emailVerified: true }
      );
    }

    // One shared demo organization: every fixture user is a member, so all
    // demo data lives in a single tenant out of the box.
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
    const orgId = org.id;
    const allUsers = await userRepo.find({ select: { id: true, email: true } });
    for (const row of allUsers) {
      const existing = await memberRepo.findOne({
        where: { userId: row.id, organizationId: orgId },
      });
      if (!existing) {
        await memberRepo.insert({
          id: randomUUID(),
          organizationId: orgId,
          userId: row.id,
          role: row.email === "admin@example.com" ? "owner" : "member",
        });
      }
    }

    const projectCount = await projectRepo.count();
    if (projectCount === 0) {
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
      await projectRepo.insert(rows);
    }

    console.log("Dev fixtures ready:");
    for (const fixture of FIXTURES) {
      console.log(`  ${fixture.role.padEnd(8)} ${fixture.email} / ${PASSWORD}`);
    }
  } finally {
    await ds.destroy();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
