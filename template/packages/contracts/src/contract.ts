import { populateContractRouterPaths } from "@orpc/contract";
import { auditContract } from "./audit.js";
import { filesContract } from "./files.js";
import { flagsContract } from "./flags.js";
import { organizationsContract } from "./organizations.js";
import { privacyContract } from "./privacy.js";
import { projectsContract } from "./projects.js";
import { meContract, usersContract } from "./users.js";
import { walletContract } from "./wallet.js";

/**
 * The whole API surface. Paths are explicit on every route (required by the
 * NestJS implementation); populateContractRouterPaths fills any future gap.
 */
export const contract = populateContractRouterPaths({
  projects: projectsContract,
  files: filesContract,
  users: usersContract,
  me: meContract,
  privacy: privacyContract,
  audit: auditContract,
  organizations: organizationsContract,
  flags: flagsContract,
  wallet: walletContract,
});

export type AppContract = typeof contract;
