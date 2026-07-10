"use client";

import { Toaster } from "@repo/ui/components/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useState } from "react";
import { ConsentProvider } from "@/components/consent";
import { AbilityProvider } from "@/lib/ability";

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
          <AbilityProvider>
            {children}
            <Toaster position="top-center" />
          </AbilityProvider>
        </ConsentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
