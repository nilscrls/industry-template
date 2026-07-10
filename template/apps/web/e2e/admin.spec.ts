import { expect, test } from "@playwright/test";

const unique = Date.now().toString(36);
const PASSWORD = "Password123!";

/**
 * The admin area is a UX gate over the seeded `admin` role; every endpoint
 * re-checks server-side. These specs pin the gate and that each section
 * renders for an admin (the flag-override write itself is covered by the
 * API integration suite).
 */
test.describe
  .serial("admin area", () => {
    test("denies the admin area to a non-admin user", async ({ page }) => {
      await page.goto("/register");
      await page.getByLabel("Name").fill("Reg User");
      await page.getByLabel("Email").fill(`e2e-nonadmin-${unique}@example.com`);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign up" }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/admin/organizations");
      await expect(
        page.getByText("You need the admin role to see this area.")
      ).toBeVisible();
    });

    test("gives the seeded admin the admin nav and sections", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill("admin@example.com");
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/admin/organizations");
      await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
      // Sub-navigation to the three admin sections.
      await expect(
        page.getByRole("link", { name: "Organizations" })
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Feature flags" })
      ).toBeVisible();

      // The seeded demo tenant is findable in the organization overview
      // (search first: newest orgs sort to page 1; assert the table cell,
      // not the org-switcher trigger which also shows a name).
      await page.getByPlaceholder("Search organizations…").fill("Acme");
      await expect(page.getByRole("cell", { name: "Acme Inc" })).toBeVisible();
    });

    test("renders the audit log and feature-flag sections for an admin", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByLabel("Email").fill("admin@example.com");
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/admin/audit");
      await expect(
        page.getByRole("heading", { name: "Audit log" })
      ).toBeVisible();

      await page.goto("/admin/flags");
      await expect(
        page.getByRole("heading", { name: "Feature flags" })
      ).toBeVisible();
      // The manual-override form is available.
      await expect(page.getByPlaceholder("flag-key")).toBeVisible();
    });
  });
