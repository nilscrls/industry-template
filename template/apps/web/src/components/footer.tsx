"use client";

import { useTranslations } from "next-intl";
import { useConsent } from "@/components/consent";
import { Link } from "@/lib/navigation";

/**
 * Global footer: legal links required for GDPR/LCEN compliance plus the
 * changelog. Plain semantic HTML + Tailwind only — no @repo/ui imports, so
 * it renders identically under both UI variants.
 */
export function Footer() {
  const t = useTranslations("footer");
  const { openPreferences } = useConsent();
  const linkClass = "hover:text-foreground";
  return (
    <footer className="border-t px-6 py-4">
      <nav
        aria-label={t("ariaLabel")}
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-muted-foreground text-xs"
      >
        <Link className={linkClass} href="/legal/mentions">
          {t("legalMentions")}
        </Link>
        <Link className={linkClass} href="/legal/privacy">
          {t("privacy")}
        </Link>
        <Link className={linkClass} href="/legal/terms">
          {t("terms")}
        </Link>
        <Link className={linkClass} href="/changelog">
          {t("changelog")}
        </Link>
        <button className={linkClass} onClick={openPreferences} type="button">
          {t("cookiePreferences")}
        </button>
      </nav>
    </footer>
  );
}
