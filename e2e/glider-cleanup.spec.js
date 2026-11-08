"use strict";

const { test, expect } = require("@playwright/test");

const glider = [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]];

async function importWorld(page, alive) {
  await page.locator("#importInput").setInputFiles({
    name: "glider-world.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      format: "conway-life-game",
      version: 2,
      generation: 0,
      alive,
      view: { centerRow: 0, centerColumn: 0, cellSize: 16 },
    })),
  });
  await expect(page.locator("#aliveValue")).toHaveText(String(alive.length));
}

test("滑翔机清理默认关闭，开启只删除离群滑翔机", async ({ page }) => {
  await page.goto("/");
  const mode = page.getByRole("checkbox", { name: "清理离群滑翔机" });
  const alive = page.locator("#aliveValue");
  const step = page.locator("#stepButton");
  const world = [[0, 0], [0, 1], [1, 0], [1, 1], ...glider.map(([row, column]) => [row + 10, column + 10])];
  await importWorld(page, world);
  await expect(mode).not.toBeChecked();
  await step.click();
  await expect(alive).toHaveText("9");

  await mode.check();
  await expect(alive).toHaveText("4");
  await expect(page.locator("#generationValue")).toHaveText("1");

  await mode.uncheck();
  await importWorld(page, world);
  await step.click();
  await expect(alive).toHaveText("9");
  await page.locator("#ruleInput").fill("B36/S23");
  await page.locator("#applyRuleButton").click();
  await expect(mode).toBeDisabled();
});

test("开启后每代检查，滑翔机飞出矩形才被清理", async ({ page }) => {
  await page.goto("/");
  const blocks = [[0, 19], [0, 20], [1, 19], [1, 20], [19, 0], [19, 1], [20, 0], [20, 1]];
  await importWorld(page, [...blocks, ...glider.map(([row, column]) => [row + 8, column + 8])]);
  await page.getByRole("checkbox", { name: "清理离群滑翔机" }).check();
  await page.locator("#stepButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("13");
  await page.locator("#speedInput").fill("200");
  await page.locator("#runToggle").click();
  await expect(page.locator("#aliveValue")).toHaveText("8");
  await expect(page.locator("#cyclePeriodValue")).toHaveText("1 代");
  await page.locator("#runToggle").click();
});

test("较大棋盘开启清理后仍在分块引擎中演化", async ({ page }) => {
  await page.addInitScript(() => {
    window.tiledCleanupCalls = 0;
    Object.defineProperty(window, "LifeTiles", {
      configurable: true,
      set(tiles) {
        Object.defineProperty(window, "LifeTiles", {
          value: {
            ...tiles,
            pruneOutlyingGliders(world) {
              const result = tiles.pruneOutlyingGliders(world);
              if (result) window.tiledCleanupCalls += 1;
              return result;
            },
          },
        });
      },
    });
  });
  await page.goto("/");
  const blocks = Array.from({ length: 8 }, (_, index) => index * 5)
    .flatMap((column) => [[0, column], [0, column + 1], [1, column], [1, column + 1]]);
  await importWorld(page, [...blocks, ...glider.map(([row, column]) => [row + 12, column + 12])]);
  await page.getByRole("checkbox", { name: "清理离群滑翔机" }).check();
  await expect(page.locator("#aliveValue")).toHaveText("32");
  await page.locator("#runToggle").click();
  await expect(page.locator("#cyclePeriodValue")).toHaveText("1 代");
  expect(await page.evaluate(() => window.tiledCleanupCalls)).toBeGreaterThan(0);
  await page.locator("#runToggle").click();
  await page.locator("#lifeCanvas").click({ position: { x: 40, y: 40 } });
  await expect(page.locator("#cyclePeriodValue")).toBeHidden();
  await expect(page.locator("#aliveValue")).toHaveText("33");
});
