import { isContractProcedure } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import { contract } from "./contract.js";

function collectProcedures(router: object, prefix = ""): Array<{ name: string; procedure: unknown }> {
  return Object.entries(router).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    if (isContractProcedure(value)) {
      return [{ name, procedure: value }];
    }
    return collectProcedures(value as object, name);
  });
}

describe("contract", () => {
  it("gives every procedure an explicit method and path (required by @orpc/nest)", () => {
    const procedures = collectProcedures(contract);
    expect(procedures.length).toBeGreaterThan(0);
    for (const { name, procedure } of procedures) {
      const route = (procedure as { "~orpc": { route?: { method?: string; path?: string } } })["~orpc"].route;
      expect(route?.method, `${name} is missing a method`).toBeTruthy();
      expect(route?.path, `${name} is missing a path`).toBeTruthy();
    }
  });
});
