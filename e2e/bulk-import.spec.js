"use strict";

const { test, expect } = require("@playwright/test");
const keys = { patterns: "conway-life-game.custom-patterns.v1", functions: "conway-life-game.logic-functions.v1" };
const timestamp = "2026-10-11T00:00:00.000Z";
const libraries = {
  patterns: { format: "conway-life-pattern-library", version: 1, patterns: [{
    id: "custom-import", name: "恢复方块", description: "全部导入测试", width: 2, height: 2,
    cells: [[0, 0], [0, 1], [1, 0], [1, 1]], createdAt: timestamp, updatedAt: timestamp,
  }] },
  functions: { format: "conway-life-logic-function-library", version: 2, functions: [{
    id: "function-import", name: "RESTORE", code: "AND(A,B)",
    inputs: [{ name: "A", defaultValue: 1 }, { name: "B", defaultValue: 0 }], createdAt: timestamp, updatedAt: timestamp,
  }] },
};
const input = "#importAllRecordsInput";
const dialog = "#importAllRecordsDialog";
const summary = "#importAllRecordsSummary";
const confirm = "#confirmImportAllRecordsButton";
const error = "#importAllRecordsError";

function file(library, name = "backup.json") {
  return { name, mimeType: "application/json", buffer: Buffer.from(typeof library === "string" ? library : JSON.stringify(library)) };
}

async function seed(page, values = libraries) {
  await page.goto("/");
  await page.evaluate(({ keys, values }) => {
    for (const type of Object.keys(keys)) localStorage.setItem(keys[type], JSON.stringify(values[type]));
  }, { keys, values });
  await page.reload();
}

async function stored(page) {
  return page.evaluate((keys) => Object.fromEntries(Object.entries(keys).map(([type, key]) => [type, JSON.parse(localStorage.getItem(key))])), keys);
}

test("配对按钮完成全部导出删除与全部导入恢复，不改变棋盘", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  await page.locator("#randomButton").click();
  const population = await page.locator("#aliveValue").textContent();
  await page.locator("#importAllRecordsButton").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("bulk-import-homepage.png"), fullPage: true });
  await page.evaluate(() => {
    window.backupFiles = [];
    window.showDirectoryPicker = async () => ({
      getFileHandle: async (name) => ({ createWritable: async () => {
        let raw;
        return { write: async (value) => { raw = value; }, close: async () => { window.backupFiles.push({ name, raw }); } };
      } }),
    });
  });
  await page.locator("#exportDeleteAllRecordsButton").click();
  await expect(page.locator("#exportAllRecordsDialog")).not.toBeVisible();
  expect((await stored(page)).patterns.patterns).toEqual([]);
  const files = await page.evaluate(() => window.backupFiles);
  expect(files).toHaveLength(2);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator("#importAllRecordsButton").click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles(files.map(({ name, raw }) => file(raw, name)).reverse());
  await expect(page.locator(confirm)).toBeEnabled();
  await expect(page.locator(summary)).toContainText("图案：文件 1 项，预计新增 1 项");
  await expect(page.locator(summary)).toContainText("函数：文件 1 项，预计新增 1 项");
  expect((await stored(page)).functions.functions).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.locator(summary).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("bulk-import-preview.png"), fullPage: true });
  await page.locator(confirm).click();
  await expect(page.locator(dialog)).not.toBeVisible();
  expect(await stored(page)).toEqual(libraries);
  expect(await page.locator("#aliveValue").textContent()).toBe(population);
  await page.reload();
  expect(await stored(page)).toEqual(libraries);
  // 相同两份文件再次选择仍可触发导入，但不重复记录。
  await page.locator(input).setInputFiles(files.map(({ name, raw }) => file(raw, name)));
  await expect(page.locator(summary)).toContainText("预计新增 0 项，跳过 1 项");
  await page.locator(confirm).click();
  expect(await stored(page)).toEqual(libraries);
  expect(errors).toEqual([]);
});

test("全部导入保留冲突项与预览期间其它页面新增内容", async ({ page }) => {
  await seed(page);
  const incoming = {
    patterns: { ...libraries.patterns, patterns: [{ ...libraries.patterns.patterns[0], name: "不能覆盖", description: "冲突" }, { ...libraries.patterns.patterns[0], id: "custom-new", name: "NEW图案" }] },
    functions: { ...libraries.functions, functions: [{ ...libraries.functions.functions[0], id: "function-conflict", code: "NOT(A)" }, { ...libraries.functions.functions[0], id: "function-new", name: "NEW" }] },
  };
  await page.locator(input).setInputFiles([file(incoming.functions, "any1.json"), file(incoming.patterns, "any2.json")]);
  await expect(page.locator(summary)).toContainText("预计新增 1 项，跳过 1 项");
  const concurrent = { ...libraries.functions.functions[0], id: "function-concurrent", name: "CONCURRENT" };
  await page.evaluate(({ key, library }) => localStorage.setItem(key, JSON.stringify(library)), {
    key: keys.functions, library: { ...libraries.functions, functions: [...libraries.functions.functions, concurrent] },
  });
  await page.locator(confirm).click();
  const result = await stored(page);
  expect(result.patterns.patterns).toEqual([libraries.patterns.patterns[0], incoming.patterns.patterns[1]]);
  expect(result.functions.functions).toEqual([libraries.functions.functions[0], concurrent, incoming.functions.functions[1]]);
});

