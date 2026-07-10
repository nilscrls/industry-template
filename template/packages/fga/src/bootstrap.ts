import { createFgaClient } from "./client.js";
import { loadModelJson } from "./model.js";

const STORE_NAME = "industry-app";

/**
 * Idempotent store + model bootstrap:
 * - finds (or creates) the store by name and prints its id — copy it into
 *   `.env` as FGA_STORE_ID on first run;
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
    console.log(
      `→ set FGA_STORE_ID=${store.id} in .env (current: ${process.env.FGA_STORE_ID || "<unset>"})`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
