import messages from "@repo/i18n/messages/en.json";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { Footer } from "./footer";

// Isolate the footer from the consent machinery (which pulls in env +
// posthog); the footer only calls openPreferences.
const openPreferences = vi.fn();
vi.mock("@/components/consent", () => ({
  useConsent: () => ({ choice: null, setChoice: vi.fn(), openPreferences }),
}));

describe("Footer", () => {
  it("links every legal page and the changelog, and reopens cookie prefs", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <Footer />
      </NextIntlClientProvider>
    );

    // URL-i18n: the navigation shim prefixes internal hrefs with the active
    // locale, so every footer link carries the canonical `/en` prefix.
    const links: Record<string, string> = {
      [messages.footer.legalMentions]: "/en/legal/mentions",
      [messages.footer.privacy]: "/en/legal/privacy",
      [messages.footer.terms]: "/en/legal/terms",
      [messages.footer.changelog]: "/en/changelog",
    };
    for (const [name, href] of Object.entries(links)) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(
        href
      );
    }

    screen
      .getByRole("button", { name: messages.footer.cookiePreferences })
      .click();
    expect(openPreferences).toHaveBeenCalled();
  });
});
