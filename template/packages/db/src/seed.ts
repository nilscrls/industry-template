/**
 * Baseline seed — intentionally a no-op: role baselines live in the OpenFGA
 * model (`packages/fga/model.fga`), not in database rows. Dev fixtures live
 * in @repo/auth (`seed:dev`); run `pnpm fga:sync` afterwards so the FGA
 * store mirrors the database (the root `pnpm db:seed` chains all three).
 */
function main(): void {
  console.log("No database-side permission baseline to seed (OpenFGA owns it)");
}

main();
