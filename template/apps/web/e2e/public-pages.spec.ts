import { expect, test } from "@playwright/test";

test.describe("public pages and consent", () => {
  test("serves the changelog to anonymous visitors", async ({ page }) => {
    await page.goto("/changelog");
    await expect(page).toHaveURL(/\/changelog/); // no login redirect
    await expect(
      page.getByRole("heading", { name: "Changelog" })
    ).toBeVisible();
  });

  test("serves the legal pages to anonymous visitors", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(page).toHaveURL(/\/legal\/privacy/);
    await expect(
      page.getByRole("heading", { name: "Privacy policy" })
    ).toBeVisible();

    await page.goto("/legal/mentions");
    await expect(
      page.getByRole("heading", { name: "Legal mentions" })
    ).toBeVisible();
  });

  test("footer links the legal pages from the login page", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("link", { name: "Privacy", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Changelog" })).toBeVisible();
  });

  test("consent choice persists across reloads", async ({ page }) => {
    await page.goto("/login");
    const banner = page.getByRole("dialog", { name: "Cookies & analytics" });
    // The banner only shows when analytics is enabled in this deployment;
    // when hidden the choice UI must still be reachable from the footer.
    if (await banner.isVisible()) {
      await page.getByRole("button", { name: "Decline" }).click();
      await expect(banner).toBeHidden();
      await page.reload();
      await expect(banner).toBeHidden();
      // Reopenable from the footer.
      await page.getByRole("button", { name: "Cookie preferences" }).click();
      await expect(banner).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: "Cookie preferences" })
      ).toBeVisible();
    }
  });
});
