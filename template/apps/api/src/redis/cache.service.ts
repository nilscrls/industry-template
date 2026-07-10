import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "./redis.constants";

/**
 * Cache handle whose every key is prefixed with its authorization scope.
 * Obtained from CacheService — never constructed directly — so an unscoped
 * key (the classic cache-poisoning / cross-tenant IDOR vector) cannot happen
 * by accident.
 */
export class ScopedCache {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.scopedKey(key));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      this.scopedKey(key),
      JSON.stringify(value),
      "EX",
      ttlSeconds
    );
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.redis.del(...keys.map((key) => this.scopedKey(key)));
    }
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  private scopedKey(key: string): string {
    return `${this.prefix}:${key}`;
  }
}

@Injectable()
export class CacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Tenant-scoped data: keys become `org:<id>:<key>`. */
  forOrg(organizationId: string): ScopedCache {
    return this.scoped("org", organizationId);
  }

  /** Per-user data: keys become `user:<id>:<key>`. */
  forUser(userId: string): ScopedCache {
    return this.scoped("user", userId);
  }

  /**
   * Deliberate escape hatch — keys become `global:<key>`. Only for values
   * identical for EVERY caller (role rule sets, feature defaults). Never
   * cache anything derived from a request's session or headers here.
   */
  global(): ScopedCache {
    return new ScopedCache(this.redis, "global");
  }

  private scoped(kind: string, id: string): ScopedCache {
    if (!id) {
      throw new Error(`Cache scope "${kind}" requires a non-empty id`);
    }
    return new ScopedCache(this.redis, `${kind}:${id}`);
  }
}
