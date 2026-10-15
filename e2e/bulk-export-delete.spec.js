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
const bundle = (values) => ({ format: "conway-life-record-backup", version: 1, ...values });

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
      const files = new Map();
      let stateFailures = 0;
      window.fileAttempts = [];
      return {
        async getFileHandle(name, { create }) {
          if (!files.has(name)) {
            if (!create) throw new DOMException("不存在", "NotFoundError");
            files.set(name, { index: files.size, raw: "" });
          }
          const file = files.get(name);
          const fileIndex = file.index;
          const fails = (stage) => options.failure === `${fileIndex}-${stage}`;
          if (fails("handle")) throw new Error("文件创建失败");
          const stateFault = (stage) => {
            if (options.transient && stage === (options.transientStage || "create")) {
              if (stateFailures++ < (options.persistent ? 99 : 1)) {
                throw new DOMException("An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.", "InvalidStateError");
              }
            }
          };
          return {
            async createWritable() {
              window.fileAttempts.push(name);
              stateFault("create");
              if (fails("create")) throw new Error("文件流创建失败");
              let raw;
              return {
                async write(value) {
                  stateFault("write");
                  if (fails("write")) throw new Error("文件写入失败");
                  raw = value;
                },
                async close() {
                  stateFault("close");
                  if (fails("close")) throw new Error("文件关闭失败");
                  if (options.disk) await window.writeBulkBackup(name, raw);
                  file.raw = raw;
                  window.savedFiles.push({ name, raw });
                  if (options.hold) await new Promise((resolve) => { window.completeBulkBackup = resolve; });
                },
                async abort() { window.abortCalls += 1; },
              };
            },
            async getFile() {
              stateFault("read");
              if (fails("read")) throw new Error("文件读取失败");
              return { async text() {
                if (options.holdRead) await new Promise((resolve) => { window.completeBulkRead = resolve; });
                if (fails("empty")) return "";
                if (fails("mismatch")) return "不一致";
                return options.disk ? window.readBulkBackup(name) : file.raw;
              } };
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

test("主页全部备份：一份合并文件关闭回读后才清空，可用全部导入恢复", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  const directory = testInfo.outputPath("bulk-backup");
  await fs.mkdir(directory, { recursive: true });
  await page.exposeFunction("writeBulkBackup", (name, raw) => fs.writeFile(path.join(directory, name), raw));
  await page.exposeFunction("readBulkBackup", (name) => fs.readFile(path.join(directory, name), "utf8"));
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
    expect(name).toMatch(/^conway-life-records-.*\.json$/);
    expect(contents).toEqual(bundle(libraries));
  }
  expect(await fs.readdir(directory)).toHaveLength(1);
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
  const [filename] = await fs.readdir(directory);
  await page.locator("#importAllRecordsInput").setInputFiles(path.join(directory, filename));
  await page.locator("#confirmImportAllRecordsButton").click();
  expect(await stored(page)).toEqual(libraries);
  await page.reload();
  expect(await stored(page)).toEqual(libraries);
  await expect(page.locator(button)).toBeEnabled();
  expect(errors).toEqual([]);
});

for (const failure of ["cancel", "unsupported", "0-handle", "0-create", "0-write", "0-close", "storage-first", "storage-second"]) {
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
      expect(await page.evaluate(() => window.savedFiles.length)).toBe(1);
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
  expect(await page.evaluate(() => window.savedFiles.map(({ raw }) => JSON.parse(raw)))).toEqual([bundle(libraries)]);
});

for (const collection of ["patterns", "functions"]) {
  test(`全部备份：${collection} 为空仍保存在一份合并文件中`, async ({ page }) => {
    const values = { ...libraries, [collection]: { ...libraries[collection], [collection]: [] } };
    await seed(page, values);
    await picker(page);
    await page.locator(button).click();
    await expect(page.locator(button)).toBeDisabled();
    expect(await page.evaluate(() => window.savedFiles.map(({ raw }) => JSON.parse(raw)))).toEqual([bundle(values)]);
    const result = await stored(page);
    expect(result.patterns.patterns).toEqual([]);
    expect(result.functions.functions).toEqual([]);
  });
}

test("全部备份：两库为空时禁用按钮", async ({ page }) => {
  await seed(page, { patterns: { ...libraries.patterns, patterns: [] }, functions: { ...libraries.functions, functions: [] } });
  await expect(page.locator(button)).toBeDisabled();
});

test("全部备份：合并文件状态异常一次后重试完成保存及回读才清空", async ({ page }) => {
  await seed(page);
  await picker(page, { transient: true });
  await page.locator(button).click();
  await expect(page.locator(dialog)).not.toBeVisible();
  await expect(page.locator(error)).not.toBeVisible();
  expect((await stored(page)).functions.functions).toEqual([]);
  expect(await page.evaluate(() => window.savedFiles.length)).toBe(1);
});

for (const stage of ["write", "close", "read"]) {
  test(`全部备份：合并文件 ${stage} 状态异常恢复后回读成功`, async ({ page }) => {
    await seed(page);
    await picker(page, { transient: true, transientStage: stage });
    await page.locator(button).click();
    await expect(page.locator(dialog)).not.toBeVisible();
    await expect(page.locator(error)).not.toBeVisible();
    expect((await stored(page)).functions.functions).toEqual([]);
    expect(await page.evaluate(() => window.fileAttempts.length)).toBe(stage === "read" ? 1 : 2);
    expect(await page.evaluate(() => window.savedFiles.length)).toBe(1);
  });
}

test("全部备份：持续状态错误只重试一次，保留记录并报告文件与阶段", async ({ page }, testInfo) => {
  await seed(page);
  await picker(page, { transient: true, persistent: true });
  await page.locator(button).click();
  await expect(page.locator(error)).toContainText("conway-life-records-");
  await expect(page.locator(error)).toContainText("打开写入流失败（已重试一次）");
  await expect(page.locator(error)).toContainText("InvalidStateError");
  expect(await stored(page)).toEqual(libraries);
  expect(await page.evaluate(() => window.fileAttempts.length)).toBe(2);
  expect(await page.locator(error).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("backup-stage-error.png"), fullPage: true });
  await expect(page.locator(button)).toBeEnabled();
  await expect(page.locator("#importAllRecordsButton")).toBeEnabled();
});

