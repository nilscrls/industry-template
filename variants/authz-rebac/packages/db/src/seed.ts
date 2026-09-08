/**
 * Baseline seed — intentionally a no-op: the ReBAC rules live in the
 * OpenFGA model (`packages/fga/model.fga`) and membership tuples are
 * created organically (project creation grants `owner`,
 * `PUT /projects/:id/members/:userId` grants the rest). Dev fixtures live
 * in @repo/auth (`seed:dev`); run `pnpm fga:sync` afterwards (the root
 * `pnpm db:seed` chains all three).
 */
function main(): void {
  console.log(
    "Nothing to seed: ReBAC permissions derive from projectMember rows + the FGA model."
  );
}

main();
