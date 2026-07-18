import type { AuthEmail } from "@repo/auth";
import type { Queue } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "winston";
import { MailService } from "./mail.service";

// env.ts reads process.env at import and has no defaults — mock it so the
// EMAILS_ENABLED flag can be flipped per test without a full env.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { EMAILS_ENABLED: true },
}));
vi.mock("../config/env", () => ({ env: mockEnv }));

const email: AuthEmail = {
  to: "user@example.com",
  type: "verify-email",
  url: "https://app.example.com/verify?token=abc",
  userName: "Ada",
};

function makeLogger() {
  const info = vi.fn();
  const logger = { child: () => ({ info }) } as unknown as Logger;
  return { logger, info };
}

beforeEach(() => {
  mockEnv.EMAILS_ENABLED = true;
});

describe("MailService.enqueueAuthEmail", () => {
  it("enqueues an auth-email job with retry/backoff and retention policy", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new MailService(
      { add } as unknown as Queue<AuthEmail>,
      makeLogger().logger
    );

    await service.enqueueAuthEmail(email);

    expect(add).toHaveBeenCalledWith("auth-email", email, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  });

  it("skips the queue and logs when EMAILS_ENABLED is false", async () => {
    mockEnv.EMAILS_ENABLED = false;
    const add = vi.fn().mockResolvedValue(undefined);
    const { logger, info } = makeLogger();
    const service = new MailService(
      { add } as unknown as Queue<AuthEmail>,
      logger
    );

    await service.enqueueAuthEmail(email);

    expect(add).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("EMAILS_ENABLED=false"),
      { type: email.type, to: email.to }
    );
  });
});
