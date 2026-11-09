"use strict";

const { test, expect } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const Life = require("../scripts/life-engine.js");

test("离线页面可生成和旋转逐代堆叠，关闭后棋盘仍停在原代", async ({ page, isMobile }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(__dirname, "../index.html")).href);
  const world = Life.createWorld([[0, -1], [0, 0], [0, 1]]);
  await page.locator("#importInput").setInputFiles({
    name: "blinker.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(Life.serialize(world, 7))),
  });
  const generation = page.locator("#generationValue");
  await expect(generation).toHaveText("7");
  await page.getByRole("button", { name: "三维演化" }).click();
  const dialog = page.getByRole("dialog", { name: "三维演化" });
  await expect(dialog.getByRole("status")).toHaveText("第 7–19 代 · 13 层");
  const steps = dialog.getByRole("spinbutton", { name: "后续代数" });
  await steps.fill("3");
  await steps.press("Enter");
  await expect(dialog.getByRole("status")).toHaveText("第 7–10 代 · 4 层");

  const canvas = dialog.getByRole("img");
  const rotation = dialog.getByRole("slider", { name: "水平旋转" });
  const drawing = () => canvas.evaluate((element) => element.toDataURL());
  const emptyDrawing = await canvas.evaluate((element) => {
    const blank = document.createElement("canvas");
    blank.width = element.width;
    blank.height = element.height;
    return blank.toDataURL();
  });
  await expect.poll(drawing).not.toBe(emptyDrawing);
  const before = await drawing();
  if (isMobile) {
    await rotation.press("ArrowRight");
  } else {
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 50);
    await page.mouse.up();
  }
  await expect(rotation).not.toHaveValue("35");
  await expect.poll(drawing).not.toBe(before);

  await dialog.getByRole("button", { name: "关闭" }).focus();
  await page.keyboard.press("t");
  await expect(page.locator("#statusText")).toHaveText("已暂停");
  await expect(generation).toHaveText("7");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#statusText")).toHaveText("已暂停");
  await expect(generation).toHaveText("7");
  await expect(page.locator("#aliveValue")).toHaveText("3");
  expect(errors).toEqual([]);
});
