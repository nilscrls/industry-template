import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // React 19 automatic JSX runtime for component/hook tests (esbuild would
  // otherwise default to the classic runtime and need React in scope).
  esbuild: { jsx: "automatic" },
  // Mirror tsconfig's "@/*" → "./src/*" — vite does not read tsconfig paths.
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
