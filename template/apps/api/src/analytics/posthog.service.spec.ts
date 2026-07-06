import { describe, expect, it } from "vitest";
import { PostHogService } from "./posthog.service";

/**
 * Under NODE_ENV=test the SDK client is never constructed (test-mode rule),
 * so every method must degrade to a cheap, safe no-op.
 */
describe("PostHogService (disabled client)", () => {
  const service = new PostHogService();

  it("reports an unknown flag as undefined, not a throw", async () => {
    expect(
      await service.isFeatureEnabled("new-dashboard", "u1")
    ).toBeUndefined();
  });

  it("returns an empty flag map", async () => {
    expect(await service.getAllFlags("u1")).toEqual({});
  });

  it("swallows exception capture", () => {
    expect(() =>
      service.captureException(new Error("boom"), "u1")
    ).not.toThrow();
  });

  it("shuts down cleanly with no client", async () => {
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
