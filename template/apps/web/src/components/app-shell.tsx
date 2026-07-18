"use client";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  FolderKanbanIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { OrgSwitcher } from "@/components/org-switcher";
import { authClient } from "@/lib/auth-client";
import { Link, usePathname, useRouter } from "@/lib/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboardIcon },
  { href: "/projects", key: "projects", icon: FolderKanbanIcon },
  { href: "/settings", key: "settings", icon: SettingsIcon },
] as const;

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const t = useTranslations("shell");
  return (
    <Button
      aria-label={t("toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size="icon"
      variant="ghost"
    >
      <SunIcon className="dark:hidden" />
      <MoonIcon className="hidden dark:block" />
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const navItems = [
    ...NAV_ITEMS,
    // Gate by the existing admin role — the API re-checks every endpoint.
    ...(session?.user.role === "admin"
      ? [{ href: "/admin", key: "admin", icon: ShieldIcon } as const]
      : []),
  ];

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    // flex-1 (not min-h-dvh): the root layout owns the viewport height and
    // keeps the global footer at the bottom.
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
          {/* Mobile-first: nav collapses into a menu below sm */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="sm:hidden">
              <Button aria-label={t("openMenu")} size="icon" variant="ghost">
                <MenuIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {navItems.map((item) => (
                <DropdownMenuItem asChild key={item.href}>
                  <Link href={item.href}>{t(`nav.${item.key}`)}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link className="font-semibold" href="/dashboard">
            {t("appName")}
          </Link>

          <nav className="ml-6 hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <Button
                asChild
                key={item.href}
                size="sm"
                variant={pathname.startsWith(item.href) ? "secondary" : "ghost"}
              >
                <Link href={item.href}>
                  <item.icon />
                  {t(`nav.${item.key}`)}
                </Link>
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <OrgSwitcher />
            <LocaleSwitcher />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="max-w-32 truncate" size="sm" variant="ghost">
                  {session?.user.name ?? "…"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="truncate">
                  {session?.user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} variant="destructive">
                  <LogOutIcon />
                  {t("signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
