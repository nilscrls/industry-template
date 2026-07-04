import { z } from "zod";

/**
 * Single source of truth for API error codes and their i18n parameters.
 * Each code maps to a translation key (`errors.<code>` in the web app);
 * the zod schema types the interpolation params for that message.
 */
export const errorCatalog = {
  AUTH_UNAUTHORIZED: z.object({}),
  AUTH_FORBIDDEN: z.object({ action: z.string(), subject: z.string() }),
  RESOURCE_NOT_FOUND: z.object({ resource: z.string() }),
  RESOURCE_CONFLICT: z.object({ resource: z.string() }),
  VALIDATION_FAILED: z.object({}),
  FILE_TOO_LARGE: z.object({ maxSizeMb: z.number() }),
  FILE_TYPE_NOT_ALLOWED: z.object({ allowed: z.string() }),
  RATE_LIMITED: z.object({ retryAfterSeconds: z.number() }),
  INTERNAL: z.object({}),
} as const;

export type ErrorCode = keyof typeof errorCatalog;
export type ErrorParams<TCode extends ErrorCode> = z.infer<
  (typeof errorCatalog)[TCode]
>;

export const errorCodes = Object.keys(errorCatalog) as [
  ErrorCode,
  ...ErrorCode[],
];

/** Wire shape every API error serializes to — consumed by the web error hook. */
export const apiErrorDataSchema = z.object({
  code: z.enum(errorCodes),
  params: z.record(z.string(), z.unknown()).default({}),
  traceId: z.string().optional(),
});

export type ApiErrorData = z.infer<typeof apiErrorDataSchema>;

/** Build a validated, typed error payload (throw side lives in the api app). */
export function errorData<TCode extends ErrorCode>(
  code: TCode,
  params: ErrorParams<TCode>,
  traceId?: string
): ApiErrorData {
  // Enforce the per-code params schema at runtime, not just in types.
  const validated = errorCatalog[code].parse(params);
  return apiErrorDataSchema.parse({ code, params: validated, traceId });
}

export function isApiErrorData(value: unknown): value is ApiErrorData {
  return apiErrorDataSchema.safeParse(value).success;
}
