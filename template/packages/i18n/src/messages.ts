import type en from "../messages/en.json";
import type { Locale } from "./config";

/**
 * English is the reference catalog: every locale must be assignable to its
 * shape, so a missing key in fr.json is a type error, not a runtime surprise.
 */
export type Messages = typeof en;

/** Static imports per locale — bundlers can code-split each catalog. */
export async function getMessages(locale: Locale): Promise<Messages> {
  switch (locale) {
    case "fr":
      return (await import("../messages/fr.json")).default;
    default:
      return (await import("../messages/en.json")).default;
  }
}
