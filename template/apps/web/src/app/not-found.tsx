import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  const t = useTranslations("errorPages");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-muted-foreground text-sm">404</p>
      <h1 className="font-semibold text-2xl">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-muted-foreground text-sm">{t("notFoundDescription")}</p>
      <Button asChild>
        <Link href="/dashboard">{t("backHome")}</Link>
      </Button>
    </main>
  );
}
