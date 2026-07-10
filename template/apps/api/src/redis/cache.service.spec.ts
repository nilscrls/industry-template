import type { Redis } from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheService } from "./cache.service";

function mockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis & {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
}

let redis: ReturnType<typeof mockRedis>;
let cache: CacheService;

beforeEach(() => {
  redis = mockRedis();
  cache = new CacheService(redis);
});

describe("CacheService scoping", () => {
  it("prefixes org-scoped keys with the tenant id", async () => {
    await cache.forOrg("org-1").set("stats", { a: 1 }, 60);
    expect(redis.set).toHaveBeenCalledWith("org:org-1:stats", '{"a":1}', "EX", 60);
  });

  it("prefixes user-scoped keys with the user id", async () => {
    redis.get.mockResolvedValue(null);
    await cache.forUser("user-1").get("perm:overrides");
    expect(redis.get).toHaveBeenCalledWith("user:user-1:perm:overrides");
  });

  it("prefixes the global escape hatch", async () => {
    await cache.global().set("perm:role:admin", [], 300);
    expect(redis.set).toHaveBeenCalledWith(
      "global:perm:role:admin",
      "[]",
      "EX",
      300
    );
  });

  it("rejects an empty scope id — a poisoned shared key must be impossible", () => {
    expect(() => cache.forOrg("")).toThrow(/non-empty id/);
    expect(() => cache.forUser("")).toThrow(/non-empty id/);
  });
});

describe("ScopedCache.get", () => {
  it("returns undefined for a missing key", async () => {
    redis.get.mockResolvedValue(null);
    expect(await cache.forOrg("o").get("missing")).toBeUndefined();
  });

  it("parses stored JSON back into a value", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
    expect(await cache.forOrg("o").get("k")).toEqual({ a: 1 });
  });
});

describe("ScopedCache.del", () => {
  it("forwards scoped keys to redis", async () => {
    await cache.forOrg("o").del("a", "b");
    expect(redis.del).toHaveBeenCalledWith("org:o:a", "org:o:b");
  });

  it("is a no-op when no keys are given", async () => {
    await cache.forOrg("o").del();
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe("ScopedCache.getOrSet", () => {
  it("returns the cached value without calling the factory on a hit", async () => {
    redis.get.mockResolvedValue(JSON.stringify("cached"));
    const factory = vi.fn();
    expect(await cache.forUser("u").getOrSet("k", 60, factory)).toBe("cached");
    expect(factory).not.toHaveBeenCalled();
  });

  it("computes, stores and returns the value on a miss", async () => {
    redis.get.mockResolvedValue(null);
    const factory = vi.fn().mockResolvedValue("fresh");
    expect(await cache.forUser("u").getOrSet("k", 30, factory)).toBe("fresh");
    expect(factory).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith("user:u:k", '"fresh"', "EX", 30);
  });
});
