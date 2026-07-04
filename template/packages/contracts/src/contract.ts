import { populateContractRouterPaths } from "@orpc/contract";
import { filesContract } from "./files.js";
import { projectsContract } from "./projects.js";
import { meContract, usersContract } from "./users.js";

/**
 * The whole API surface. Paths are explicit on every route (required by the
 * NestJS implementation); populateContractRouterPaths fills any future gap.
 */
export const contract = populateContractRouterPaths({
  projects: projectsContract,
  files: filesContract,
  users: usersContract,
  me: meContract,
});

export type AppContract = typeof contract;
