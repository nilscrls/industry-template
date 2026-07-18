import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { AuthEmail } from "@repo/auth";
import type { Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { env } from "../config/env";
import { MAIL_QUEUE } from "./mail.constants";

/** Enqueue-only — sending happens in the worker with retries and backoff. */
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue<AuthEmail>,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(MailService.name);
  }

  async enqueueAuthEmail(email: AuthEmail): Promise<void> {
    // EMAILS_ENABLED is a scaffold-time flag: when off, drop the send loudly
    // (a silent skip hides a misconfigured environment). Sign-up still works;
    // the email just never leaves. Do NOT pair EMAILS_ENABLED=false with
    // REQUIRE_EMAIL_VERIFICATION=true — users could never verify.
    if (!env.EMAILS_ENABLED) {
      this.logger.info(
        { type: email.type, to: email.to },
        "emails disabled (EMAILS_ENABLED=false) — skipping"
      );
      return;
    }
    await this.queue.add("auth-email", email, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  }
}