for (const failure of ["0-read", "0-empty", "0-mismatch"]) {
  test(`全部备份：${failure} 回读校验失败即保留全部记录`, async ({ page }) => {
    await seed(page);
    await picker(page, { failure });
    await page.locator(button).click();
    await expect(page.locator(error)).toContainText("回读校验失败");
    await expect(page.locator(error)).toContainText("conway-life-records-");
    expect(await stored(page)).toEqual(libraries);
    await expect(page.locator(button)).toBeEnabled();
  });
}

test("全部备份：合并文件已关闭但回读未完成时不清空", async ({ page }) => {
  await seed(page);
  await picker(page, { holdRead: true });
  await page.locator(button).click();
  await expect.poll(() => page.evaluate(() => typeof window.completeBulkRead)).toBe("function");
  await expect(page.locator("#exportAllRecordsProgress")).toContainText("回读校验");
  expect(await stored(page)).toEqual(libraries);
  expect(await page.evaluate(() => window.savedFiles.length)).toBe(1);
  await page.evaluate(() => window.completeBulkRead());
  await expect(page.locator(dialog)).not.toBeVisible();
  expect((await stored(page)).patterns.patterns).toEqual([]);
});

for (const injectState of [false, true]) {
  test(`原生 OPFS：33图案大文件与6函数保存回读导入，状态注入=${injectState}`, async ({ page }) => {
    // 真实原生文件句柄；目录只属于当前独立浏览器测试上下文，不是用户磁盘目录。
    const cells = Array.from({ length: 2200 }, (_, i) => [Math.floor(i / 60), i % 60]);
    const values = {
      patterns: { ...libraries.patterns, patterns: Array.from({ length: 33 }, (_, i) => ({
        ...libraries.patterns.patterns[0], id: `custom-native-${i}`, name: `原生测试图案${i}`, width: 60, height: 37, cells,
      })) },
      functions: { ...libraries.functions, functions: Array.from({ length: 6 }, (_, i) => ({
        ...libraries.functions.functions[0], id: `function-native-${i}`, name: `NATIVE_${i}`,
      })) },
    };
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await seed(page, values);
    await page.evaluate(async (injectState) => {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(`backup-test-${crypto.randomUUID()}`, { create: true });
      window.nativeBackupDirectory = directory;
      const sentinel = await directory.getFileHandle("existing-backup.json", { create: true });
      const writer = await sentinel.createWritable();
      await writer.write("旧备份不可修改");
      await writer.close();
      let injected = false;
      window.showDirectoryPicker = async () => ({
        async getFileHandle(name, options) {
          const handle = await directory.getFileHandle(name, options);
          if (!injectState) return handle;
          return {
            async createWritable() {
              if (!injected) {
                injected = true;
                throw new DOMException("state had changed since it was read from disk", "InvalidStateError");
              }
              return handle.createWritable();
            },
            getFile: () => handle.getFile(),
          };
        },
      });
    }, injectState);
    await page.locator(button).click();
    await expect(page.locator(dialog)).not.toBeVisible();
    await expect(page.locator(error)).not.toBeVisible();
    expect((await stored(page)).functions.functions).toEqual([]);
    expect((await stored(page)).patterns.patterns).toEqual([]);
    const backups = await page.evaluate(async () => {
      const files = [];
      for await (const [name, handle] of window.nativeBackupDirectory.entries()) {
        const file = await handle.getFile();
        files.push({ name, raw: await file.text(), size: file.size });
      }
      return files;
    });
    expect(backups.find(({ name }) => name === "existing-backup.json").raw).toBe("旧备份不可修改");
    const exported = backups.filter(({ name }) => name !== "existing-backup.json");
    expect(exported).toHaveLength(1);
    expect(exported[0].size).toBeGreaterThan(2_500_000);
    expect(JSON.parse(exported[0].raw)).toEqual(bundle(values));
    await page.locator("#importAllRecordsInput").setInputFiles(exported.map(({ name, raw }) => ({ name, mimeType: "application/json", buffer: Buffer.from(raw) })));
    await expect(page.locator("#confirmImportAllRecordsButton")).toBeEnabled();
    await page.locator("#confirmImportAllRecordsButton").click();
    expect(await stored(page)).toEqual(values);
    await page.reload();
    expect(await stored(page)).toEqual(values);
    expect(errors).toEqual([]);
  });
}
