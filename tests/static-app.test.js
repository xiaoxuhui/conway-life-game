"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

test("页面包含全部核心控件", () => {
  for (const id of [
    "lifeCanvas",
    "runToggle",
    "stepButton",
    "clearButton",
    "randomButton",
    "speedRange",
    "generationValue",
    "presetSelect",
    "importInput",
    "exportButton",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `缺少 #${id}`);
  }
});

test("应用资源均为本地文件且不依赖 ES module 服务器行为", () => {
  assert.doesNotMatch(html, /<script[^>]+type=["']module["']/i);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  for (const relativePath of [
    "styles/main.css",
    "scripts/life-engine.js",
    "scripts/presets.js",
    "scripts/renderer.js",
    "scripts/app.js",
  ]) {
    assert.ok(fs.existsSync(path.join(projectRoot, relativePath)), `${relativePath} 不存在`);
  }
});

test("棋盘具有可访问名称和键盘焦点", () => {
  assert.match(html, /<canvas[\s\S]*?tabindex=["']0["'][\s\S]*?role=["']img["']/i);
  assert.match(html, /aria-live=["']polite["']/i);
});
