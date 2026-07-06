import type { AuthEmail } from "@repo/auth";
import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { MailService } from "./mail.service";

const email: AuthEmail = {
  to: "user@example.com",
  type: "verify-email",
  url: "https://app.example.com/verify?token=abc",
  userName: "Ada",
};

describe("MailService.enqueueAuthEmail", () => {
  it("enqueues an auth-email job with retry/backoff and retention policy", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new MailService({ add } as unknown as Queue<AuthEmail>);

    await service.enqueueAuthEmail(email);

    expect(add).toHaveBeenCalledWith("auth-email", email, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  });
});
