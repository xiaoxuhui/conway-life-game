"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");

const keys = { patterns: "conway-life-game.custom-patterns.v1", functions: "conway-life-game.logic-functions.v1" };
const timestamp = "2026-10-11T00:00:00.000Z";
const libraries = {
  patterns: { format: "conway-life-pattern-library", version: 1, patterns: [{
    id: "custom-bulk", name: "备份方块", description: "全部备份测试", width: 2, height: 2,
    cells: [[0, 0], [0, 1], [1, 0], [1, 1]], createdAt: timestamp, updatedAt: timestamp,
  }] },
  functions: { format: "conway-life-logic-function-library", version: 2, functions: [{
    id: "function-bulk", name: "BULK", code: "AND(A,B)",
    inputs: [{ name: "A", defaultValue: 1 }, { name: "B", defaultValue: 0 }], createdAt: timestamp, updatedAt: timestamp,
  }] },
};
const button = "#exportDeleteAllRecordsButton";
const dialog = "#exportAllRecordsDialog";
const error = "#exportAllRecordsError";

async function seed(page, values = libraries) {
  await page.goto("/");
  await page.evaluate(({ keys, values }) => {
    for (const collection of Object.keys(keys)) localStorage.setItem(keys[collection], JSON.stringify(values[collection]));
  }, { keys, values });
  await page.reload();
}

async function stored(page) {
  return page.evaluate((keys) => Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, JSON.parse(localStorage.getItem(key))])), keys);
}

async function picker(page, options = {}) {
  await page.evaluate(({ options, keys }) => {
    window.pickerCalls = 0;
    window.savedFiles = [];
    window.abortCalls = 0;
    if (options.failure === "unsupported") {
      window.showDirectoryPicker = undefined;
      return;
    }
    window.showDirectoryPicker = async () => {
      window.pickerCalls += 1;
      if (options.failure === "cancel") throw new DOMException("取消", "AbortError");
      let index = 0;
      return {
        async getFileHandle(name) {
          const fileIndex = index++;
          const fails = (stage) => options.failure === `${fileIndex}-${stage}`;
          if (fails("handle")) throw new Error("文件创建失败");
          return {
            async createWritable() {
              if (fails("create")) throw new Error("文件流创建失败");
              let raw;
              return {
                async write(value) {
                  if (fails("write")) throw new Error("文件写入失败");
                  raw = value;
                },
                async close() {
                  if (fails("close")) throw new Error("文件关闭失败");
                  if (options.disk) await window.writeBulkBackup(name, raw);
                  window.savedFiles.push({ name, raw });
                  if (options.hold && fileIndex === 1) await new Promise((resolve) => { window.completeBulkBackup = resolve; });
                },
                async abort() { window.abortCalls += 1; },
              };
            },
          };
        },
      };
    };
    if (["storage-first", "storage-second", "rollback"].includes(options.failure)) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === keys.patterns && options.failure === "storage-first") throw new Error("图案清理失败");
        if (key === keys.functions && JSON.parse(value).functions.length === 0) throw new Error("函数清理失败");
        if (key === keys.patterns && options.failure === "rollback" && JSON.parse(value).patterns.length > 0) throw new Error("回滚失败");
        return originalSet.call(this, key, value);
      };
    }
  }, { options, keys });
}

test("主页全部备份：两份文件关闭后才清空，可用原导入流程恢复", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  const directory = testInfo.outputPath("bulk-backup");
  await fs.mkdir(directory, { recursive: true });
  await page.exposeFunction("writeBulkBackup", (name, raw) => fs.writeFile(path.join(directory, name), raw));
  await picker(page, { disk: true, hold: true });
  await page.locator("#randomButton").click();
  const world = await page.locator("#aliveValue").textContent();
  const builtinCount = await page.locator("#presetSelect option").count();
  await page.locator(button).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator("#exportAllRecordsHelp").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("bulk-homepage.png"), fullPage: true });
  await page.locator(button).click();
  await expect.poll(() => page.evaluate(() => typeof window.completeBulkBackup)).toBe("function");
  expect(await stored(page)).toEqual(libraries);
  await expect(page.locator(button)).toBeDisabled();
  await page.locator(button).dispatchEvent("click");
  expect(await page.evaluate(() => window.pickerCalls)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(dialog)).toBeVisible();
  for (const name of await fs.readdir(directory)) {
    const contents = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
    expect(contents).toEqual(name.includes("patterns") ? libraries.patterns : libraries.functions);
  }
  expect(await fs.readdir(directory)).toHaveLength(2);
  await page.evaluate(() => window.completeBulkBackup());
  await expect(page.locator(dialog)).not.toBeVisible();
  const empty = await stored(page);
  expect(empty.patterns.patterns).toEqual([]);
  expect(empty.functions.functions).toEqual([]);
  await expect(page.locator(button)).toBeDisabled();
  await expect(page.locator("#managePatternsButton")).toBeDisabled();
  await expect(page.locator("#manageLogicFunctionsButton")).toBeDisabled();
  expect(await page.locator("#presetSelect option").count()).toBe(builtinCount - 1);
  expect(await page.locator("#aliveValue").textContent()).toBe(world);
  await page.reload();
  expect(await stored(page)).toEqual(empty);
  for (const [collection, input, confirm] of [
    ["patterns", "#importPatternsInput", "#confirmImportPatternsButton"],
    ["functions", "#importLogicFunctionsInput", "#confirmImportLogicFunctionsButton"],
  ]) {
    const filename = (await fs.readdir(directory)).find((name) => name.includes(collection));
    await page.locator(input).setInputFiles(path.join(directory, filename));
    await page.locator(confirm).click();
  }
  expect(await stored(page)).toEqual(libraries);
  await expect(page.locator(button)).toBeEnabled();
  expect(errors).toEqual([]);
});

