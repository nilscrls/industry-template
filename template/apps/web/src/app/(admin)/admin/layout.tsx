"use client";

import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";

const ADMIN_NAV = [
  { href: "/admin/organizations", key: "organizations" },
  { href: "/admin/audit", key: "audit" },
  { href: "/admin/flags", key: "flags" },
] as const;

/**
 * UX gate only — every admin endpoint re-checks the ability server-side
 * (@RequireAbility on the controllers). Uses the existing admin role, not a
 * new authz concept.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <AppShell>
        <Skeleton className="h-32 w-full" />
      </AppShell>
    );
  }

  if (session?.user.role !== "admin") {
    return (
      <AppShell>
        <p className="text-muted-foreground text-sm">{t("forbidden")}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-semibold text-2xl">{t("title")}</h1>
          <nav className="ml-auto flex items-center gap-1">
            {ADMIN_NAV.map((item) => (
              <Button
                asChild
                key={item.href}
                size="sm"
                variant={pathname.startsWith(item.href) ? "secondary" : "ghost"}
              >
                <Link href={item.href}>{t(`nav.${item.key}`)}</Link>
              </Button>
            ))}
          </nav>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
