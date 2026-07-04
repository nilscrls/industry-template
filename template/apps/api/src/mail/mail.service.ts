import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { AuthEmail } from "@repo/auth";
import type { Queue } from "bullmq";
import { MAIL_QUEUE } from "./mail.module";

/** Enqueue-only — sending happens in the worker with retries and backoff. */
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue<AuthEmail>
  ) {}

  async enqueueAuthEmail(email: AuthEmail): Promise<void> {
    await this.queue.add("auth-email", email, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  }
}
