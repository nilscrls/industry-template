import { expect, test } from "@playwright/test";

const unique = Date.now().toString(36);
const EMAIL = `e2e-orgset-${unique}@example.com`;
const PASSWORD = "Password123!";
const ORG_NAME = `E2E Org ${unique}`;

/**
 * A fresh user creates and switches into a new tenant, then reaches the
 * account settings and sees the 2FA enrolment entry point.
 */
test.describe
  .serial("organization switching and settings", () => {
    test("registers a new user", async ({ page }) => {
      await page.goto("/register");
      await page.getByLabel("Name").fill("Org Settings User");
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("creates a new organization from the switcher", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      // The switcher trigger carries an aria-label of the section title.
      await page.getByRole("button", { name: "Organizations" }).click();
      await page.getByRole("menuitem", { name: "Create organization" }).click();
      await page.getByLabel("Name").fill(ORG_NAME);
      await page.getByRole("button", { name: "Create", exact: true }).click();

      await expect(page.getByText("Organization created")).toBeVisible();
      // The active tenant is now the new organization.
      await expect(page.getByText(ORG_NAME)).toBeVisible();
    });

    test("shows the two-factor enrolment on the settings page", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/settings");
      await expect(
        page.getByRole("heading", { name: "Settings" })
      ).toBeVisible();
      await expect(page.getByText("Two-factor authentication")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Enable 2FA" })
      ).toBeVisible();
    });
  });
