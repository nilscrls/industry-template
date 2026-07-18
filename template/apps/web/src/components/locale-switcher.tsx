"use client";

import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@repo/i18n";
import { buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import { GlobeIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";

/**
 * Cookie-based locale switcher: writes the `NEXT_LOCALE` preference and
 * refreshes so the server re-renders in the new language.
 *
 * UI-neutral on purpose (styled trigger via `buttonVariants`, no `asChild` /
 * `render`): the same file serves both the Radix and Base UI shells. The
 * `--i18n=url` overlay replaces it with a prefix-navigating variant.
 */
export function LocaleSwitcher() {
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
        aria-label={t("changeLocale")}
        className={cn(buttonVariants({ size: "icon", variant: "ghost" }))}
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
