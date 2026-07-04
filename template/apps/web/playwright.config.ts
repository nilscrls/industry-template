import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.WEB_URL ?? "http://localhost:3000";

/**
 * Runs against a live stack: `pnpm compose:dev` + `pnpm dev` locally, or the
 * `all` compose profile in CI. Seed first (`pnpm db:migrate && pnpm db:seed`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
