import { ORPCError } from "@orpc/nest";
import { errorData, isApiErrorData } from "@repo/contracts";
import { currentRequestId } from "./request-context";

/**
 * oRPC serializes anything thrown INSIDE a handler itself — the global
 * exception filter only sees what is thrown around them (guards, middleware,
 * plain Nest routes). Its own input-validation failure carries raw zod issues
 * instead of the contract's `{ code, params, traceId }` payload, which the web
 * client would degrade to a generic INTERNAL message. Re-wrap it as the typed
 * VALIDATION_FAILED so a rejected payload reads the same on the wire wherever
 * it originated. Errors raised through `appError` already carry that payload
 * and pass through untouched.
 */
export async function validationErrorInterceptor<T>({
  next,
}: {
  next: () => Promise<T>;
}): Promise<T> {
  try {
    return await next();
  } catch (error) {
    if (
      error instanceof ORPCError &&
      error.code === "BAD_REQUEST" &&
      !isApiErrorData(error.data)
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: error.message,
        data: errorData("VALIDATION_FAILED", {}, currentRequestId()),
        cause: error,
      });
    }
    throw error;
  }
}
