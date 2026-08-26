"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(projectRoot, "scripts", "app.js"), "utf8");

test("页面包含全部核心控件", () => {
  for (const id of [
    "lifeCanvas",
    "runToggle",
    "stepButton",
    "clearButton",
    "randomButton",
    "speedInput",
    "logicCodeInput",
    "logicCodeButton",
    "logicCodeFeedback",
    "logicFunctionSelect",
    "logicFunctionInputs",
    "loadLogicFunctionButton",
    "saveLogicFunctionButton",
    "manageLogicFunctionsButton",
    "saveLogicFunctionDialog",
    "manageLogicFunctionsDialog",
    "generationValue",
    "actualSpeedValue",
    "zoomValue",
    "presetSelect",
    "loadPresetButton",
    "rotatePatternButton",
    "flipPatternButton",
    "savePatternButton",
    "managePatternsButton",
    "savePatternDialog",
    "managePatternsDialog",
    "zoomOutButton",
    "zoomInButton",
    "fitViewButton",
    "importInput",
    "exportButton",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `缺少 #${id}`);
  }
});

test("演化速度使用可手动输入的数字框并公开有效范围", () => {
  assert.match(html, /id=["']speedInput["'][^>]*type=["']number["'][^>]*min=["']1["'][^>]*max=["']1000["'][^>]*step=["']1["']/);
  assert.doesNotMatch(html, /id=["']speedRange["']/);
  assert.match(html, /id=["']speedUnit["'][^>]*>代\/秒</);
  assert.match(html, /id=["']actualSpeedValue["']/);
  assert.match(appSource, /requestAnimationFrame/);
  assert.match(appSource, /FRAME_COMPUTE_BUDGET_MS/);
  assert.doesNotMatch(appSource, /setInterval\s*\(/);
});

test("逻辑代码生成器具有输入、提交、示例和无障碍反馈", () => {
  assert.match(html, /id=["']logicCodeInput["'][^>]*placeholder=["'][^"']*AND[^"']*NOT[^"']*["']/);
  assert.match(html, /id=["']logicCodeButton["'][^>]*>生成结构</);
  assert.match(html, /id=["']logicCodeFeedback["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /支持 0\/1、AND\/OR\/NOT/);
});

test("生成逻辑结构后保留用户输入的原始表达式", () => {
  assert.doesNotMatch(
    appSource,
    /logicCodeInput\.value\s*=\s*command\.expression/,
    "不能把 NOT(AND(1,1)) 改写为当前解析器无法再次识别的内部格式",
  );
});

test("应用资源均为本地文件且不依赖 ES module 服务器行为", () => {
  assert.doesNotMatch(html, /<script[^>]+type=["']module["']/i);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  for (const relativePath of [
    "styles/main.css",
    "scripts/life-engine.js",
    "scripts/presets.js",
    "scripts/pattern-library.js",
    "scripts/speed-control.js",
    "scripts/logic-parse.js",
    "scripts/logic-expand.js",
    "scripts/logic-compile.js",
    "scripts/logic-safety.js",
    "scripts/logic-code.js",
    "scripts/logic-function-library.js",
    "scripts/renderer.js",
    "scripts/app.js",
  ]) {
    assert.ok(fs.existsSync(path.join(projectRoot, relativePath)), `${relativePath} 不存在`);
  }
});

test("自定义图案对话框具备名称、说明、错误反馈和明确删除操作", () => {
  assert.match(html, /id=["']patternNameInput["'][^>]*maxlength=["']30["']/);
  assert.match(html, /id=["']patternDescriptionInput["'][^>]*maxlength=["']120["']/);
  assert.match(html, /id=["']savePatternError["'][^>]*role=["']alert["']/);
  assert.match(html, /id=["']deletePatternButton["']/);
});

test("我的函数库具备保存、载入、编辑和明确删除操作", () => {
  assert.match(html, /id=["']logicFunctionNameInput["'][^>]*maxlength=["']30["']/);
  assert.match(html, /id=["']manageLogicFunctionCode["'][^>]*maxlength=["']200["']/);
  assert.match(html, /id=["']saveLogicFunctionError["'][^>]*role=["']alert["']/);
  assert.match(html, /id=["']deleteLogicFunctionButton["']/);
  assert.match(appSource, /LogicCode\.parseExpanded\(expanded\)/);
  assert.match(appSource, /instantiateFunction/);
  assert.match(appSource, /expandFunctions/);
});

test("复杂逻辑生成提供非阻塞进度和取消状态", () => {
  assert.match(appSource, /composePatternAsync/);
  assert.match(appSource, /AbortController/);
  assert.match(appSource, /取消生成/);
  assert.match(appSource, /aria-busy/);
});

test("棋盘具有可访问名称和键盘焦点", () => {
  assert.match(html, /<canvas[\s\S]*?tabindex=["']0["'][\s\S]*?role=["']img["']/i);
  assert.match(html, /aria-live=["']polite["']/i);
});

test("无限世界的鼠标与触控操作有页面提示", () => {
  assert.match(html, /WORLD ∞/);
  assert.match(html, /滚轮缩放/);
  assert.match(html, /按住空格拖动/);
  assert.match(html, /aria-keyshortcuts=["'][^"']*0/);
});

test("图案放置控件公开旋转、翻转与完成快捷键", () => {
  assert.match(html, /id=["']rotatePatternButton["'][^>]*aria-keyshortcuts=["']R["']/);
  assert.match(html, /id=["']flipPatternButton["'][^>]*aria-keyshortcuts=["']F["']/);
  assert.match(html, /id=["']loadPresetButton["'][^>]*aria-pressed=["']false["']/);
  assert.match(html, /<kbd>R<\/kbd> 旋转/);
  assert.match(html, /<kbd>F<\/kbd> 翻转/);
});

test("逻辑门使用静物输出端和锁存标签，不再把普通细胞闪烁当作结果", () => {
  const renderer = fs.readFileSync(path.join(projectRoot, "scripts", "renderer.js"), "utf8");
  assert.match(appSource, /signalCells/);
  assert.match(appSource, /2×2 方块是静物输出端/);
  assert.match(renderer, /O=\?/);
  assert.match(renderer, /O=\$\{Number\(Boolean\(output\.result\)\)\}/);
});
