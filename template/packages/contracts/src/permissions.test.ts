import { describe, expect, it } from "vitest";
import {
  defaultRolePermissions,
  permissionRuleSchema,
  roles,
} from "./permissions";

describe("defaultRolePermissions", () => {
  it("defines a baseline for every role", () => {
    expect(Object.keys(defaultRolePermissions).sort()).toEqual(
      [...roles].sort()
    );
  });

  it("only contains rules that satisfy the serializable rule schema", () => {
    for (const [role, rules] of Object.entries(defaultRolePermissions)) {
      for (const rule of rules) {
        expect(
          permissionRuleSchema.safeParse(rule).success,
          `${role}: ${JSON.stringify(rule)}`
        ).toBe(true);
      }
    }
  });

  it("gives admins blanket manage-all", () => {
    expect(defaultRolePermissions.admin).toContainEqual({
      action: "manage",
      subject: "all",
    });
  });

  it("scopes member project mutations to the owner via the ${userId} placeholder", () => {
    const update = defaultRolePermissions.member.find(
      (rule) => rule.action === "update" && rule.subject === "Project"
    );
    expect(update?.conditions).toEqual({ ownerId: "${userId}" });
  });
});

describe("permissionRuleSchema", () => {
  it("rejects an unknown action", () => {
    expect(
      permissionRuleSchema.safeParse({ action: "yolo", subject: "Project" })
        .success
    ).toBe(false);
  });

  it("rejects an unknown subject", () => {
    expect(
      permissionRuleSchema.safeParse({ action: "read", subject: "Robot" })
        .success
    ).toBe(false);
  });
});
