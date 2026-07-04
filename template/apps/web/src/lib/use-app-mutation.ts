"use client";

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { extractApiError } from "./errors";

type OptimisticConfig<TVariables> = {
  /** Queries to snapshot, patch immediately, and roll back on error. */
  queryKey: QueryKey;
  update: (previous: unknown, variables: TVariables) => unknown;
};

type AppMutationOptions<TData, TVariables> = UseMutationOptions<TData, unknown, TVariables, { snapshots?: Array<[QueryKey, unknown]> }> & {
  /** i18n key under `feedback.` shown as a success toast. */
  successMessage?: string;
  /** For mutations that almost never fail: patch the cache before the server answers. */
  optimistic?: OptimisticConfig<TVariables>;
};

/** Localized error code lookup for anything a query/mutation throws. */
export function useApiErrorMessage(): (error: unknown) => string {
  const t = useTranslations("errors");
  return (error: unknown) => {
    const { code, params } = extractApiError(error);
    return t(code, params as Record<string, string | number>);
  };
}

/**
 * useMutation + action feedback: optional optimistic cache patch with
 * rollback, localized error toasts, success toast, and invalidation.
 */
export function useAppMutation<TData, TVariables>(
  options: AppMutationOptions<TData, TVariables>
) {
  const queryClient = useQueryClient();
  const t = useTranslations("feedback");
  const errorMessage = useApiErrorMessage();
  const { successMessage, optimistic, ...mutationOptions } = options;

  return useMutation<TData, unknown, TVariables, { snapshots?: Array<[QueryKey, unknown]> }>({
    ...mutationOptions,
    onMutate: async (variables) => {
      if (!optimistic) {
        return await mutationOptions.onMutate?.(variables);
      }
      await queryClient.cancelQueries({ queryKey: optimistic.queryKey });
      const snapshots = queryClient.getQueriesData({ queryKey: optimistic.queryKey });
      queryClient.setQueriesData({ queryKey: optimistic.queryKey }, (previous: unknown) =>
        optimistic.update(previous, variables)
      );
      return { snapshots };
    },
    onError: (error, variables, context) => {
      if (context?.snapshots) {
        for (const [key, value] of context.snapshots) {
          queryClient.setQueryData(key, value);
        }
      }
      toast.error(errorMessage(error));
      mutationOptions.onError?.(error, variables, context);
    },
    onSuccess: (data, variables, context) => {
      if (successMessage) {
        toast.success(t(successMessage));
      }
      mutationOptions.onSuccess?.(data, variables, context);
    },
    onSettled: (data, error, variables, context) => {
      if (optimistic) {
        void queryClient.invalidateQueries({ queryKey: optimistic.queryKey });
      }
      mutationOptions.onSettled?.(data, error, variables, context);
    },
  });
}
