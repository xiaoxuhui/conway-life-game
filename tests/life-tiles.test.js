"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Life = require("../scripts/life-engine.js");
const Tiles = require("../scripts/life-tiles.js");
const { getPreset } = require("../scripts/presets.js");

test("分块演化与原引擎逐代一致，覆盖负坐标和区块交界", () => {
  let seed = 47;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const gun = getPreset("gosper-glider-gun").cells.map(([row, column]) => [row - 17, column - 28]);
  for (const initial of [Life.createWorld(gun), Life.randomWorld(41, 46, 0.27, random, -14, -17)]) {
    let expected = initial;
    let tiled = Tiles.prepare(initial);
    assert.notStrictEqual(tiled, initial);
    for (let generation = 1; generation <= 160; generation += 1) {
      expected = Life.nextGeneration(expected);
      tiled = Tiles.nextGeneration(tiled);
      assert.deepEqual(tiled.cells, expected.cells, "第 " + generation + " 代");
      assert.equal(Tiles.describeWorld(tiled).population, expected.cells.size);
    }
  }
});

test("分块循环验证绝对坐标，转换为可编辑棋盘时隔离相位数据", () => {
  const cells = [];
  for (let column = 0; column < 60; column += 5) {
    cells.push([0, column], [0, column + 1], [0, column + 2]);
  }
  const source = Life.createWorld(cells);
  const initial = Tiles.prepare(source);
  Life.setCell(source, 9, 9, true);
  assert.equal(Life.isAlive(initial, 9, 9), false);
  const tracker = Life.createCycleTracker({ describeWorld: Tiles.describeWorld, sameWorld: Tiles.sameWorld });
  const second = Tiles.nextGeneration(initial);
  const third = Tiles.nextGeneration(second);
  tracker.observe(initial, 0);
  tracker.observe(second, 1);
  assert.equal(tracker.observe(third, 2), 2);
  const target = tracker.fastForward(third, 2, 999).world;
  assert.equal(Tiles.sameWorld(target, second), true);
  const edited = Tiles.editableWorld(target);
  Life.setCell(edited, 9, 9, true);
  assert.equal(Life.isAlive(target, 9, 9), false);
  const moved = Tiles.prepare(Life.createWorld(cells.map(([row, column]) => [row + 16, column])));
  assert.equal(Tiles.sameWorld(moved, initial), false);
});

test("跨越分块范围时可无损回退到原引擎", () => {
  const limit = (2 ** 20 - 2) * 16;
  const glider = getPreset("glider").cells.map(([row, column]) => [row + limit - 3, column + limit - 3]);
  const blocks = Array.from({ length: 8 }, (_, index) => index * 4)
    .flatMap((column) => [[0, column], [0, column + 1], [1, column], [1, column + 1]]);
  const initial = Life.createWorld([...glider, ...blocks]);
  let expected = initial;
  let tiled = Tiles.prepare(initial);
  let fellBack = false;
  for (let generation = 0; generation < 20; generation += 1) {
    expected = Life.nextGeneration(expected);
    const advanced = Tiles.nextGeneration(tiled);
    if (!advanced) fellBack = true;
    tiled = advanced ?? Life.nextGeneration(tiled);
    assert.deepEqual(tiled.cells, expected.cells);
  }
  assert.equal(fellBack, true);
  const far = Life.placePattern(Life.createWorld(blocks), [[0, 0]], Life.MAX_COORDINATE, 0, false);
  assert.strictEqual(Tiles.prepare(far), far);
});
