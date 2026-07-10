import type { TupleKey } from "@openfga/sdk";
import {
  createDb,
  fileObject,
  member,
  organization,
  project,
  user,
} from "@repo/db";
import { createFgaClient, type OpenFgaClient } from "./client.js";
import { ref } from "./model.js";

/**
 * Full reconciliation: Postgres is the source of truth, the FGA store a
 * derived index. Rebuilds every STRUCTURAL tuple (roles, org membership,
 * resource ownership) from the database; PRESERVES grant tuples
 * (granted_* / denied_*), which live only in FGA (managed through the
 * admin grants endpoints).
 *
 * Run whenever drift is suspected (e.g. after a failed post-commit tuple
 * write): pnpm fga:sync
 */

/** Relations derived from the database — rewritten wholesale by the sync. */
const DERIVED_RELATIONS = new Set([
  "admin",
  "manager",
  "member",
  "system",
  "org",
  "owner",
]);

const WRITE_CHUNK = 50;

function tupleId(tuple: TupleKey): string {
  return `${tuple.user}|${tuple.relation}|${tuple.object}`;
}

async function readAllTuples(client: OpenFgaClient): Promise<TupleKey[]> {
  const tuples: TupleKey[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.read(
      {},
      continuationToken ? { continuationToken } : {}
    );
    tuples.push(...page.tuples.map((tuple) => tuple.key));
    continuationToken = page.continuation_token || undefined;
  } while (continuationToken);
  return tuples;
}

async function desiredTuples(databaseUrl: string): Promise<TupleKey[]> {
  const { db, pool } = createDb(databaseUrl);
  try {
    const [users, orgs, members, projects, files] = await Promise.all([
      db.select({ id: user.id, role: user.role }).from(user),
      db.select({ id: organization.id }).from(organization),
      db
        .select({
          organizationId: member.organizationId,
          userId: member.userId,
        })
        .from(member),
      db
        .select({
          id: project.id,
          organizationId: project.organizationId,
          ownerId: project.ownerId,
        })
        .from(project),
      db
        .select({
          id: fileObject.id,
          organizationId: fileObject.organizationId,
          ownerId: fileObject.ownerId,
        })
        .from(fileObject),
    ]);

    const tuples: TupleKey[] = [];
    for (const row of users) {
      if (row.role === "admin" || row.role === "manager") {
        tuples.push({
          user: ref.user(row.id),
          relation: row.role,
          object: ref.system(),
        });
      }
    }
    for (const org of orgs) {
      tuples.push({
        user: ref.system(),
        relation: "system",
        object: ref.org(org.id),
      });
    }
    for (const row of members) {
      tuples.push({
        user: ref.user(row.userId),
        relation: "member",
        object: ref.org(row.organizationId),
      });
    }
    for (const row of projects) {
      tuples.push(
        {
          user: ref.org(row.organizationId),
          relation: "org",
          object: ref.project(row.id),
        },
        {
          user: ref.user(row.ownerId),
          relation: "owner",
          object: ref.project(row.id),
        }
      );
    }
    for (const row of files) {
      tuples.push(
        {
          user: ref.org(row.organizationId),
          relation: "org",
          object: ref.file(row.id),
        },
        {
          user: ref.user(row.ownerId),
          relation: "owner",
          object: ref.file(row.id),
        }
      );
    }
    return tuples;
  } finally {
    await pool.end();
  }
}

async function writeChunked(
  client: OpenFgaClient,
  writes: TupleKey[],
  deletes: TupleKey[]
): Promise<void> {
  for (let index = 0; index < writes.length; index += WRITE_CHUNK) {
    await client.writeTuples(writes.slice(index, index + WRITE_CHUNK));
  }
  for (let index = 0; index < deletes.length; index += WRITE_CHUNK) {
    await client.deleteTuples(deletes.slice(index, index + WRITE_CHUNK));
  }
}

export async function syncTuples(options: {
  client: OpenFgaClient;
  databaseUrl: string;
}): Promise<{ deleted: number; written: number }> {
  const [current, desired] = await Promise.all([
    readAllTuples(options.client),
    desiredTuples(options.databaseUrl),
  ]);

  const currentDerived = current.filter((tuple) =>
    DERIVED_RELATIONS.has(tuple.relation)
  );
  const desiredIds = new Set(desired.map(tupleId));
  const currentIds = new Set(currentDerived.map(tupleId));

  const writes = desired.filter((tuple) => !currentIds.has(tupleId(tuple)));
  const deletes = currentDerived.filter(
    (tuple) => !desiredIds.has(tupleId(tuple))
  );
  await writeChunked(options.client, writes, deletes);
  return { written: writes.length, deleted: deletes.length };
}

async function main(): Promise<void> {
  const apiUrl = process.env.FGA_API_URL;
  const apiToken = process.env.FGA_API_TOKEN;
  const storeId = process.env.FGA_STORE_ID;
  // Owner connection: the sync legitimately reads every tenant's rows.
  const databaseUrl =
    process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!(apiUrl && apiToken && storeId && databaseUrl)) {
    console.error(
      "FGA_API_URL / FGA_API_TOKEN / FGA_STORE_ID / DATABASE_URL_MIGRATIONS are not set"
    );
    process.exit(1);
  }
  const client = createFgaClient({ apiUrl, apiToken, storeId });
  const { written, deleted } = await syncTuples({ client, databaseUrl });
  console.log(`FGA tuples reconciled: +${written} / -${deleted}`);
}

// tsx runs this file directly; the api imports syncTuples for tests.
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
