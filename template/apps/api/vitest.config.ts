import { defineConfig } from "vitest/config";
import { swcPlugin } from "./vitest.swc";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
  },
  plugins: [swcPlugin],
});
