import { z } from "zod";
import { base } from "./base.js";

export const featureFlagSchema = z.object({
  key: z.string(),
  /** Effective value for the caller's organization. */
  enabled: z.boolean(),
  source: z.enum(["override", "posthog"]),
  /** The org-level override, or null when the flag follows PostHog. */
  override: z.boolean().nullable(),
});

export type FeatureFlag = z.infer<typeof featureFlagSchema>;

const flagKeySchema = z.string().min(1).max(200);

/**
 * PostHog owns flag definitions/rollouts; the API layers per-organization
 * overrides (admin escape hatch) on top. Admin surface only.
 */
export const flagsContract = {
  list: base
    .route({
      method: "GET",
      path: "/feature-flags",
      summary: "List feature flags with their org overrides",
      tags: ["feature-flags"],
    })
    .output(z.object({ items: z.array(featureFlagSchema) })),

  setOverride: base
    .route({
      method: "PUT",
      path: "/feature-flags/{key}/override",
      summary: "Set or clear an org-level flag override",
      tags: ["feature-flags"],
    })
    .input(
      z.object({
        key: flagKeySchema,
        /** true/false forces the flag; null clears the override. */
        value: z.boolean().nullable(),
      })
    )
    .output(featureFlagSchema),
};
