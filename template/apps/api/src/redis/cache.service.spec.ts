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

describe("CacheService.get", () => {
  it("returns undefined for a missing key", async () => {
    redis.get.mockResolvedValue(null);
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("parses stored JSON back into a value", async () => {
    redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
    expect(await cache.get("k")).toEqual({ a: 1 });
  });
});

describe("CacheService.set", () => {
  it("serializes the value with an expiry", async () => {
    await cache.set("k", { a: 1 }, 60);
    expect(redis.set).toHaveBeenCalledWith("k", '{"a":1}', "EX", 60);
  });
});

describe("CacheService.del", () => {
  it("forwards keys to redis", async () => {
    await cache.del("a", "b");
    expect(redis.del).toHaveBeenCalledWith("a", "b");
  });

  it("is a no-op when no keys are given", async () => {
    await cache.del();
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe("CacheService.getOrSet", () => {
  it("returns the cached value without calling the factory on a hit", async () => {
    redis.get.mockResolvedValue(JSON.stringify("cached"));
    const factory = vi.fn();
    expect(await cache.getOrSet("k", 60, factory)).toBe("cached");
    expect(factory).not.toHaveBeenCalled();
  });

  it("computes, stores and returns the value on a miss", async () => {
    redis.get.mockResolvedValue(null);
    const factory = vi.fn().mockResolvedValue("fresh");
    expect(await cache.getOrSet("k", 30, factory)).toBe("fresh");
    expect(factory).toHaveBeenCalledOnce();
    expect(redis.set).toHaveBeenCalledWith("k", '"fresh"', "EX", 30);
  });
});
