"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPages");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-muted-foreground text-sm">500</p>
      <h1 className="font-semibold text-2xl">{t("errorTitle")}</h1>
      <p className="max-w-md text-muted-foreground text-sm">{t("errorDescription")}</p>
      {error.digest ? <p className="font-mono text-muted-foreground text-xs">{error.digest}</p> : null}
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
