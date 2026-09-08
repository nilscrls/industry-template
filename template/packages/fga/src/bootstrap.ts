import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createFgaClient } from "./client.js";
import { loadModelJson } from "./model.js";

const STORE_ID_LINE = /^FGA_STORE_ID=.*$/m;

const STORE_NAME = "industry-app";

/**
 * Idempotent store + model bootstrap:
 * - finds (or creates) the store by name and persists its id as
 *   FGA_STORE_ID in the repo-root `.env` (printed instead when there is no
 *   `.env`, e.g. in CI where the variable is injected);
 * - writes the current authorization model (a no-op version-wise if the
 *   model is unchanged: OpenFGA models are immutable, a new id is created
 *   per write — unpinned clients always use the latest).
 *
 * Run after `pnpm compose:dev` and whenever `model.fga` changes:
 *   pnpm fga:bootstrap
 */
async function main(): Promise<void> {
  const apiUrl = process.env.FGA_API_URL;
  const apiToken = process.env.FGA_API_TOKEN;
  if (!(apiUrl && apiToken)) {
    console.error(
      "FGA_API_URL / FGA_API_TOKEN are not set — declare them in .env"
    );
    process.exit(1);
  }

  const admin = createFgaClient({ apiUrl, apiToken });
  const { stores } = await admin.listStores();
  let store = stores?.find((candidate) => candidate.name === STORE_NAME);
  if (!store) {
    store = await admin.createStore({ name: STORE_NAME });
    console.log(`Created FGA store "${STORE_NAME}" (${store.id})`);
  }

  const client = createFgaClient({ apiUrl, apiToken, storeId: store.id });
  const { authorization_model_id: modelId } =
    await client.writeAuthorizationModel(loadModelJson());

  console.log(`FGA_STORE_ID=${store.id}`);
  console.log(`Wrote authorization model ${modelId}`);
  if (process.env.FGA_STORE_ID !== store.id) {
    persistStoreId(store.id);
  }
}

/**
 * Write FGA_STORE_ID into the repo-root `.env` so `pnpm db:seed` and
 * `pnpm dev` (both dotenv-wrapped) pick it up without a manual paste.
 * Replaces an existing `FGA_STORE_ID=` line, appends one otherwise.
 */
function persistStoreId(storeId: string): void {
  // biome-ignore lint/correctness/noGlobalDirnameFilename: this package compiles to CJS; src/ and dist/ are both one level below packages/fga
  const envPath = path.resolve(__dirname, "..", "..", "..", ".env");
  if (!existsSync(envPath)) {
    console.log(
      `→ no .env at ${envPath}: set FGA_STORE_ID=${storeId} in your environment`
    );
    return;
  }
  const current = readFileSync(envPath, "utf8");
  const line = `FGA_STORE_ID=${storeId}`;
  const next = STORE_ID_LINE.test(current)
    ? current.replace(STORE_ID_LINE, line)
    : `${current.endsWith("\n") ? current : `${current}\n`}${line}\n`;
  writeFileSync(envPath, next);
  console.log(`→ wrote ${line} to .env`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
