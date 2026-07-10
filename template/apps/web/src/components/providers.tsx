"use client";

import { Toaster } from "@repo/ui/components/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useState } from "react";
import { ConsentProvider } from "@/components/consent";
import { PermissionsProvider } from "@/lib/permissions";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        <ConsentProvider>
          <PermissionsProvider>
            {children}
            <Toaster position="top-center" />
          </PermissionsProvider>
        </ConsentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
