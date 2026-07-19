"use client";

import { Building2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

/**
 * Single-org variant: there is exactly one organization and every user is a
 * member, so this is a display-only badge — no switching, no creation.
 *
 * Deliberately UI-library-neutral (Tailwind + lucide only): this overlay is
 * applied AFTER ui-base and must not depend on Radix- or Base-specific
 * primitives. Keep it that way.
 */
export function OrgSwitcher() {
  const t = useTranslations("organizations");
  const { data: activeOrganization } = authClient.useActiveOrganization();

  return (
    <span className="inline-flex h-8 max-w-40 items-center gap-1.5 rounded-md border px-2.5 font-medium text-sm">
      <Building2Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">
        {activeOrganization?.name ?? t("noOrganization")}
      </span>
    </span>
  );
}
