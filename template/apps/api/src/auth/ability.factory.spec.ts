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

beforeEach(() => {
  roleRules = [];
  overrides = [];
  // The real getOrSet would fall back to the DbService loaders; here the
  // cache always "hits", so the DB is never touched.
  getOrSet = vi.fn((key: string) =>
    Promise.resolve(key.startsWith("perm:role:") ? roleRules : overrides)
  );
  del = vi.fn().mockResolvedValue(undefined);
  factory = new AbilityFactory(
    {} as unknown as DbService,
    {
      getOrSet,
      del,
    } as unknown as CacheService
  );
});

describe("AbilityFactory.abilityFor", () => {
  it("builds an ability from the role rules keyed and TTL'd per role and user", async () => {
    roleRules = [{ action: "manage", subject: "all" }];
    const ability = await factory.abilityFor({ id: "user-1", role: "admin" });

    expect(ability.can("manage", "all")).toBe(true);
    expect(ability.can("delete", "User")).toBe(true);

    expect(getOrSet).toHaveBeenCalledWith(
      "perm:role:admin",
      300,
      expect.any(Function)
    );
    expect(getOrSet).toHaveBeenCalledWith(
      "perm:user:user-1",
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
    expect(del).toHaveBeenCalledWith("perm:user:user-1");
  });

  it("evicts the per-role cache", async () => {
    await factory.invalidateRole("manager");
    expect(del).toHaveBeenCalledWith("perm:role:manager");
  });
});
