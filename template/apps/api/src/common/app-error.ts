import { ORPCError } from "@orpc/nest";
import { type ErrorCode, type ErrorParams, errorData } from "@repo/contracts";

const CODE_TO_HTTP: Record<ErrorCode, string> = {
  AUTH_UNAUTHORIZED: "UNAUTHORIZED",
  AUTH_FORBIDDEN: "FORBIDDEN",
  RESOURCE_NOT_FOUND: "NOT_FOUND",
  RESOURCE_CONFLICT: "CONFLICT",
  VALIDATION_FAILED: "BAD_REQUEST",
  FILE_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  FILE_TYPE_NOT_ALLOWED: "BAD_REQUEST",
  RATE_LIMITED: "TOO_MANY_REQUESTS",
  WALLET_INSUFFICIENT_BALANCE: "CONFLICT",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

/**
 * The one way to fail a request. Serializes to the contract's error shape
 * ({ code, params, traceId }) whether it bubbles through an oRPC handler or
 * the global exception filter.
 */
export function appError<TCode extends ErrorCode>(
  code: TCode,
  params: ErrorParams<TCode>,
  traceId?: string
): ORPCError<string, unknown> {
  return new ORPCError(CODE_TO_HTTP[code], {
    data: errorData(code, params, traceId),
  });
}

export function notFound(resource: string): ORPCError<string, unknown> {
  return appError("RESOURCE_NOT_FOUND", { resource });
}

export function forbidden(
  action: string,
  subject: string
): ORPCError<string, unknown> {
  return appError("AUTH_FORBIDDEN", { action, subject });
}

export function insufficientBalance(
  balance: number,
  requested: number
): ORPCError<string, unknown> {
  return appError("WALLET_INSUFFICIENT_BALANCE", { balance, requested });
}
