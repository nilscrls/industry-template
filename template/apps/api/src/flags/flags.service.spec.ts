import type { AuthUser, SessionData } from "@repo/auth";
import type { Redis } from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogService } from "../analytics/posthog.service";
import { requestContext } from "../common/request-context";
import { FlagsService } from "./flags.service";

const ORG = "org-1";
const KEY = "flags:overrides:org-1";

let redis: {
  hget: ReturnType<typeof vi.fn>;
  hgetall: ReturnType<typeof vi.fn>;
  hset: ReturnType<typeof vi.fn>;
  hdel: ReturnType<typeof vi.fn>;
};
let posthog: {
  isFeatureEnabled: ReturnType<typeof vi.fn>;
  getAllFlags: ReturnType<typeof vi.fn>;
};
let service: FlagsService;

/** Run `fn` inside a request scope with the given active organization. */
function inScope<T>(
  activeOrg: string | null,
  fn: () => Promise<T>
): Promise<T> {
  return requestContext.run(
    {
      requestId: "r",
      user: { id: "u1" } as unknown as AuthUser,
      session: {
        session: { activeOrganizationId: activeOrg },
      } as unknown as SessionData,
    },
    fn
  );
}

beforeEach(() => {
  redis = {
    hget: vi.fn(),
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(1),
    hdel: vi.fn().mockResolvedValue(1),
  };
  posthog = {
    isFeatureEnabled: vi.fn(),
    getAllFlags: vi.fn().mockResolvedValue({}),
  };
  service = new FlagsService(
    posthog as unknown as PostHogService,
    redis as unknown as Redis
  );
});

describe("FlagsService.isEnabled", () => {
  it("lets an org override win over PostHog without consulting it", async () => {
    redis.hget.mockResolvedValue("true");
    const enabled = await inScope(ORG, () => service.isEnabled("new-dash"));
    expect(enabled).toBe(true);
    expect(redis.hget).toHaveBeenCalledWith(KEY, "new-dash");
    expect(posthog.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it("honors a falsy override", async () => {
    redis.hget.mockResolvedValue("false");
    expect(await inScope(ORG, () => service.isEnabled("new-dash"))).toBe(false);
  });

  it("falls back to PostHog when there is no override", async () => {
    redis.hget.mockResolvedValue(null);
    posthog.isFeatureEnabled.mockResolvedValue(true);
    expect(await inScope(ORG, () => service.isEnabled("new-dash"))).toBe(true);
    expect(posthog.isFeatureEnabled).toHaveBeenCalledWith("new-dash", "u1");
  });

  it("treats an unknown flag as off", async () => {
    redis.hget.mockResolvedValue(null);
    posthog.isFeatureEnabled.mockResolvedValue(undefined);
    expect(await inScope(ORG, () => service.isEnabled("unknown"))).toBe(false);
  });

  it("skips the override lookup entirely without an active organization", async () => {
    posthog.isFeatureEnabled.mockResolvedValue(true);
    expect(await inScope(null, () => service.isEnabled("new-dash"))).toBe(true);
    expect(redis.hget).not.toHaveBeenCalled();
  });
});

describe("FlagsService.setOverride", () => {
  it("refuses to write an override without an active organization", async () => {
    let code: unknown;
    try {
      await inScope(null, () =>
        service.setOverride({ key: "new-dash", value: true })
      );
    } catch (error) {
      code = (error as { data?: { code?: string } }).data?.code;
    }
    expect(code).toBe("AUTH_FORBIDDEN");
  });

  it("sets an override and reports it as the source", async () => {
    posthog.isFeatureEnabled.mockResolvedValue(false);
    const dto = await inScope(ORG, () =>
      service.setOverride({ key: "new-dash", value: true })
    );
    expect(redis.hset).toHaveBeenCalledWith(KEY, "new-dash", "true");
    expect(dto).toEqual({
      key: "new-dash",
      enabled: true,
      source: "override",
      override: true,
    });
  });

  it("clears an override and falls back to PostHog as the source", async () => {
    posthog.isFeatureEnabled.mockResolvedValue(false);
    const dto = await inScope(ORG, () =>
      service.setOverride({ key: "new-dash", value: null })
    );
    expect(redis.hdel).toHaveBeenCalledWith(KEY, "new-dash");
    expect(dto).toEqual({
      key: "new-dash",
      enabled: false,
      source: "posthog",
      override: null,
    });
  });
});

describe("FlagsService.list", () => {
  it("merges overrides with PostHog flags, overrides winning, keys sorted", async () => {
    redis.hgetall.mockResolvedValue({ alpha: "true" });
    posthog.getAllFlags.mockResolvedValue({ beta: true, alpha: false });

    const { items } = await inScope(ORG, () => service.list());

    expect(items.map((flag) => flag.key)).toEqual(["alpha", "beta"]);
    expect(items[0]).toEqual({
      key: "alpha",
      enabled: true,
      source: "override",
      override: true,
    });
    expect(items[1]).toEqual({
      key: "beta",
      enabled: true,
      source: "posthog",
      override: null,
    });
  });
});
