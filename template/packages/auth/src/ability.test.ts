import { defaultRolePermissions } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { asSubject, buildAbility, resolveRules } from "./ability.js";

const ME = "user-1";
const OTHER = "user-2";

function memberAbility(overrides: Parameters<typeof resolveRules>[1] = []) {
  return buildAbility(resolveRules(defaultRolePermissions.member, overrides), {
    userId: ME,
  });
}

describe("buildAbility", () => {
  it("lets an admin manage everything", () => {
    const ability = buildAbility(defaultRolePermissions.admin, { userId: ME });
    expect(ability.can("manage", "all")).toBe(true);
    expect(
      ability.can("delete", asSubject("Project", { ownerId: OTHER }))
    ).toBe(true);
  });

  it("scopes member mutations to owned resources via ${userId}", () => {
    const ability = memberAbility();
    expect(ability.can("create", "Project")).toBe(true);
    expect(ability.can("update", asSubject("Project", { ownerId: ME }))).toBe(
      true
    );
    expect(
      ability.can("update", asSubject("Project", { ownerId: OTHER }))
    ).toBe(false);
  });

  it("grants extra permissions through per-user allow overrides", () => {
    const ability = memberAbility([{ action: "delete", subject: "File" }]);
    expect(ability.can("delete", asSubject("File", { ownerId: OTHER }))).toBe(
      true
    );
  });

  it("makes deny overrides win over role allows", () => {
    const ability = memberAbility([
      { action: "create", subject: "Project", inverted: true },
    ]);
    expect(ability.can("create", "Project")).toBe(false);
    // unrelated permissions stay intact
    expect(ability.can("read", "Project")).toBe(true);
  });
});
