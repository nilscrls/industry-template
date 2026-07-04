import { oc } from "@orpc/contract";
import { apiErrorDataSchema } from "./errors.js";

/**
 * Contract builder with the common error surface. Every procedure inherits
 * these, so clients get typed access to `{ code, params, traceId }` payloads.
 */
export const base = oc.errors({
  UNAUTHORIZED: { data: apiErrorDataSchema },
  FORBIDDEN: { data: apiErrorDataSchema },
  NOT_FOUND: { data: apiErrorDataSchema },
  CONFLICT: { data: apiErrorDataSchema },
  PAYLOAD_TOO_LARGE: { data: apiErrorDataSchema },
  TOO_MANY_REQUESTS: { data: apiErrorDataSchema },
  INTERNAL_SERVER_ERROR: { data: apiErrorDataSchema },
});
