import { expect, test } from "@playwright/test";

const unique = Date.now().toString(36);
const EMAIL = `e2e-orgset-${unique}@example.com`;
const PASSWORD = "Password123!";

/**
 * Single-org variant: a fresh user auto-joins the one workspace at signup,
 * sees it in the header badge (no switcher menu, no create entry), then
 * reaches the account settings and sees the 2FA enrolment entry point.
 */
test.describe
  .serial("single organization and settings", () => {
    test("registers a new user who lands in the workspace", async ({
      page,
    }) => {
      await page.goto("/register");
      await page.getByLabel("Name").fill("Org Settings User");
      await page.getByLabel("Email").fill(EMAIL);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      // Auto-join: the header badge names the seeded workspace…
      await expect(page.getByLabel("Organizations")).toContainText("Workspace");
      // …and it is a static badge, not a menu button.
      await expect(
        page.getByRole("button", { name: "Organizations" })
      ).toHaveCount(0);
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
