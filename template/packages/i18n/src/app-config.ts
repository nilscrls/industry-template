import type {} from "next-intl";
import type { Locale } from "./config";
import type { Messages } from "./messages";

/**
 * Global next-intl type registration: `useTranslations` keys, `t(...)`
 * arguments and `getLocale()` are all checked against the en catalog.
 * https://next-intl.dev/docs/workflows/typescript
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
