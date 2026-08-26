"use strict";

const { test, expect } = require("@playwright/test");

test("核心演化、图案放置和逻辑生成可完成", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveTitle("康威生命游戏");
  await expect(page.locator("#lifeCanvas")).toBeVisible();
  await expect(page.locator("#generationValue")).toHaveText("0");

  await page.locator("#stepButton").click();
  await expect(page.locator("#generationValue")).toHaveText("1");

  await page.locator("#presetSelect").selectOption("glider");
  await page.locator("#loadPresetButton").click();
  await expect(page.locator("#statusText")).toHaveText("放置中");
  await page.locator("#lifeCanvas").click({ position: { x: 120, y: 120 } });
  await expect(page.locator("#aliveValue")).toHaveText("5");
  await page.locator("#loadPresetButton").click();

  await page.locator("#logicCodeInput").fill("NOT 0");
  await page.locator("#logicCodeButton").click();
  await expect(page.locator("#logicCodeFeedback")).toContainText("预期 O=1");
  await expect(page.locator("#statusText")).toHaveText("放置中");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
