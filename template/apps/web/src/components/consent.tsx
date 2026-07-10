"use client";

import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { env } from "@/env";

type ConsentChoice = "granted" | "denied";

const STORAGE_KEY = "cookie-consent";

interface ConsentContextValue {
  choice: ConsentChoice | null;
  /** Reopen the banner (footer "Cookie preferences"). */
  openPreferences: () => void;
  setChoice: (choice: ConsentChoice) => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const value = useContext(ConsentContext);
  if (!value) {
    throw new Error("useConsent must be used within ConsentProvider");
  }
  return value;
}

function readStoredChoice(): ConsentChoice | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "granted" || raw === "denied" ? raw : null;
}

/**
 * Analytics consent (GDPR): PostHog initializes opted-out
 * (instrumentation-client.ts) and only starts capturing — and writing its
 * cookies — after an explicit opt-in here. Strictly necessary cookies
 * (session, locale, theme) are not consent-gated; they are listed in the
 * privacy policy.
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ConsentChoice | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredChoice();
    setChoiceState(stored);
    // Only prompt when analytics is actually enabled for this deployment.
    setBannerOpen(stored === null && env.NEXT_PUBLIC_POSTHOG_ENABLED);
  }, []);

  const setChoice = useCallback((next: ConsentChoice) => {
    localStorage.setItem(STORAGE_KEY, next);
    setChoiceState(next);
    setBannerOpen(false);
    if (env.NEXT_PUBLIC_POSTHOG_ENABLED) {
      if (next === "granted") {
        posthog.opt_in_capturing();
      } else {
        posthog.opt_out_capturing();
      }
    }
  }, []);

  const openPreferences = useCallback(() => setBannerOpen(true), []);

  return (
    <ConsentContext.Provider value={{ choice, setChoice, openPreferences }}>
      {children}
      {bannerOpen ? <ConsentBanner /> : null}
    </ConsentContext.Provider>
  );
}

function ConsentBanner() {
  const t = useTranslations("consent");
  const { setChoice } = useConsent();
  return (
    <div
      aria-label={t("title")}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg"
      role="dialog"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 text-sm">
          <p className="font-medium">{t("title")}</p>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setChoice("denied")} variant="outline">
            {t("decline")}
          </Button>
          <Button onClick={() => setChoice("granted")}>{t("accept")}</Button>
        </div>
      </div>
    </div>
  );
}
