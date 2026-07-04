import { isApiErrorData, type ApiErrorData } from "@repo/contracts";

/**
 * Normalize anything a query/mutation can throw into the API error contract.
 * oRPC errors carry `data` (set by the api's appError helper); anything else
 * (network failure, bug) degrades to INTERNAL.
 */
export function extractApiError(error: unknown): ApiErrorData {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data: unknown }).data;
    if (isApiErrorData(data)) {
      return data;
    }
  }
  return { code: "INTERNAL", params: {} };
}
