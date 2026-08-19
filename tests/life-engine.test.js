"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Life = require("../scripts/life-engine.js");
const { getPreset } = require("../scripts/presets.js");

function coordinates(board) {
  return Life.aliveCoordinates(board).map((cell) => cell.join(",")).sort();
}

test("空棋盘和单细胞按规则死亡", () => {
  const empty = Life.createBoard(5, 5);
  assert.equal(Life.countAlive(Life.nextGeneration(empty)), 0);

  const single = Life.createBoard(5, 5, [[2, 2]]);
  assert.equal(Life.countAlive(Life.nextGeneration(single)), 0);
});

test("2×2 方块是稳定静物", () => {
  const block = Life.createBoard(6, 6, [[2, 2], [2, 3], [3, 2], [3, 3]]);
  assert.deepEqual(coordinates(Life.nextGeneration(block)), coordinates(block));
});

test("闪烁器周期为 2", () => {
  const horizontal = Life.createBoard(5, 5, [[2, 1], [2, 2], [2, 3]]);
  const vertical = Life.nextGeneration(horizontal);
  assert.deepEqual(coordinates(vertical), ["1,2", "2,2", "3,2"]);
  assert.deepEqual(coordinates(Life.nextGeneration(vertical)), coordinates(horizontal));
});

test("滑翔机 4 代后向右下移动一格", () => {
  const preset = getPreset("glider");
  let board = Life.placePattern(Life.createBoard(10, 10), preset.cells, 1, 1);
  for (let step = 0; step < 4; step += 1) board = Life.nextGeneration(board);
  assert.deepEqual(coordinates(board), ["2,3", "3,4", "4,2", "4,3", "4,4"]);
});

test("有限边界以外视为死亡", () => {
  const corner = Life.createBoard(3, 3, [[0, 0], [0, 1], [1, 0]]);
  assert.deepEqual(coordinates(Life.nextGeneration(corner)), ["0,0", "0,1", "1,0", "1,1"]);
});

test("计算下一代不会修改输入棋盘", () => {
  const board = Life.createBoard(5, 5, [[1, 2], [2, 2], [3, 2]]);
  const snapshot = new Uint8Array(board.cells);
  const next = Life.nextGeneration(board);
  assert.deepEqual(board.cells, snapshot);
  assert.notStrictEqual(next.cells, board.cells);
});

test("随机填充可以注入确定性随机源", () => {
  const values = [0.1, 0.3, 0.2, 0.9];
  const board = Life.randomBoard(2, 2, 0.25, () => values.shift());
  assert.deepEqual(coordinates(board), ["0,0", "1,0"]);
});

test("序列化可无损往返", () => {
  const original = Life.createBoard(8, 9, [[0, 0], [3, 4], [7, 8]]);
  const json = JSON.stringify(Life.serialize(original, 42));
  const restored = Life.deserialize(json);
  assert.equal(restored.generation, 42);
  assert.equal(restored.board.rows, 8);
  assert.equal(restored.board.columns, 9);
  assert.deepEqual(coordinates(restored.board), coordinates(original));
});

test("非法导入不会生成棋盘", () => {
  assert.throws(() => Life.deserialize("not-json"), /有效的 JSON/);
  assert.throws(() => Life.deserialize({ format: "other", version: 1 }), /格式不受支持/);
  assert.throws(() => Life.deserialize({
    format: Life.FORMAT,
    version: 1,
    rows: 3,
    columns: 3,
    generation: 0,
    alive: [[3, 0]],
  }), /行坐标/);
});

test("图案越界时拒绝放置", () => {
  const board = Life.createBoard(3, 3);
  assert.throws(() => Life.placePattern(board, [[0, 0], [0, 1]], 2, 2), /无法完整放入/);
});

test("所有预设坐标都位于声明尺寸内", () => {
  const { presets } = require("../scripts/presets.js");
  assert.ok(presets.length >= 3);
  for (const preset of presets) {
    assert.ok(preset.cells.length > 0, `${preset.name} 不应为空`);
    const unique = new Set();
    for (const [row, column] of preset.cells) {
      assert.ok(row >= 0 && row < preset.height, `${preset.name} 行坐标越界`);
      assert.ok(column >= 0 && column < preset.width, `${preset.name} 列坐标越界`);
      unique.add(`${row}:${column}`);
    }
    assert.equal(unique.size, preset.cells.length, `${preset.name} 不应有重复坐标`);
  }
});
