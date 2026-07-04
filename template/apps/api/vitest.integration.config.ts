import { defineConfig } from "vitest/config";
import { swcPlugin } from "./vitest.swc";

export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    // Testcontainers pulls images on first run.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // One suite at a time — each boots a full Nest app against real containers.
    fileParallelism: false,
  },
  plugins: [swcPlugin],
});
