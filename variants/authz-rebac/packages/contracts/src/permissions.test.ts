import { describe, expect, it } from "vitest";
import {
  orgCapabilities,
  permissionSnapshotSchema,
  projectRelationSchema,
  projectRelations,
  systemCapabilities,
} from "./permissions";

describe("projectRelationSchema", () => {
  it("accepts the relation ladder", () => {
    for (const relation of projectRelations) {
      expect(projectRelationSchema.safeParse(relation).success).toBe(true);
    }
  });

  it("rejects unknown relations", () => {
    expect(projectRelationSchema.safeParse("manager").success).toBe(false);
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
