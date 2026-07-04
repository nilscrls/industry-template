import {
  adminPermissions,
  baselinePermissions,
  rulesFromMemberships,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { asSubject, buildAbility, resolveRules } from "./ability.js";

const ME = "user-1";
const OTHER = "user-2";
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

function memberAbility(
  memberships: Parameters<typeof rulesFromMemberships>[0] = []
) {
  return buildAbility(
    resolveRules(baselinePermissions, rulesFromMemberships(memberships)),
    { userId: ME }
  );
}

describe("buildAbility (ReBAC)", () => {
  it("lets an admin manage everything without memberships", () => {
    const ability = buildAbility(adminPermissions, { userId: ME });
    expect(ability.can("manage", "all")).toBe(true);
    expect(ability.can("delete", asSubject("Project", { id: PROJECT_A }))).toBe(
      true
    );
  });

  it("grants nothing project-specific without a relation", () => {
    const ability = memberAbility();
    expect(ability.can("create", "Project")).toBe(true);
    expect(ability.can("read", asSubject("Project", { id: PROJECT_A }))).toBe(
      false
    );
  });

  it("maps relations to actions on exactly the covered projects", () => {
    const ability = memberAbility([
      { projectId: PROJECT_A, relation: "owner" },
      { projectId: PROJECT_B, relation: "viewer" },
    ]);
    expect(ability.can("update", asSubject("Project", { id: PROJECT_A }))).toBe(
      true
    );
    expect(ability.can("manage", asSubject("Project", { id: PROJECT_A }))).toBe(
      true
    );
    expect(ability.can("read", asSubject("Project", { id: PROJECT_B }))).toBe(
      true
    );
    expect(ability.can("update", asSubject("Project", { id: PROJECT_B }))).toBe(
      false
    );
  });

  it("lets editors update but not delete", () => {
    const ability = memberAbility([
      { projectId: PROJECT_A, relation: "editor" },
    ]);
    expect(ability.can("update", asSubject("Project", { id: PROJECT_A }))).toBe(
      true
    );
    expect(ability.can("delete", asSubject("Project", { id: PROJECT_A }))).toBe(
      false
    );
  });

  it("keeps baseline file ownership scoped via ${userId}", () => {
    const ability = memberAbility();
    expect(ability.can("read", asSubject("File", { ownerId: ME }))).toBe(true);
    expect(ability.can("read", asSubject("File", { ownerId: OTHER }))).toBe(
      false
    );
  });
});
