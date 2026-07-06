import { describe, expect, it } from "vitest";
import { renderAuthEmail } from "./index";

describe("renderAuthEmail", () => {
  it("renders the verify-email variant with subject, greeting and link", async () => {
    const email = await renderAuthEmail({
      type: "verify-email",
      userName: "Ada",
      url: "https://app.example.com/verify?token=abc123",
    });

    expect(email.subject).toBe("Confirm your email address");
    expect(email.html).toContain("Confirm your email");
    // React splits adjacent text nodes with comment markers, so the name is
    // interpolated but "Hi Ada" is not a contiguous substring.
    expect(email.html).toContain(">Ada<");
    expect(email.html).toContain("https://app.example.com/verify?token=abc123");
    // The plain-text alternative carries the link but no markup.
    expect(email.text).toContain("https://app.example.com/verify?token=abc123");
    expect(email.text).not.toContain("<html");
  });

  it("renders the reset-password variant with its own subject and copy", async () => {
    const email = await renderAuthEmail({
      type: "reset-password",
      userName: "Grace",
      url: "https://app.example.com/reset?token=xyz789",
    });

    expect(email.subject).toBe("Reset your password");
    expect(email.html).toContain("Reset your password");
    expect(email.html).toContain(">Grace<");
    expect(email.html).toContain("https://app.example.com/reset?token=xyz789");
    expect(email.text).toContain("https://app.example.com/reset?token=xyz789");
  });

  it("escapes user-controlled names into the HTML safely", async () => {
    const email = await renderAuthEmail({
      type: "verify-email",
      userName: "<script>alert(1)</script>",
      url: "https://app.example.com/verify",
    });

    expect(email.html).not.toContain("<script>alert(1)</script>");
  });
});