for (const collection of ["patterns", "functions"]) {
  test(`全部导入支持仅恢复 ${collection}，另一库不变`, async ({ page }) => {
    await seed(page, { ...libraries, [collection]: { ...libraries[collection], [collection]: [] } });
    await page.locator(input).setInputFiles(file(libraries[collection]));
    await expect(page.locator(confirm)).toBeEnabled();
    await page.locator(confirm).click();
    expect(await stored(page)).toEqual(libraries);
  });
}

for (const failure of ["broken", "unknown", "version", "duplicate", "three", "oversized", "read"]) {
  test(`全部导入 ${failure} 时两库都不写入`, async ({ page }) => {
    await seed(page);
    const valid = file(libraries.patterns);
    const invalid = {
      broken: [valid, file("{broken", "broken.json")],
      unknown: [valid, file({ format: "world" })],
      version: [valid, file({ ...libraries.functions, version: 99 })],
      duplicate: [valid, valid],
      three: [valid, file(libraries.functions), valid],
      oversized: [valid, file(JSON.stringify(libraries.functions) + " ".repeat(100_000))],
      read: [valid, file(libraries.functions)],
    }[failure];
    if (failure === "read") await page.evaluate(() => { File.prototype.text = async () => { throw new Error("文件读取失败"); }; });
    await page.locator(input).setInputFiles(invalid);
    await expect(page.locator(error)).toBeVisible();
    await expect(page.locator(confirm)).toBeDisabled();
    expect(await stored(page)).toEqual(libraries);
  });
}

for (const cancel of ["button", "escape", "during-read"]) {
  test(`全部导入 ${cancel} 取消不写入且可重新打开`, async ({ page }) => {
    await seed(page);
    if (cancel === "during-read") await page.evaluate(() => {
      const originalText = File.prototype.text;
      File.prototype.text = async function () {
        await new Promise((resolve) => { window.finishImportRead = resolve; });
        return originalText.call(this);
      };
    });
    await page.locator(input).setInputFiles(file(libraries.patterns));
    if (cancel === "during-read") {
      await expect.poll(() => page.evaluate(() => typeof window.finishImportRead)).toBe("function");
      await expect(page.locator(confirm)).toBeDisabled();
    } else await expect(page.locator(confirm)).toBeEnabled();
    if (cancel === "escape") await page.keyboard.press("Escape");
    else await page.locator("#cancelImportAllRecordsButton").click();
    if (cancel === "during-read") await page.evaluate(() => window.finishImportRead());
    await expect(page.locator(dialog)).not.toBeVisible();
    expect(await stored(page)).toEqual(libraries);
    await page.reload();
    await page.locator(input).setInputFiles(file(libraries.patterns));
    await expect(page.locator(confirm)).toBeEnabled();
  });
}

for (const failure of ["first", "second", "rollback", "corrupt-local"]) {
  test(`全部导入 ${failure} 存储失败不伪报成功`, async ({ page }) => {
    const empty = { patterns: { ...libraries.patterns, patterns: [] }, functions: { ...libraries.functions, functions: [] } };
    await seed(page, empty);
    if (failure === "corrupt-local") {
      await page.evaluate((key) => localStorage.setItem(key, "broken-original"), keys.functions);
      await page.reload();
    } else await page.evaluate(({ keys, failure }) => {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, raw) {
        if (failure === "first" && key === keys.patterns) throw new Error("写入失败");
        if (key === keys.functions) throw new Error("第二次写入失败");
        if (failure === "rollback" && key === keys.patterns && JSON.parse(raw).patterns.length === 0) throw new Error("回滚失败");
        return originalSet.call(this, key, raw);
      };
    }, { keys, failure });
    await page.locator(input).setInputFiles([file(libraries.patterns), file(libraries.functions)]);
    if (failure === "corrupt-local") {
      await expect(page.locator(error)).toBeVisible();
      await expect(page.locator(confirm)).toBeDisabled();
      expect(await page.evaluate((key) => localStorage.getItem(key), keys.functions)).toBe("broken-original");
    } else {
      await expect(page.locator(confirm)).toBeEnabled();
      await page.locator(confirm).click();
      if (failure === "rollback") {
        await expect(page.locator(error)).toContainText("部分回滚失败");
        expect((await stored(page)).patterns).toEqual(libraries.patterns);
        await expect(page.locator("#managePatternsButton")).toBeEnabled();
      } else {
        await expect(page.locator(error)).toContainText("原有记录已保留");
        expect(await stored(page)).toEqual(empty);
      }
      expect((await stored(page)).functions.functions).toEqual([]);
    }
    await expect(page.locator(dialog)).toBeVisible();
  });
}
