import { defineConfig } from "vitest/config";
import { swcPlugin } from "./vitest.swc";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    // Unit tests mock their collaborators — only the integration suite
    // provides (and validates) the full environment.
    env: { SKIP_ENV_VALIDATION: "true" },
  },
  plugins: [swcPlugin],
});
