"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

const block = [[0, 0], [0, 1], [1, 0], [1, 1]];
const archive = (values = {}) => ({
  format: "conway-life-game", version: 2, generation: 7, alive: block,
  view: { centerRow: 0, centerColumn: 0, cellSize: 16 }, ...values,
});

async function importWorld(page, data) {
  await page.locator("#importInput").setInputFiles({
    name: "world.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)),
  });
}

async function seed(page) {
  await page.goto("/");
  await importWorld(page, archive());
  await expect(page.locator("#aliveValue")).toHaveText("4");
}

async function applyRule(page, rule) {
  await page.locator("#ruleInput").fill(rule);
  await page.locator("#applyRuleButton").click();
}

async function exportedWorld(page) {
  const promise = page.waitForEvent("download");
  await page.locator("#exportButton").click();
  const download = await promise;
  return JSON.parse(await fs.readFile(await download.path(), "utf8"));
}

test("跳步只按完整间隔显示，循环节及时出现且暂停后可单步", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.goto("/");
  const generation = page.locator("#generationValue");
  const period = page.locator("#cyclePeriodValue");
  const run = page.locator("#runToggle");
  const jumpSize = page.getByRole("spinbutton", { name: "跳步" });
  await importWorld(page, archive({ alive: [[0, -1], [0, 0], [0, 1]] }));
  await expect(generation).toHaveText("7");
  await expect(jumpSize).toHaveValue("1");
  await page.locator("#speedInput").fill("10");
  await jumpSize.fill("4");
  await run.click();

  await page.clock.runFor(270);
  await expect(period).toHaveText("2 代");
  await expect(generation).toHaveText("7");
  await page.clock.runFor(180);
  await expect(generation).toHaveText("11");
  await page.clock.runFor(100);
  await expect(generation).toHaveText("11");

  await run.click();
  await expect(generation).toHaveText("12");
  await page.keyboard.press("Tab");
  await expect(generation).toHaveText("13");
  await page.locator("#stepButton").click();
  await expect(generation).toHaveText("14");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("棋盘实际重现才显示循环节，编辑和换规则后重新检测", async ({ page }) => {
  await page.goto("/");
  const blink = archive({ alive: [[0, -1], [0, 0], [0, 1]] });
  const period = page.locator("#cyclePeriodValue");
  const step = page.locator("#stepButton");
  await importWorld(page, blink);
  await expect(page.locator("#generationValue")).toHaveText("7");
  await expect(period).toBeHidden();
  await step.click();
  await expect(period).toBeHidden();
  await step.click();
  await expect(page.locator("#generationValue")).toHaveText("9");
  await expect(period).toBeVisible();
  await expect(period).toHaveText("2 代");

  await page.locator("#lifeCanvas").click({ position: { x: 40, y: 40 } });
  await expect(period).toBeHidden();
  await importWorld(page, blink);
  await expect(page.locator("#generationValue")).toHaveText("7");
  const speed = page.locator("#speedInput");
  await speed.fill("20000");
  await page.locator("#runToggle").click();
  await expect(speed).toHaveValue("10000");
  await expect(period).toHaveText("2 代");
  await expect(page.locator("#statusText")).toHaveText("演化中");
  await expect.poll(async () => Number((await page.locator("#actualSpeedValue").textContent()).replace(/\D/g, ""))).toBeGreaterThan(1000);
  await page.locator("#runToggle").click();
  await expect(period).toHaveText("2 代");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await applyRule(page, "B36/S23");
  await expect(period).toBeHidden();
});

test("规则输入和三种格式切换必须明确应用，摘要与移动布局同步", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  await page.locator("#ruleInput").fill("s3 / b32 / c2");
  for (const [notation, draft, active] of [
    ["bs", "B23/S3", "B3/S23"], ["sb", "S3/B23", "S23/B3"], ["sbc", "S3/B23/C2", "S23/B3/C2"],
  ]) {
    await page.locator("#ruleNotationSelect").selectOption(notation);
    await expect(page.locator("#ruleInput")).toHaveValue(draft);
    await expect(page.locator("#activeRule")).toHaveText(active);
    await expect(page.locator("#aliveValue")).toHaveText("4");
  }
  await page.locator("#applyRuleButton").click();
  await expect(page.locator("#activeRule")).toHaveText("S3/B23/C2");
  await expect(page.locator("#ruleBirth")).toHaveText("2、3");
  await expect(page.locator("#ruleSurvival")).toHaveText("3");
  await expect(page.locator("#generationValue")).toHaveText("7");
  await expect(page.locator("#lifeCanvas")).toHaveAttribute("aria-label", /规则 B23\/S3/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator("#ruleForm").screenshot({ path: testInfo.outputPath("rule-settings.png") });
  await page.screenshot({ path: testInfo.outputPath("rules-homepage.png"), fullPage: true });
  await page.locator("#resetRuleButton").click();
  await expect(page.locator("#ruleInput")).toHaveValue("S23/B3/C2");
  await expect(page.locator("#ruleBirth")).toHaveText("3");
  await expect(page.locator("#ruleSurvival")).toHaveText("2、3");
  expect(errors).toEqual([]);
});

test("单步实际使用自定义规则，S0 与空存活集合也可运行", async ({ page }) => {
  await seed(page);
  await page.locator("#stepButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await applyRule(page, "S3/B23/C2");
  await page.locator("#stepButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("12");
  await importWorld(page, archive());
  await applyRule(page, "B2/S");
  await page.locator("#stepButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("8");
  await importWorld(page, archive({ version: 3, rule: "B/S0", alive: [[0, 0]] }));
  await page.locator("#stepButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("1");
});

test("应用暂停正在运行的世界并保留细胞代数，重新开始使用新规则", async ({ page }) => {
  await seed(page);
  await page.clock.install();
  await page.locator("#speedInput").fill("1");
  await page.locator("#runToggle").click();
  await page.clock.runFor(1200);
  const generation = await page.locator("#generationValue").textContent();
  await applyRule(page, "B23/S3");
  await expect(page.locator("#statusText")).toHaveText("已暂停");
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await expect(page.locator("#generationValue")).toHaveText(generation);
  await page.clock.runFor(1200);
  await expect(page.locator("#generationValue")).toHaveText(generation);
  await page.locator("#runToggle").click();
  await page.clock.runFor(1100);
  await expect(page.locator("#aliveValue")).toHaveText("12");
  await page.locator("#runToggle").click();
});

test("无效规则不会暂停或改变当前规则，错误可修正，输入不触发全局快捷键", async ({ page }) => {
  await seed(page);
  await page.locator("#runToggle").click();
  for (const rule of ["B0/S23", "S3/B23/C3", "23/3", "B9/S23", "B33/S23"]) {
    await applyRule(page, rule);
    await expect(page.locator("#ruleError")).toBeVisible();
    await expect(page.locator("#ruleInput")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#activeRule")).toHaveText("B3/S23");
    await expect(page.locator("#statusText")).toHaveText("演化中");
    await expect(page.locator("#aliveValue")).toHaveText("4");
  }
  await page.locator("#ruleInput").fill("B3/S23");
  await page.locator("#ruleInput").press("Space");
  await expect(page.locator("#statusText")).toHaveText("演化中");
  await page.locator("#applyRuleButton").click();
  await expect(page.locator("#ruleError")).not.toBeVisible();
  await expect(page.locator("#statusText")).toHaveText("已暂停");
});

test("世界 v3 导出导入恢复规则，旧 v2 重置为康威，坏规则拒绝且不改世界", async ({ page }) => {
  await seed(page);
  await applyRule(page, "S3/B23/C2");
  const saved = await exportedWorld(page);
  expect(saved).toEqual(archive({ version: 3, rule: "B23/S3" }));
  await page.locator("#resetRuleButton").click();
  await importWorld(page, saved);
  await expect(page.locator("#activeRule")).toHaveText("B23/S3");
  await page.locator("#ruleInput").fill("unsaved draft");
  await page.locator("#ruleNotationSelect").selectOption("sbc");
  await expect(page.locator("#ruleError")).toBeVisible();
  await importWorld(page, saved);
  await expect(page.locator("#ruleError")).not.toBeVisible();
  await expect(page.locator("#ruleInput")).toHaveValue("S3/B23/C2");
  for (const rule of [undefined, "B0/S23", "B3/S23/C3"]) {
    await importWorld(page, { ...saved, alive: [[5, 5]], rule });
    await expect(page.locator("#toastMessage")).toContainText("导入失败");
    expect(await exportedWorld(page)).toEqual(saved);
  }
  await importWorld(page, archive());
  await expect(page.locator("#activeRule")).toHaveText("S23/B3/C2");
  await expect(page.locator("#logicCodeButton")).toBeEnabled();
});

test("自定义规则禁止生成及输出锁存，恢复默认可重新生成", async ({ page }) => {
  await page.goto("/");
  await page.locator("#logicCodeInput").fill("NOT 0");
  await page.locator("#logicCodeButton").click();
  await expect(page.locator("#statusText")).toHaveText("放置中");
  await page.locator("#lifeCanvas").click({ position: { x: 120, y: 120 } });
  await page.locator("#loadPresetButton").click();
  await expect(page.locator("#lifeCanvas")).toHaveAttribute("aria-label", /逻辑输出/);
  await applyRule(page, "B23/S3");
  await expect(page.locator("#logicCodeButton")).toBeDisabled();
  await expect(page.locator("#ruleNotice")).toContainText("已停用生成与输出锁存");
  await expect(page.locator("#lifeCanvas")).not.toHaveAttribute("aria-label", /逻辑输出/);
  await page.locator("#logicCodeForm").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#logicCodeFeedback")).toContainText("只适用于 B3/S23");
  await page.locator("#presetSelect").selectOption("builtin:logic-not-0");
  await page.locator("#loadPresetButton").click();
  await page.locator("#lifeCanvas").click({ position: { x: 180, y: 160 } });
  await page.locator("#loadPresetButton").click();
  await expect(page.locator("#lifeCanvas")).not.toHaveAttribute("aria-label", /逻辑输出/);
  await page.locator("#resetRuleButton").click();
  await page.locator("#logicCodeButton").click();
  await expect(page.locator("#logicCodeFeedback")).toContainText("预期 O=1");
});

test("切换规则取消正在验证的电路，不能异步留下旧规则的预览", async ({ page }) => {
  await page.goto("/");
  await page.locator("#logicCodeInput").fill("NOT(AND(1,1))");
  await page.getByRole("checkbox", { name: /验证安全线路/ }).check();
  await page.locator("#logicCodeButton").click();
  await expect(page.locator("#logicCodeButton")).toHaveText("取消生成");
  await applyRule(page, "B23/S3");
  await expect(page.locator("#logicCodeForm")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#statusText")).toHaveText("已暂停");
  await expect(page.locator("#logicCodeButton")).toBeDisabled();
  await expect(page.locator("#logicCodeFeedback")).toHaveText("");
  await page.locator("#stepButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("0");
  await expect(page.locator("#statusText")).toHaveText("已暂停");
});

test("随机清空撤销保留当前规则，应用新规则清除过期撤销", async ({ page }) => {
  await seed(page);
  await applyRule(page, "B23/S3");
  await page.locator("#clearButton").click();
  await page.locator("#undoButton").click();
  await expect(page.locator("#aliveValue")).toHaveText("4");
  await expect(page.locator("#activeRule")).toHaveText("B23/S3");
  await page.locator("#randomButton").click();
  await expect(page.locator("#activeRule")).toHaveText("B23/S3");
  await page.locator("#clearButton").click();
  await applyRule(page, "B/S0");
  await expect(page.locator("#undoButton")).not.toBeVisible();
  await expect(page.locator("#aliveValue")).toHaveText("0");
  await page.reload();
  await expect(page.locator("#activeRule")).toHaveText("B3/S23");
});
