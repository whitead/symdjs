import { expect, test } from "@playwright/test";

test("embeds one selected wallpaper group card", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 620 });
  await page.goto("/embed.html?group=unknown");
  await page.setContent('<iframe title="p4g wallpaper group simulation" src="http://[::1]:5190/embed.html?group=p4g" width="400" height="620" allow="webgpu; fullscreen" allowfullscreen></iframe>');
  const card = page.frameLocator("iframe");

  await expect(card.locator(".tile")).toHaveCount(1);
  await expect(card.locator(".tile__name")).toContainText("p4g");
  await expect(card.getByRole("button", { name: "Pause simulation" })).toBeVisible();
  await expect(card.getByRole("button", { name: "symmetry" })).toBeVisible();

  const cardHeight = await card.locator(".tile").evaluate((el) => el.getBoundingClientRect().height);
  expect(cardHeight).toBeLessThanOrEqual(620);
});

test("shows a useful message for an unknown group", async ({ page }) => {
  await page.goto("/embed.html?group=unknown");
  await expect(page.getByText(/Unknown wallpaper group/)).toBeVisible();
  await expect(page.locator(".tile")).toHaveCount(0);
});
