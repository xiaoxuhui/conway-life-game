"use strict";

const { test, expect } = require("@playwright/test");

test("Tab 在棋盘内单步，T 开始或暂停，长按只触发一次", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#lifeCanvas");
  const generation = page.locator("#generationValue");
  const status = page.locator("#statusText");
  await canvas.focus();

  await page.keyboard.down("Tab");
  await page.keyboard.down("Tab");
  await page.keyboard.up("Tab");
  await expect(generation).toHaveText("1");
  await expect(canvas).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(generation).toHaveText("2");

  await page.keyboard.down("t");
  await page.keyboard.down("t");
  await page.keyboard.up("t");
  await expect(status).toHaveText("演化中");
  await page.keyboard.press("T");
  await expect(status).toHaveText("已暂停");
});

test("Shift+Tab 可离开棋盘，表单中的 T 和 Tab 保留原生行为", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#lifeCanvas");
  await canvas.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#importGollyButton")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(canvas).toBeFocused();

  const rule = page.locator("#ruleInput");
  await rule.fill("B3/S23");
  await rule.press("End");
  await page.keyboard.press("t");
  await expect(rule).toHaveValue("B3/S23t");
  await page.keyboard.press("Tab");
  await expect(rule).not.toBeFocused();
  await expect(page.locator("#generationValue")).toHaveText("0");
  await expect(page.locator("#statusText")).toHaveText("已暂停");
});
