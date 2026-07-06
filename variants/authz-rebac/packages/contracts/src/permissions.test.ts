import { describe, expect, it } from "vitest";
import {
  adminPermissions,
  baselinePermissions,
  permissionRuleSchema,
  projectRelations,
  relationActions,
  roles,
  rulesFromMemberships,
} from "./permissions";

describe("ReBAC static permissions", () => {
  it("defines the expected roles and project relations", () => {
    expect([...roles]).toEqual(["admin", "member"]);
    expect([...projectRelations]).toEqual(["owner", "editor", "viewer"]);
  });

  it("maps each relation to the actions it grants", () => {
    expect(relationActions.owner).toEqual(["manage"]);
    expect(relationActions.editor).toEqual(["read", "update"]);
    expect(relationActions.viewer).toEqual(["read"]);
  });

  it("only contains rules that satisfy the serializable rule schema", () => {
    for (const rule of [...baselinePermissions, ...adminPermissions]) {
      expect(
        permissionRuleSchema.safeParse(rule).success,
        JSON.stringify(rule)
      ).toBe(true);
    }
  });

  it("gives site admins blanket manage-all", () => {
    expect(adminPermissions).toContainEqual({
      action: "manage",
      subject: "all",
    });
  });
});

describe("rulesFromMemberships", () => {
  it("returns no rules for a user with no memberships", () => {
    expect(rulesFromMemberships([])).toEqual([]);
  });

  it("groups project ids per relation and scopes each rule with $in", () => {
    const rules = rulesFromMemberships([
      { projectId: "p1", relation: "owner" },
      { projectId: "p2", relation: "viewer" },
      { projectId: "p3", relation: "owner" },
    ]);

    // Relations are emitted in declaration order (owner, editor, viewer);
    // editor is absent here, so only owner then viewer rules appear.
    expect(rules).toEqual([
      {
        action: "manage",
        subject: "Project",
        conditions: { id: { $in: ["p1", "p3"] } },
      },
      {
        action: "read",
        subject: "Project",
        conditions: { id: { $in: ["p2"] } },
      },
    ]);
  });

  it("expands a multi-action relation into one rule per action", () => {
    const rules = rulesFromMemberships([
      { projectId: "p9", relation: "editor" },
    ]);
    expect(rules.map((rule) => rule.action)).toEqual(["read", "update"]);
    for (const rule of rules) {
      expect(rule.conditions).toEqual({ id: { $in: ["p9"] } });
    }
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
