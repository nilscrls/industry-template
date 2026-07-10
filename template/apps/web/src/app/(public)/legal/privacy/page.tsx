import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { readLegalContent } from "@/lib/legal-content";
import { Markdown } from "@/lib/markdown";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicPages.legal");
  return { title: t("privacy") };
}

export default async function PrivacyPolicyPage() {
  return <Markdown source={await readLegalContent("privacy")} />;
}
