"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");

const timestamp = "2026-10-11T00:00:00.000Z";
const cases = [
  {
    name: "函数", collection: "functions", retainedId: "function-retained",
    concurrentId: "function-concurrent", legacyDelete: "#deleteLogicFunctionButton",
    key: "conway-life-game.logic-functions.v1", format: "conway-life-logic-function-library", version: 2,
    manage: "#manageLogicFunctionsButton", dialog: "#manageLogicFunctionsDialog",
    select: "#manageLogicFunctionSelect", button: "#exportDeleteLogicFunctionButton",
    error: "#manageLogicFunctionError", form: "#manageLogicFunctionsForm",
    input: "#importLogicFunctionsInput", confirm: "#confirmImportLogicFunctionsButton",
    item: { id: "function-backup", name: "BACKUP", code: "AND(A,B)", inputs: [{ name: "A", defaultValue: 1 }, { name: "B", defaultValue: 0 }], createdAt: timestamp, updatedAt: timestamp },
  },
  {
    name: "图案", collection: "patterns", retainedId: "custom-retained",
    concurrentId: "custom-concurrent", legacyDelete: "#deletePatternButton",
    key: "conway-life-game.custom-patterns.v1", format: "conway-life-pattern-library", version: 1,
    manage: "#managePatternsButton", dialog: "#managePatternsDialog",
    select: "#managePatternSelect", button: "#exportDeletePatternButton",
    error: "#managePatternError", form: "#managePatternsForm",
    input: "#importPatternsInput", confirm: "#confirmImportPatternsButton",
    item: { id: "custom-backup", name: "备份方块", description: "逐项导出测试", width: 2, height: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]], createdAt: timestamp, updatedAt: timestamp },
  },
];

async function seed(page, config, count = 2) {
  const records = [config.item];
  if (count > 1) records.push({ ...config.item, id: config.retainedId, name: "保留记录" });
  const library = { format: config.format, version: config.version, [config.collection]: records };
  await page.goto("/");
  await page.evaluate(({ key, library }) => localStorage.setItem(key, JSON.stringify(library)), { key: config.key, library });
  await page.reload();
  await page.locator(config.manage).click();
  await page.locator(config.select).selectOption(config.item.id);
  return library;
}

async function stored(page, config) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), config.key);
}

