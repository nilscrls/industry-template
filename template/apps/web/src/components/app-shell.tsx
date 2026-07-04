"use client";

import { GlobeIcon, LayoutDashboardIcon, FolderKanbanIcon, LogOutIcon, MenuIcon, MoonIcon, SunIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/i18n/request";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboardIcon },
  { href: "/projects", key: "projects", icon: FolderKanbanIcon },
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
      <DropdownMenuTrigger asChild>
        <Button aria-label={t("changeLocale")} size="icon" variant="ghost">
          <GlobeIcon />
        </Button>
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
            <DropdownMenuTrigger asChild className="sm:hidden">
              <Button aria-label={t("openMenu")} size="icon" variant="ghost">
                <MenuIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {NAV_ITEMS.map((item) => (
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
            {NAV_ITEMS.map((item) => (
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
            <LocaleSwitcher />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="max-w-32 truncate" size="sm" variant="ghost">
                  {session?.user.name ?? "…"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="truncate">{session?.user.email}</DropdownMenuLabel>
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
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