for (const failure of ["cancel", "unsupported", "0-handle", "0-create", "0-write", "0-close", "1-handle", "1-create", "1-write", "1-close", "storage-first", "storage-second"]) {
  test(`全部备份：${failure} 失败保留全部记录`, async ({ page }) => {
    await seed(page);
    await picker(page, { failure });
    await page.locator(button).click();
    if (failure === "cancel") await expect(page.locator("#toastMessage")).toHaveText("已取消保存，全部记录已保留");
    else await expect(page.locator(error)).toContainText("全部记录已保留");
    await expect(page.locator(dialog)).not.toBeVisible();
    expect(await stored(page)).toEqual(libraries);
    await expect(page.locator(button)).toBeEnabled();
    if (failure.startsWith("storage")) {
      await expect(page.locator(error)).toContainText("备份已保存");
      expect(await page.evaluate(() => window.savedFiles.length)).toBe(2);
    }
    if (failure.endsWith("write") || failure.endsWith("close")) expect(await page.evaluate(() => window.abortCalls)).toBe(1);
  });
}

test("全部备份：保存期间发生变化则不清空", async ({ page }) => {
  await seed(page);
  await picker(page, { hold: true });
  await page.locator(button).click();
  await expect.poll(() => page.evaluate(() => typeof window.completeBulkBackup)).toBe("function");
  const updated = { ...libraries.functions, functions: [{ ...libraries.functions.functions[0], name: "CHANGED" }] };
  await page.evaluate(({ key, updated }) => localStorage.setItem(key, JSON.stringify(updated)), { key: keys.functions, updated });
  await page.evaluate(() => window.completeBulkBackup());
  await expect(page.locator(error)).toContainText("保存期间记录已变化");
  expect(await stored(page)).toEqual({ ...libraries, functions: updated });
});

test("全部备份：回滚失败诚实提示从备份恢复", async ({ page }) => {
  await seed(page);
  await picker(page, { failure: "rollback" });
  await page.locator(button).click();
  await expect(page.locator(error)).toContainText("请从备份恢复");
  await expect(page.locator(error)).not.toContainText("全部记录已保留");
  const result = await stored(page);
  expect(result.patterns.patterns).toEqual([]);
  expect(result.functions).toEqual(libraries.functions);
  await expect(page.locator("#managePatternsButton")).toBeDisabled();
  await expect(page.locator("#manageLogicFunctionsButton")).toBeEnabled();
  expect(await page.evaluate(() => window.savedFiles.map(({ raw }) => JSON.parse(raw)))).toEqual([libraries.patterns, libraries.functions]);
});

for (const collection of ["patterns", "functions"]) {
  test(`全部备份：${collection} 为空仍保存两份兼容文件`, async ({ page }) => {
    const values = { ...libraries, [collection]: { ...libraries[collection], [collection]: [] } };
    await seed(page, values);
    await picker(page);
    await page.locator(button).click();
    await expect(page.locator(button)).toBeDisabled();
    expect(await page.evaluate(() => window.savedFiles.map(({ raw }) => JSON.parse(raw)))).toEqual([values.patterns, values.functions]);
    const result = await stored(page);
    expect(result.patterns.patterns).toEqual([]);
    expect(result.functions.functions).toEqual([]);
  });
}

test("全部备份：两库为空时禁用按钮", async ({ page }) => {
  await seed(page, { patterns: { ...libraries.patterns, patterns: [] }, functions: { ...libraries.functions, functions: [] } });
  await expect(page.locator(button)).toBeDisabled();
});