for (const config of cases) {
  test(`${config.name}：文件成功关闭后才删除单项，备份可重新导入恢复`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const original = await seed(page, config);
    await page.locator(config.legacyDelete).click();
    const backupPath = testInfo.outputPath("record-backup.json");
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await page.exposeFunction("writeBackupToDisk", (raw) => fs.writeFile(backupPath, raw));
    await page.evaluate(() => {
      window.pickerCalls = 0;
      window.showSaveFilePicker = async (options) => {
        window.pickerCalls += 1;
        window.suggestedBackupName = options.suggestedName;
        return {
          async createWritable() {
            let raw;
            return {
              async write(value) { raw = value; },
              async close() {
                await window.writeBackupToDisk(raw);
                await new Promise((resolve) => { window.completeBackup = resolve; });
              },
              async abort() {},
            };
          },
        };
      };
    });
    await page.locator(config.button).click();
    await expect.poll(() => page.evaluate(() => typeof window.completeBackup)).toBe("function");
    expect(await stored(page, config)).toEqual(original);
    await expect(page.locator(config.button)).toBeDisabled();
    await expect(page.locator(config.select)).toBeDisabled();
    await page.locator(config.button).dispatchEvent("click");
    expect(await page.evaluate(() => window.pickerCalls)).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(config.dialog)).toBeVisible();
    const exported = JSON.parse(await fs.readFile(backupPath, "utf8"));
    expect(exported).toEqual({ ...original, [config.collection]: [config.item] });
    // 模拟另一页面在文件保存期间新增记录，不能被本次删除覆盖掉。
    const concurrent = { ...config.item, id: config.concurrentId, name: "同步新增" };
    await page.evaluate(({ key, library }) => localStorage.setItem(key, JSON.stringify(library)), {
      key: config.key, library: { ...original, [config.collection]: [...original[config.collection], concurrent] },
    });
    await page.evaluate(() => window.completeBackup());
    await expect(page.locator(config.form)).not.toHaveAttribute("aria-busy", "true");
    expect((await stored(page, config))[config.collection]).toEqual([original[config.collection][1], concurrent]);
    await expect(page.locator(config.select)).toHaveValue(config.retainedId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const rect = await page.locator(config.button).boundingBox();
    const dialogRect = await page.locator(config.dialog).boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(dialogRect.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(dialogRect.x + dialogRect.width);
    await page.screenshot({ path: testInfo.outputPath("record-export-delete.png"), fullPage: true });
    await page.locator(`${config.dialog} .dialog-close`).click();
    await page.reload();
    expect((await stored(page, config))[config.collection]).toHaveLength(2);
    await page.locator(config.input).setInputFiles(backupPath);
    await page.locator(config.confirm).click();
    const restored = (await stored(page, config))[config.collection];
    expect(restored).toHaveLength(3);
    expect(restored.find((record) => record.id === config.item.id)).toEqual(config.item);
    expect(errors).toEqual([]);
  });

  test(`${config.name}：保存过程中目标被更新时保留新内容`, async ({ page }) => {
    const original = await seed(page, config);
    await page.evaluate(() => {
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async () => {},
          close: () => new Promise((resolve) => { window.completeBackup = resolve; }),
        }),
      });
    });
    await page.locator(config.button).click();
    await expect.poll(() => page.evaluate(() => typeof window.completeBackup)).toBe("function");
    const updated = { ...original, [config.collection]: original[config.collection].map((record, index) => (
      index === 0 ? { ...record, name: "保存期间更新" } : record
    )) };
    await page.evaluate(({ key, library }) => localStorage.setItem(key, JSON.stringify(library)), { key: config.key, library: updated });
    await page.evaluate(() => window.completeBackup());
    await expect(page.locator(config.error)).toContainText("所选记录已变化");
    expect(await stored(page, config)).toEqual(updated);
  });

  for (const failure of ["cancel", "create", "write", "close", "unsupported", "storage"]) {
    test(`${config.name}：${failure} 失败保留记录`, async ({ page }) => {
      const original = await seed(page, config);
      await page.evaluate(({ failure, key }) => {
        if (failure === "unsupported") {
          window.showSaveFilePicker = undefined;
          return;
        }
        window.showSaveFilePicker = async () => {
          if (failure === "cancel") throw new DOMException("取消", "AbortError");
          return {
            async createWritable() {
              if (failure === "create") throw new Error("无法创建文件");
              return {
                async write() { if (failure === "write") throw new Error("写入失败"); },
                async close() { if (failure === "close") throw new Error("关闭失败"); },
                async abort() {},
              };
            },
          };
        };
        if (failure === "storage") {
          const originalSet = Storage.prototype.setItem;
          Storage.prototype.setItem = function (storageKey, value) {
            if (storageKey === key) throw new DOMException("空间不足", "QuotaExceededError");
            return originalSet.call(this, storageKey, value);
          };
        }
      }, { failure, key: config.key });
      await page.locator(config.button).click();
      await expect(page.locator(config.form)).not.toHaveAttribute("aria-busy", "true");
      expect(await stored(page, config)).toEqual(original);
      await expect(page.locator(config.button)).toBeEnabled();
      if (failure === "cancel") await expect(page.locator("#toastMessage")).toHaveText("已取消保存，记录已保留");
      else await expect(page.locator(config.error)).toContainText("记录已保留");
      if (failure === "storage") await expect(page.locator(config.error)).toContainText("备份已保存");
    });
  }

  test(`${config.name}：最后一项保存后删除，窗口关闭且重载后仍为空`, async ({ page }) => {
    await seed(page, config, 1);
    await page.evaluate(() => {
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      });
    });
    await page.locator(config.button).click();
    await expect(page.locator(config.dialog)).not.toBeVisible();
    expect((await stored(page, config))[config.collection]).toEqual([]);
    await page.reload();
    await expect(page.locator(config.manage)).toBeDisabled();
    await expect(page.locator("#lifeCanvas")).toBeVisible();
  });
}
