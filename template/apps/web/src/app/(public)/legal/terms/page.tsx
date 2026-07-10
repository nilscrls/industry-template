import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { readLegalContent } from "@/lib/legal-content";
import { Markdown } from "@/lib/markdown";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicPages.legal");
  return { title: t("terms") };
}

export default async function TermsPage() {
  return <Markdown source={await readLegalContent("terms")} />;
}
