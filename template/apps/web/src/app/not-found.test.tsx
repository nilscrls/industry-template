import messages from "@repo/i18n/messages/en.json";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import NotFoundPage from "./not-found";

describe("NotFoundPage", () => {
  it("renders the localized 404 copy and a link home", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotFoundPage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("404")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: messages.errorPages.notFoundTitle })
    ).toBeTruthy();
    // Query the anchor by target rather than ARIA role: the Radix Button keeps
    // the anchor's implicit "link" role, while the Base UI variant renders it
    // with role="button" — the href-to-dashboard link exists in both.
    const link = container.querySelector('a[href="/dashboard"]');
    expect(link?.textContent).toContain(messages.errorPages.backHome);
  });
});
