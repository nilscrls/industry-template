import { describe, expect, it } from "vitest";
import {
  grantSchema,
  orgCapabilities,
  permissionSnapshotSchema,
  roles,
  systemCapabilities,
} from "./permissions";

describe("roles", () => {
  it("is exactly admin/manager/user", () => {
    expect(roles).toEqual(["admin", "manager", "user"]);
  });
});

describe("grantSchema", () => {
  it("accepts an FGA object ref with a known relation", () => {
    expect(
      grantSchema.safeParse({
        object: "project:abc-123",
        relation: "denied_write",
      }).success
    ).toBe(true);
  });

  it("rejects unknown relations", () => {
    expect(
      grantSchema.safeParse({ object: "project:abc", relation: "owner" })
        .success
    ).toBe(false);
  });

  it("rejects malformed object refs", () => {
    expect(
      grantSchema.safeParse({ object: "not a ref", relation: "granted_read" })
        .success
    ).toBe(false);
  });
});

describe("permissionSnapshotSchema", () => {
  it("accepts full capability snapshots", () => {
    expect(
      permissionSnapshotSchema.safeParse({
        org: [...orgCapabilities],
        system: [...systemCapabilities],
      }).success
    ).toBe(true);
  });

  it("rejects capabilities outside the model vocabulary", () => {
    expect(
      permissionSnapshotSchema.safeParse({ org: ["can_fly"], system: [] })
        .success
    ).toBe(false);
  });
});
