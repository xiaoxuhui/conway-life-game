"use strict";

const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("node:url");
const { resolve } = require("node:path");

test("经典滑翔机组件可设周期、旋转、翻转和放置", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(__dirname, "../index.html")).href);
  for (const id of ["classic-glider-reflector", "glider-gun-p60", "glider-eater", "glider-duplicator-p60"]) {
    await expect(page.locator(`#presetSelect option[value="builtin:${id}"]`)).toHaveCount(1);
  }
  await page.locator("#presetSelect").selectOption("builtin:glider-eater");
  await page.getByRole("spinbutton", { name: "滑翔机输入周期（代）" }).fill("120");
  await page.locator("#loadPresetButton").click();
  await expect(page.locator("#presetDescription")).toContainText("输入间隔 120 代");
  await page.locator("#rotatePatternButton").click();
  await page.locator("#flipPatternButton").click();
  await page.locator("#lifeCanvas").click({ position: { x: 90, y: 90 } });
  await expect(page.locator("#aliveValue")).toHaveText("22");
  expect(errors).toEqual([]);
});

test("滑翔机合成可生成目标、撤销和生成配套枪，未知配方给出原因", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(__dirname, "../index.html")).href);
  await page.locator("#presetSelect").selectOption("builtin:block");
  await page.getByRole("button", { name: "分解成滑翔机", exact: true }).click();
  await expect(page.locator("#aliveValue")).toHaveText("10");
  await expect(page.locator("#gliderSynthesisStatus")).toContainText("第 68 代生成方块");
  await page.locator("#jumpSizeInput").fill("68");
  await page.locator("#lifeCanvas").focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator("#generationValue")).toHaveText("68");
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await page.locator("#gliderSynthesisSource").selectOption("world");
  await page.getByRole("button", { name: "分解成滑翔机", exact: true }).click();
  await expect(page.locator("#aliveValue")).toHaveText("10");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await expect(page.locator("#generationValue")).toHaveText("68");
  await page.getByRole("button", { name: "滑翔机＋配套枪", exact: true }).click();
  await expect(page.locator("#gliderSynthesisStatus")).toContainText("第 188 代生成方块");
  await expect(page.locator("#aliveValue")).toHaveText("226");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await page.locator("#gliderSynthesisSource").selectOption("selected");
  await page.locator("#presetSelect").selectOption("builtin:gosper-glider-gun");
  await page.getByRole("button", { name: "分解成滑翔机", exact: true }).click();
  await expect(page.locator("#gliderSynthesisStatus")).toContainText("尚无这个图案");
  await expect(page.locator("#aliveValue")).toHaveText("4");
  expect(errors).toEqual([]);
});
