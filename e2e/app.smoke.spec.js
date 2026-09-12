"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

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

  await page.locator("#presetSelect").selectOption("builtin:glider");
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

test("函数库可以从 JSON 导入并导出到磁盘", async ({ page }) => {
  await page.goto("/");
  const library = {
    format: "conway-life-logic-function-library",
    version: 2,
    functions: [{
      id: "function-browser-smoke",
      name: "NAND",
      code: "NOT(AND(A,B))",
      inputs: [{ name: "A", defaultValue: 0 }, { name: "B", defaultValue: 0 }],
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    }],
  };

  await page.locator("#importLogicFunctionsInput").setInputFiles({
    name: "functions.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(library)),
  });
  await expect(page.locator("#importLogicFunctionsDialog")).toBeVisible();
  await expect(page.locator("#importLogicFunctionsSummary")).toContainText("1 个函数");
  await page.locator("#confirmImportLogicFunctionsButton").click();
  await expect(page.locator("#logicFunctionSelect option")).toHaveText("NAND · NAND");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportLogicFunctionsButton").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^conway-life-functions-\d{4}-\d{2}-\d{2}\.json$/);
});

test("我的图案可以全部导入并全部保存到磁盘", async ({ page }) => {
  await page.goto("/");
  const library = {
    format: "conway-life-pattern-library",
    version: 1,
    patterns: [{
      id: "custom-browser-smoke",
      name: "测试方块",
      description: "浏览器冒烟图案",
      width: 2,
      height: 2,
      cells: [[0, 0], [0, 1], [1, 0], [1, 1]],
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    }],
  };

  await page.locator("#importPatternsInput").setInputFiles({
    name: "patterns.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(library)),
  });
  await expect(page.locator("#importPatternsDialog")).toBeVisible();
  await expect(page.locator("#importPatternsSummary")).toContainText("1 个自定义图案");
  await page.locator("#confirmImportPatternsButton").click();
  await expect(page.locator('#presetSelect option[value="custom:custom-browser-smoke"]')).toHaveText("测试方块");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportPatternsButton").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^conway-life-patterns-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(exported.patterns).toHaveLength(1);
  expect(exported.patterns[0].name).toBe("测试方块");
});
