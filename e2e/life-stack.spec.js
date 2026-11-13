"use strict";

const { test, expect } = require("@playwright/test");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const Life = require("../scripts/life-engine.js");

async function cameraEye(canvas) {
  return canvas.evaluate((element) => {
    const gl = element.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    return program ? Array.from(gl.getUniform(program, gl.getUniformLocation(program, "eye"))) : [];
  });
}

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
  await expect(canvas).toBeFocused();
  const rotation = dialog.getByRole("slider", { name: "水平旋转" });
  await expect.poll(async () => (await cameraEye(canvas))[2]).toBeGreaterThan(0);
  const before = await cameraEye(canvas);
  const image = await canvas.screenshot();
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
  await expect.poll(() => cameraEye(canvas)).not.toEqual(before);
  expect(await canvas.screenshot()).not.toEqual(image);

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

test("三维视角按六个方向移动，按住连续移动且松开停止", async ({ page }) => {
  await page.goto(pathToFileURL(resolve(__dirname, "../index.html")).href);
  await page.getByRole("button", { name: "三维演化" }).click();
  const dialog = page.getByRole("dialog", { name: "三维演化" });
  const canvas = dialog.getByRole("img");
  const rotation = dialog.getByRole("slider", { name: "水平旋转" });
  const reset = dialog.getByRole("button", { name: "重置视角" });
  await expect(dialog.getByRole("status")).toContainText("13 层");
  await expect(canvas).toBeFocused();

  for (const [key, axis, direction] of [
    ["w", 2, -1], ["a", 0, -1], ["s", 2, 1], ["d", 0, 1], ["Space", 1, 1], ["f", 1, -1],
  ]) {
    await reset.click();
    await rotation.focus();
    await rotation.press("Home");
    await canvas.focus();
    await expect.poll(async () => (await cameraEye(canvas))[0]).toBe(0);
    const before = await cameraEye(canvas);
    await canvas.press(key);
    await expect.poll(async () => direction * ((await cameraEye(canvas))[axis] - before[axis])).toBeGreaterThan(0);
  }

  await reset.click();
  await expect(canvas).toBeFocused();
  await expect.poll(async () => (await cameraEye(canvas))[0]).toBeGreaterThan(0);
  const start = (await cameraEye(canvas))[1];
  await page.keyboard.down("Space");
  await expect.poll(async () => (await cameraEye(canvas))[1] - start).toBeGreaterThan(0.6);
  await page.keyboard.up("Space");
  const stopped = await cameraEye(canvas);
  await canvas.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await cameraEye(canvas)).toEqual(stopped);
  await dialog.getByRole("spinbutton", { name: "后续代数" }).press("w");
  expect(await cameraEye(canvas)).toEqual(stopped);
});
