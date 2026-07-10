import type { PermissionRule } from "@repo/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbService } from "../db/db.module";
import type { CacheService } from "../redis/cache.service";
import { AbilityFactory } from "./ability.factory";

let roleRules: PermissionRule[];
let overrides: PermissionRule[];
let getOrSet: ReturnType<typeof vi.fn>;
let del: ReturnType<typeof vi.fn>;
let factory: AbilityFactory;

/**
 * Fake scoped cache: every call is recorded as `<scope>|<key>` so the tests
 * assert both the scope and the key. The cache always "hits", so the
 * DbService loaders are never touched.
 */
function mockCache() {
  getOrSet = vi.fn((scopedKey: string) =>
    Promise.resolve(scopedKey.includes("perm:role:") ? roleRules : overrides)
  );
  del = vi.fn().mockResolvedValue(undefined);
  const scoped = (prefix: string) => ({
    getOrSet: (key: string, ttl: number, factoryFn: () => unknown) =>
      getOrSet(`${prefix}|${key}`, ttl, factoryFn),
    del: (key: string) => del(`${prefix}|${key}`),
  });
  return {
    forUser: (id: string) => scoped(`user:${id}`),
    forOrg: (id: string) => scoped(`org:${id}`),
    global: () => scoped("global"),
  } as unknown as CacheService;
}

beforeEach(() => {
  roleRules = [];
  overrides = [];
  factory = new AbilityFactory({} as unknown as DbService, mockCache());
});

describe("AbilityFactory.abilityFor", () => {
  it("builds an ability from role rules (global scope) and overrides (user scope)", async () => {
    roleRules = [{ action: "manage", subject: "all" }];
    const ability = await factory.abilityFor({ id: "user-1", role: "admin" });

    expect(ability.can("manage", "all")).toBe(true);
    expect(ability.can("delete", "User")).toBe(true);

    expect(getOrSet).toHaveBeenCalledWith(
      "global|perm:role:admin",
      300,
      expect.any(Function)
    );
    expect(getOrSet).toHaveBeenCalledWith(
      "user:user-1|perm:overrides",
      300,
      expect.any(Function)
    );
  });
});

describe("AbilityFactory.resolvedRulesFor", () => {
  it("interpolates the ${userId} placeholder in rule conditions", async () => {
    roleRules = [
      {
        action: "update",
        subject: "Project",
        conditions: { ownerId: "${userId}" },
      },
    ];
    const rules = await factory.resolvedRulesFor({
      id: "user-1",
      role: "member",
    });
    expect(rules).toEqual([
      {
        action: "update",
        subject: "Project",
        conditions: { ownerId: "user-1" },
      },
    ]);
  });

  it("leaves condition-free rules untouched", async () => {
    roleRules = [{ action: "read", subject: "Project" }];
    const rules = await factory.resolvedRulesFor({
      id: "user-1",
      role: "member",
    });
    expect(rules).toEqual([{ action: "read", subject: "Project" }]);
  });
});

describe("AbilityFactory cache invalidation", () => {
  it("evicts the per-user override cache", async () => {
    await factory.invalidateUser("user-1");
    expect(del).toHaveBeenCalledWith("user:user-1|perm:overrides");
  });

  it("evicts the per-role cache", async () => {
    await factory.invalidateRole("manager");
    expect(del).toHaveBeenCalledWith("global|perm:role:manager");
  });
});
