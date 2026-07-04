import { Button } from "@repo/ui/components/button";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFoundPage() {
  const t = useTranslations("errorPages");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-muted-foreground text-sm">404</p>
      <h1 className="font-semibold text-2xl">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-muted-foreground text-sm">
        {t("notFoundDescription")}
      </p>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        {t("backHome")}
      </Button>
    </main>
  );
}
