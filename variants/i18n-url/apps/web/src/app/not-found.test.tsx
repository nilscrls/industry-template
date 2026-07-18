import messages from "@repo/i18n/messages/en.json";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import NotFoundPage from "./not-found";

describe("NotFoundPage", () => {
  it("renders the localized 404 copy and a link home", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotFoundPage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("404")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: messages.errorPages.notFoundTitle })
    ).toBeTruthy();
    const link = screen.getByRole("link", {
      name: messages.errorPages.backHome,
    });
    // URL-i18n: the navigation shim prefixes internal hrefs with the active
    // locale, so the link home is the canonical prefixed path.
    expect(link.getAttribute("href")).toBe("/en/dashboard");
  });
});
