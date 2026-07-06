import messages from "@repo/i18n/messages/en.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApiErrorMessage, useAppMutation } from "./use-app-mutation";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const errorToast = vi.mocked(toast.error);
const successToast = vi.mocked(toast.success);

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const orpcError = (code: string, params: Record<string, unknown> = {}) => ({
  data: { code, params },
});

beforeEach(() => {
  errorToast.mockClear();
  successToast.mockClear();
});

describe("useApiErrorMessage", () => {
  it("localizes a known error code with its params", () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useApiErrorMessage(), {
      wrapper,
    });

    expect(result.current(orpcError("INTERNAL"))).toBe(
      "Something went wrong. Please try again."
    );
    expect(
      result.current(
        orpcError("AUTH_FORBIDDEN", { action: "edit", subject: "project" })
      )
    ).toBe("You are not allowed to edit this project.");
  });
});

describe("useAppMutation optimistic updates", () => {
  it("patches the cache immediately then rolls back and toasts on error", async () => {
    const { queryClient, wrapper } = makeWrapper();
    queryClient.setQueryData(["projects"], { items: [{ id: "1" }] });

    const { result } = renderHook(
      () =>
        useAppMutation<unknown, { name: string }>({
          mutationFn: () => Promise.reject(orpcError("INTERNAL")),
          optimistic: {
            queryKey: ["projects"],
            update: (previous) => {
              const prev = previous as { items: { id: string }[] };
              return { items: [...prev.items, { id: "tmp" }] };
            },
          },
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ name: "x" }).catch(() => {
        // expected rejection
      });
    });

    // Rolled back to the pre-mutation snapshot.
    expect(queryClient.getQueryData(["projects"])).toEqual({
      items: [{ id: "1" }],
    });
    expect(errorToast).toHaveBeenCalledWith(
      "Something went wrong. Please try again."
    );
  });

  it("shows the success toast for the configured feedback key", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useAppMutation<unknown, void>({
          mutationFn: () => Promise.resolve("ok"),
          successMessage: "projectCreated",
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() =>
      expect(successToast).toHaveBeenCalledWith("Project created")
    );
  });
});
