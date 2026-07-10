import { readFileSync } from "node:fs";
import path from "node:path";
import type { WriteAuthorizationModelRequest } from "@openfga/sdk";
import { transformer } from "@openfga/syntax-transformer";

/**
 * The authorization model, authored as human-readable DSL in `model.fga`
 * (package root) and transformed to the API's JSON shape here.
 */
export function loadModelDsl(): string {
  // biome-ignore lint/correctness/noGlobalDirnameFilename: compiles to CJS, where __dirname is correct
  return readFileSync(path.join(__dirname, "..", "model.fga"), "utf8");
}

export function loadModelJson(): WriteAuthorizationModelRequest {
  return transformer.transformDSLToJSONObject(
    loadModelDsl()
  ) as WriteAuthorizationModelRequest;
}

/** Object-reference helpers so tuple strings are built in exactly one place. */
export const ref = {
  user: (userId: string) => `user:${userId}`,
  org: (organizationId: string) => `org:${organizationId}`,
  system: () => "system:global",
  project: (projectId: string) => `project:${projectId}`,
  file: (fileId: string) => `file:${fileId}`,
};
