import type { AuthEmail } from "@repo/auth";
import type { Job } from "bullmq";
import type { Transporter } from "nodemailer";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { MailProcessor } from "./mail.processor";

function makeLogger() {
  const info = vi.fn();
  const logger = { child: () => ({ info }) } as unknown as Logger;
  return { logger, info };
}

describe("MailProcessor.process", () => {
  it("renders the email and hands it to the transporter", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const transporter = { sendMail } as unknown as Transporter;
    const { logger, info } = makeLogger();
    const processor = new MailProcessor(transporter, logger);

    const job = {
      data: {
        to: "user@example.com",
        type: "reset-password",
        url: "https://app.example.com/reset?token=xyz",
        userName: "Grace",
      } satisfies AuthEmail,
    } as Job<AuthEmail>;

    await processor.process(job);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      to: "user@example.com",
      subject: "Reset your password",
    });
    expect(payload.html).toContain("https://app.example.com/reset?token=xyz");
    // The plain-text alternative carries the link too.
    expect(payload.text).toContain("https://app.example.com/reset?token=xyz");
    expect(info).toHaveBeenCalled();
  });
});
