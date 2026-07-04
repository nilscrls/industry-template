import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.int.test.ts"],
    // Testcontainers pulls images on first run.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // One suite at a time — each boots a full Nest app against real containers.
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
