import { Inject, Injectable } from "@nestjs/common";
import type { FeatureFlag } from "@repo/contracts";
import type { Redis } from "ioredis";
import { PostHogService } from "../analytics/posthog.service";
import { forbidden } from "../common/app-error";
import { activeOrganizationId, currentUser } from "../common/request-context";
import { REDIS } from "../redis/redis.constants";

function overridesKey(organizationId: string): string {
  return `flags:overrides:${organizationId}`;
}

/**
 * PostHog owns flag definitions and rollouts; this service layers a
 * per-organization Redis override on top (the admin panel's escape hatch).
 * Override wins over PostHog; an unknown flag is off.
 */
@Injectable()
export class FlagsService {
  constructor(
    private readonly posthog: PostHogService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  /** The one feature gate for application code. */
  async isEnabled(key: string): Promise<boolean> {
    const orgId = activeOrganizationId();
    if (orgId) {
      const override = await this.redis.hget(overridesKey(orgId), key);
      if (override !== null) {
        return override === "true";
      }
    }
    const remote = await this.posthog.isFeatureEnabled(key, currentUser().id);
    return remote ?? false;
  }

  async list(): Promise<{ items: FeatureFlag[] }> {
    const orgId = activeOrganizationId();
    const [overrides, remote] = await Promise.all([
      orgId
        ? this.redis.hgetall(overridesKey(orgId))
        : Promise.resolve({} as Record<string, string>),
      this.posthog.getAllFlags(currentUser().id),
    ]);
    const keys = [
      ...new Set([...Object.keys(remote), ...Object.keys(overrides)]),
    ].sort();
    return {
      items: keys.map((key) => this.toDto(key, overrides[key], remote[key])),
    };
  }

  async setOverride(input: {
    key: string;
    value: boolean | null;
  }): Promise<FeatureFlag> {
    const orgId = activeOrganizationId();
    if (!orgId) {
      // Overrides are per-tenant; there is nothing to override without one.
      throw forbidden("update", "FeatureFlag");
    }
    if (input.value === null) {
      await this.redis.hdel(overridesKey(orgId), input.key);
    } else {
      await this.redis.hset(
        overridesKey(orgId),
        input.key,
        String(input.value)
      );
    }
    const remote = await this.posthog.isFeatureEnabled(
      input.key,
      currentUser().id
    );
    return this.toDto(
      input.key,
      input.value === null ? undefined : String(input.value),
      remote
    );
  }

  private toDto(
    key: string,
    override: string | undefined,
    remote: string | boolean | undefined
  ): FeatureFlag {
    if (override !== undefined) {
      return {
        key,
        enabled: override === "true",
        source: "override",
        override: override === "true",
      };
    }
    return {
      key,
      enabled: remote === true || remote === "true",
      source: "posthog",
      override: null,
    };
  }
}
