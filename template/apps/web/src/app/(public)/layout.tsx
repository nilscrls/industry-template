import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/lib/navigation";

/** Public pages (changelog, legal): centered column, no app shell. */
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("publicPages");
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="mb-8">
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          href="/"
        >
          ← {t("backToApp")}
        </Link>
      </div>
      {children}
    </div>
  );
}
