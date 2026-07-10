import { expect, test } from "@playwright/test";

const unique = Date.now().toString(36);
const EMAIL = `e2e-${unique}@example.com`;
const PASSWORD = "Password123!";

test.describe
  .serial("auth and projects", () => {
    test("redirects anonymous visitors to login", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
    });

    test("registers, lands on the dashboard, creates a project", async ({
      page,
    }) => {
      await page.goto("/register");
      await page.getByLabel("Name").fill("E2E User");
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign up" }).click();

      await expect(page).toHaveURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { name: "Dashboard" })
      ).toBeVisible();

      // Projects are tenant-owned: a fresh user must create an organization
      // first (the New project button is capability-gated until then).
      await page.getByRole("button", { name: "Organizations" }).click();
      await page.getByRole("menuitem", { name: "Create organization" }).click();
      await page.getByLabel("Name").fill(`E2E Auth Org ${unique}`);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(page.getByText("Organization created")).toBeVisible();

      // goto, not the nav link: on mobile the nav collapses into a menu.
      await page.goto("/projects");
      await page.getByRole("button", { name: "New project" }).click();
      const name = `E2E project ${unique}`;
      await page.getByLabel("Name").fill(name);
      await page.getByRole("button", { name: "Create", exact: true }).click();

      // action feedback + row visible
      await expect(page.getByText("Project created")).toBeVisible();
      await expect(page.getByText(name)).toBeVisible();
    });

    test("signs in with seeded admin and sees stats", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill("admin@example.com");
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.getByText("Total projects")).toBeVisible();
    });
  });
