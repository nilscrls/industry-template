import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
  },
  plugins: [
    // Nest relies on legacy decorators + emitDecoratorMetadata, which esbuild
    // (vitest's default transform) cannot emit — SWC handles the transform.
    swc.vite({ module: { type: "es6" } }),
  ],
});
