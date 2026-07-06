import type { PermissionRule } from "@repo/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbService } from "../db/db.module";
import type { CacheService } from "../redis/cache.service";
import { AbilityFactory } from "./ability.factory";

let membershipRules: PermissionRule[];
let getOrSet: ReturnType<typeof vi.fn>;
let del: ReturnType<typeof vi.fn>;
let factory: AbilityFactory;

beforeEach(() => {
  membershipRules = [];
  // The cache "hit" returns the user's membership rules; the DB loader that
  // getOrSet would otherwise call is never reached.
  getOrSet = vi.fn(() => Promise.resolve(membershipRules));
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
  it("gives site admins manage-all without touching the membership cache", async () => {
    const ability = await factory.abilityFor({ id: "user-1", role: "admin" });
    expect(ability.can("manage", "all")).toBe(true);
    expect(getOrSet).not.toHaveBeenCalled();
  });

  it("combines baseline rules with cached membership rules for members", async () => {
    membershipRules = [
      {
        action: "manage",
        subject: "Project",
        conditions: { id: { $in: ["p1"] } },
      },
    ];
    const ability = await factory.abilityFor({ id: "user-1", role: "member" });

    // Baseline grant applies; a member is not a blanket admin. (Per-project
    // membership scoping itself is covered by rulesFromMemberships and the
    // shared ability.test.ts.)
    expect(ability.can("create", "Project")).toBe(true);
    expect(ability.can("manage", "all")).toBe(false);

    // Membership rules are read from the per-user cache with the shared TTL.
    expect(getOrSet).toHaveBeenCalledWith(
      "perm:user:user-1",
      300,
      expect.any(Function)
    );
  });
});

describe("AbilityFactory.resolvedRulesFor", () => {
  it("interpolates the ${userId} placeholder in baseline conditions", async () => {
    const rules = await factory.resolvedRulesFor({
      id: "user-1",
      role: "member",
    });
    const ownFile = rules.find(
      (rule) => rule.action === "read" && rule.subject === "File"
    );
    expect(ownFile?.conditions).toEqual({ ownerId: "user-1" });
  });
});

describe("AbilityFactory.invalidateUser", () => {
  it("evicts the per-user membership cache", async () => {
    await factory.invalidateUser("user-1");
    expect(del).toHaveBeenCalledWith("perm:user:user-1");
  });
});
