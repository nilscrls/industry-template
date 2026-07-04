import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { createTransport } from "nodemailer";
import { env } from "../config/env";
import { MAIL_QUEUE, MAIL_TRANSPORT } from "./mail.constants";
import { MailProcessor } from "./mail.processor";
import { MailService } from "./mail.service";

@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      useFactory: () =>
        createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          ...(env.SMTP_USER && env.SMTP_PASSWORD
            ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
            : {}),
        }),
    },
    MailService,
    MailProcessor,
  ],
  exports: [MailService],
})
export class MailModule {}
