import { Global, Module } from "@nestjs/common";
import { PostHogService } from "./posthog.service";

/** Global: the exception filter and the flags service both capture into it. */
@Global()
@Module({
  providers: [PostHogService],
  exports: [PostHogService],
})
export class AnalyticsModule {}
