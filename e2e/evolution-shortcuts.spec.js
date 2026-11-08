"use strict";

const { test, expect } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

test("直接打开离线网页后，Tab 可单步和连续演化", async ({ page }) => {
  await page.goto(pathToFileURL(resolve(__dirname, "../index.html")).href);
  const generation = page.locator("#generationValue");
  const status = page.locator("#statusText");
  await page.keyboard.press("Tab");
  await expect(generation).toHaveText("1");
  await page.keyboard.down("Tab");
  await expect(status).toHaveText("演化中");
  await page.keyboard.up("Tab");
  await expect(status).toHaveText("已暂停");
});

test("点击暂停、单步或清理模式后可直接按 Tab", async ({ page }) => {
  await page.goto("/");
  const run = page.locator("#runToggle");
  const generation = page.locator("#generationValue");
  const status = page.locator("#statusText");
  await run.click();
  await expect(status).toHaveText("演化中");
  await run.click();
  await expect(status).toHaveText("已暂停");
  const pausedAt = Number(await generation.textContent());
  await page.keyboard.press("Tab");
  await expect(generation).toHaveText(String(pausedAt + 1));
  await page.locator("#stepButton").click();
  await page.keyboard.down("Tab");
  await expect(status).toHaveText("演化中");
  await page.keyboard.up("Tab");
  await expect(status).toHaveText("已暂停");

  const beforeCleanupToggle = Number(await generation.textContent());
  await page.getByRole("checkbox", { name: "清理离群滑翔机" }).click();
  await page.keyboard.press("Tab");
  await expect(generation).toHaveText(String(beforeCleanupToggle + 1));
});

test("轻按 Tab 在棋盘内单步，T 开始或暂停", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#lifeCanvas");
  const generation = page.locator("#generationValue");
  const status = page.locator("#statusText");
  await canvas.click({ position: { x: 40, y: 40 } });

  await page.keyboard.down("Tab");
  await page.keyboard.down("Tab");
  await expect(generation).toHaveText("0");
  await page.keyboard.up("Tab");
  await expect(generation).toHaveText("1");
  await expect(canvas).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(generation).toHaveText("2");

  await page.keyboard.down("t");
  await page.keyboard.down("t");
  await page.keyboard.up("t");
  await expect(status).toHaveText("演化中");
  await page.keyboard.press("Tab");
  await expect(status).toHaveText("演化中");
  await page.keyboard.press("T");
  await expect(status).toHaveText("已暂停");
});

test("长按 Tab 连续演化，松键或画布失焦时暂停", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#lifeCanvas");
  const generation = page.locator("#generationValue");
  const status = page.locator("#statusText");
  await canvas.focus();
  await page.keyboard.down("Tab");
  await expect(status).toHaveText("演化中");
  await expect.poll(async () => Number(await generation.textContent())).toBeGreaterThan(1);
  await page.keyboard.up("Tab");
  await expect(status).toHaveText("已暂停");

  await page.keyboard.down("Tab");
  await expect(status).toHaveText("演化中");
  await page.locator("#importGollyButton").focus();
  await expect(status).toHaveText("已暂停");
  const pausedAt = await generation.textContent();
  await page.keyboard.up("Tab");
  await expect(generation).toHaveText(pausedAt);
});

test("Shift+Tab 可离开棋盘，表单中的 T 和 Tab 保留原生行为", async ({ page }) => {
  await page.goto("/");
  const canvas = page.locator("#lifeCanvas");
  await canvas.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#importGollyButton")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(canvas).toBeFocused();

  await page.locator("#runToggle").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#stepButton")).toBeFocused();

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
