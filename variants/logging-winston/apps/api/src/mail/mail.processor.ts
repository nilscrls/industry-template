import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject } from "@nestjs/common";
import type { AuthEmail } from "@repo/auth";
import { renderAuthEmail } from "@repo/emails";
import type { Job } from "bullmq";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Transporter } from "nodemailer";
import type { Logger } from "winston";
import { env } from "../config/env";
import { MAIL_QUEUE, MAIL_TRANSPORT } from "./mail.constants";

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger: Logger;

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transporter: Transporter,
    @Inject(WINSTON_MODULE_PROVIDER) logger: Logger
  ) {
    super();
    this.logger = logger.child({ context: MailProcessor.name });
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
    this.logger.info("auth email sent", { type, to });
  }
}
