"use client";

import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@repo/i18n";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import {
  FolderKanbanIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SunIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { OrgSwitcher } from "@/components/org-switcher";

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

function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("shell");

  function setLocale(next: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: single first-party preference cookie
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={t("changeLocale")} size="icon" variant="ghost" />
        }
      >
        <GlobeIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((candidate) => (
          <DropdownMenuItem
            className={cn(candidate === locale && "font-semibold")}
            key={candidate}
            onClick={() => setLocale(candidate)}
          >
            {t(`locales.${candidate}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
          {/* Mobile-first: nav collapses into a menu below sm */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="sm:hidden"
              render={
                <Button
                  aria-label={t("openMenu")}
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <MenuIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {navItems.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  render={<Link href={item.href} />}
                >
                  {t(`nav.${item.key}`)}
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
                key={item.href}
                nativeButton={false}
                render={<Link href={item.href} />}
                size="sm"
                variant={pathname.startsWith(item.href) ? "secondary" : "ghost"}
              >
                <item.icon />
                {t(`nav.${item.key}`)}
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <OrgSwitcher />
            <LocaleSwitcher />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    className="max-w-32 truncate"
                    size="sm"
                    variant="ghost"
                  />
                }
              >
                {session?.user.name ?? "…"}
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
