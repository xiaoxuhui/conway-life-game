"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Renderer = require("../scripts/renderer.js");

const viewport = { width: 1000, height: 600 };

test("屏幕中心与相机中心映射一致", () => {
  const camera = Renderer.createCamera({ centerRow: -10, centerColumn: 25, cellSize: 20 });
  assert.deepEqual(Renderer.screenToWorld({ x: 500, y: 300 }, viewport, camera), { row: -10, column: 25 });
  assert.deepEqual(Renderer.worldToScreen({ row: -10, column: 25 }, viewport, camera), { x: 500, y: 300 });
});

test("光标中心缩放保持锚点世界坐标不变", () => {
  const point = { x: 180, y: 430 };
  const camera = Renderer.createCamera({ centerRow: 40, centerColumn: -22, cellSize: 12 });
  const before = Renderer.screenToWorld(point, viewport, camera);
  const zoomed = Renderer.zoomCameraAt(camera, point, viewport, 2.4);
  const after = Renderer.screenToWorld(point, viewport, zoomed);
  assert.ok(Math.abs(before.row - after.row) < 1e-10);
  assert.ok(Math.abs(before.column - after.column) < 1e-10);
});

test("平移只改变中心坐标且方向符合拖动画布", () => {
  const camera = Renderer.createCamera({ centerRow: 0, centerColumn: 0, cellSize: 10 });
  assert.deepEqual(Renderer.panCamera(camera, 50, -20), {
    centerRow: 2,
    centerColumn: -5,
    cellSize: 10,
  });
});

test("格子拾取支持负世界坐标", () => {
  const camera = Renderer.createCamera({ centerRow: 0, centerColumn: 0, cellSize: 10 });
  assert.deepEqual(Renderer.cellAtPoint({ x: 489, y: 289 }, viewport, camera), { row: -2, column: -2 });
});

test("适应图案会居中并保留边距", () => {
  const camera = Renderer.fitCamera({ minRow: -5, maxRow: 4, minColumn: 100, maxColumn: 119 }, viewport);
  assert.equal(camera.centerRow, 0);
  assert.equal(camera.centerColumn, 110);
  assert.ok(camera.cellSize > 0 && camera.cellSize <= 64);
  const topLeft = Renderer.worldToScreen({ row: -5, column: 100 }, viewport, camera);
  assert.ok(topLeft.x >= 0 && topLeft.y >= 0);
});

test("缩放范围有数值安全保护", () => {
  const camera = Renderer.createCamera({ cellSize: 16 });
  const tiny = Renderer.zoomCameraAt(camera, { x: 500, y: 300 }, viewport, 1e-30);
  const huge = Renderer.zoomCameraAt(camera, { x: 500, y: 300 }, viewport, 1e30);
  assert.equal(tiny.cellSize, Renderer.MIN_CELL_SIZE);
  assert.equal(huge.cellSize, Renderer.MAX_CELL_SIZE);
});

test("主网格线取每 10 格的位置，正负方向与 0 都覆盖", () => {
  assert.equal(Renderer.GRID_MAJOR_STEP, 10);
  assert.deepEqual(Renderer.majorGridIndices(-23, 23), [-20, -10, 0, 10, 20]);
  assert.deepEqual(Renderer.majorGridIndices(0, 0), [0]);
  assert.deepEqual(Renderer.majorGridIndices(1, 9), []);
  assert.deepEqual(Renderer.majorGridIndices(10, 30), [10, 20, 30]);
  for (const index of Renderer.majorGridIndices(-1005, 1005)) {
    // 注意：-1000 % 10 得到 -0，strictEqual(-0, 0) 会失败，这里用 === 判定
    assert.ok(index % Renderer.GRID_MAJOR_STEP === 0);
    assert.ok(index >= -1005 && index <= 1005);
  }
});

test("主网格线在完整区间内不重不漏且间隔恒定", () => {
  const indices = Renderer.majorGridIndices(-100, 100);
  assert.equal(indices.length, 21);
  assert.equal(new Set(indices).size, indices.length);
  for (let i = 1; i < indices.length; i += 1) {
    assert.equal(indices[i] - indices[i - 1], Renderer.GRID_MAJOR_STEP);
  }
});

test("逻辑输出标签在观察前等待，观察后锁存为明确的 0 或 1", () => {
  assert.equal(Renderer.logicOutputLabel({ result: null, observeGeneration: 163 }), "O=? · 第 163 代");
  assert.equal(Renderer.logicOutputLabel({ result: 0, observeGeneration: 163 }), "O=0");
  assert.equal(Renderer.logicOutputLabel({ result: 1, observeGeneration: 163 }), "O=1");
});
