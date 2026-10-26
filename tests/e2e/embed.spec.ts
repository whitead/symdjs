import { expect, test } from "@playwright/test";

test("embeds one selected wallpaper group card", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 720 });
  await page.goto("/embed.html?group=unknown");
  await page.setContent('<iframe title="Interactive wallpaper group simulation" src="http://[::1]:5190/embed.html?group=p4g" width="400" height="720" allow="webgpu; fullscreen" allowfullscreen></iframe>');
  const card = page.frameLocator("iframe");

  await expect(card.locator(".tile")).toHaveCount(1);
  await expect(card.locator(".tile__name")).toContainText("p4g");
  await expect(card.locator(".embed__selected")).toContainText("XII / XVII");
  await expect(card.locator(".embed__selected")).not.toContainText("p4g");
  await expect(card.locator(".tile__no")).toBeHidden();
  const selector = card.getByRole("combobox", { name: /Wallpaper group/ });
  await expect(selector).toHaveValue("p4g");
  await expect(card.getByRole("button", { name: "Pause simulation" })).toBeVisible();
  await expect(card.getByRole("button", { name: "symmetry" })).toBeVisible();

  const positions = await card.locator(".tile").evaluate((tile) => {
    const bounds = (selector: string) => tile.querySelector(selector)!.getBoundingClientRect();
    return {
      visualizationBottom: bounds(".tile__mat").bottom,
      navigationTop: bounds(".embed__navigation").top,
      navigationBottom: bounds(".embed__navigation").bottom,
      labelTop: bounds(".tile__label").top,
    };
  });
  expect(positions.navigationTop).toBeGreaterThanOrEqual(positions.visualizationBottom);
  expect(positions.labelTop).toBeGreaterThanOrEqual(positions.navigationBottom);

  await card.getByRole("button", { name: /Previous wallpaper group/ }).click();
  await expect(selector).toHaveValue("p4m");
  await card.getByRole("button", { name: /Next wallpaper group/ }).click();
  await expect(selector).toHaveValue("p4g");

  await selector.selectOption("p6m");
  await expect(card.locator(".tile")).toHaveCount(1);
  await expect(card.locator(".tile__name")).toContainText("p6m");
  expect(await card.locator("body").evaluate(() => new URL(location.href).searchParams.get("group"))).toBe("p6m");

  for (const name of await selector.locator("option").allTextContents()) {
    await selector.selectOption(name);
    await expect(card.locator(".tile__name")).toContainText(name);
    const contentHeight = await card.locator("body").evaluate((el) => el.scrollHeight);
    expect(contentHeight, `${name} card height`).toBeLessThanOrEqual(720);
  }
});

test("shows a useful message for an unknown group", async ({ page }) => {
  await page.goto("/embed.html?group=unknown");
  await expect(page.getByText(/Unknown wallpaper group/)).toBeVisible();
  await expect(page.locator(".tile")).toHaveCount(0);
  await page.getByRole("combobox", { name: /Wallpaper group/ }).selectOption("p2");
  await expect(page.locator(".tile__name")).toContainText("p2");
});
