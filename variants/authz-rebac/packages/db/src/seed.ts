/**
 * Baseline seed — safe to run in every environment. The ReBAC model has no
 * permission baseline to persist: baseline + admin rules live in
 * @repo/contracts and membership tuples are created organically (project
 * creation grants `owner`, `PUT /projects/:id/members/:userId` grants the
 * rest). Dev fixtures live in @repo/auth (`seed:dev`).
 */
function main(): void {
  console.log(
    "Nothing to seed: ReBAC permissions derive from project_member rows."
  );
}

main();
