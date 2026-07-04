import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { AuthEmail } from "@repo/auth";
import { renderAuthEmail } from "@repo/emails";
import type { Job } from "bullmq";
import type { Transporter } from "nodemailer";
import { PinoLogger } from "nestjs-pino";
import { env } from "../config/env";
import { MAIL_QUEUE, MAIL_TRANSPORT } from "./mail.module";

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transporter: Transporter,
    private readonly logger: PinoLogger
  ) {
    super();
    this.logger.setContext(MailProcessor.name);
  }

  async process(job: Job<AuthEmail>): Promise<void> {
    const { type, to, userName, url } = job.data;
    const rendered = await renderAuthEmail({ type, userName, url });
    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    this.logger.info({ type, to }, "auth email sent");
  }
}
