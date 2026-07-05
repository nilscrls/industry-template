import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { PostHog } from "posthog-node";
import { env } from "../config/env";

/**
 * Thin wrapper so the rest of the API never touches the SDK directly. The
 * client only exists when PostHog is enabled outside NODE_ENV=test — in
 * every other case each method is a cheap no-op (test-mode SDK rule).
 */
@Injectable()
export class PostHogService implements OnApplicationShutdown {
  private readonly client: PostHog | null;

  constructor() {
    this.client =
      env.POSTHOG_ENABLED && env.NODE_ENV !== "test"
        ? new PostHog(env.POSTHOG_API_KEY, { host: env.POSTHOG_HOST })
        : null;
  }

  captureException(error: unknown, distinctId?: string): void {
    this.client?.captureException(error, distinctId);
  }

  async isFeatureEnabled(
    key: string,
    distinctId: string
  ): Promise<boolean | undefined> {
    if (!this.client) {
      return;
    }
    return await this.client.isFeatureEnabled(key, distinctId);
  }

  /** All flags PostHog knows for this user — {} when disabled. */
  async getAllFlags(
    distinctId: string
  ): Promise<Record<string, string | boolean>> {
    if (!this.client) {
      return {};
    }
    return await this.client.getAllFlags(distinctId);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.shutdown();
  }
}
