"use strict";

const { test, expect } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { gzipSync } = require("node:zlib");

const rle = "#N 测试滑翔机\nx=3,y=3,rule=B3/S23\nbo$2bo$3o!";

async function choosePattern(page, name, buffer) {
  const choice = page.waitForEvent("filechooser");
  const board = page.getByRole("region", { name: "生命观察区" });
  await board.getByRole("button", { name: "导入 Golly 图案" }).click();
  await (await choice).setFiles({ name, mimeType: "application/octet-stream", buffer });
}

test("观察区按钮打开 Golly 文件，预览后加入原棋盘", async ({ page }) => {
  await page.goto("/");
  await page.locator("#importInput").setInputFiles({
    name: "world.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      format: "conway-life-game",
      version: 2,
      generation: 7,
      alive: [[100, 100], [100, 101], [101, 100], [101, 101]],
      view: { centerRow: 0, centerColumn: 0, cellSize: 16 },
    })),
  });
  const canvas = page.locator("#lifeCanvas");
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await page.locator("#runToggle").click();
  await expect(page.locator("#statusText")).toHaveText("演化中");
  await choosePattern(page, "glider.rle", Buffer.from(rle));
  await expect(canvas).toHaveAttribute("aria-label", /正在放置测试滑翔机/);
  await expect(page.locator("#aliveValue")).toHaveText("4");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await canvas.click();
  await expect(page.locator("#aliveValue")).toHaveText("9");
  await expect(page.locator("#generationValue")).toHaveText("0");
});

test("离线页面能读取压缩 Macrocell，错误规则保留原有预览", async ({ page }) => {
  await page.goto(pathToFileURL(resolve(__dirname, "../index.html")).href);
  const canvas = page.locator("#lifeCanvas");
  await choosePattern(page, "tiny.mc.gz", gzipSync("[M2] (golly 5.0)\n#R B3/S23\n*"));
  await expect(canvas).toHaveAttribute("aria-label", /正在放置tiny/);
  await choosePattern(page, "other-rule.rle", Buffer.from(rle.replace("B3/S23", "B36/S23")));
  await expect(page.locator("#toastMessage")).toContainText("请先切换棋盘规则");
  await expect(canvas).toHaveAttribute("aria-label", /正在放置tiny/);
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("aria-label", /已暂停/);
  await expect(page.locator("#aliveValue")).toHaveText("0");
});
