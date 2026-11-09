"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Life = require("../scripts/life-engine.js");
const Tiles = require("../scripts/life-tiles.js");
const { buildStack } = require("../scripts/life-stack.js");
const { getPreset } = require("../scripts/presets.js");

const horizontal = [[0, -1], [0, 0], [0, 1]];
const vertical = [[-1, 0], [0, 0], [1, 0]];
const snapshot = (world, rule = Life.DEFAULT_RULE) => ({ world, rule, generation: 7 });
const keys = (layer) => new Set(layer.map(String));

test("3D evolution includes the starting generation and every following generation", async () => {
  const world = Life.createWorld(horizontal);
  const result = await buildStack(snapshot(world), 3);
  assert.equal(result.generation, 7);
  assert.equal(result.pitch, 1);
  assert.deepEqual(result.layers.map(keys), [horizontal, vertical, horizontal, vertical].map(keys));
  assert.deepEqual(world.cells, keys(horizontal));
});

test("3D evolution follows the selected rule and keeps empty layers", async () => {
  const world = Life.createWorld([[0, 0]]);
  const survives = await buildStack(snapshot(world, "B3/S0"), 2);
  assert.deepEqual(survives.layers, [[[0, 0]], [[0, 0]], [[0, 0]]]);
  const dies = await buildStack(snapshot(world), 2);
  assert.deepEqual(dies.layers, [[[0, 0]], [], []]);
});

test("3D evolution respects glider cleanup after the starting layer", async () => {
  const block = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const glider = getPreset("glider").cells.map(([row, column]) => [row + 20, column + 20]);
  const world = Life.createWorld([...block, ...glider]);
  const result = await buildStack({ ...snapshot(world), pruneGliders: true }, 1);
  assert.deepEqual(result.layers.map(keys), [[...block, ...glider], block].map(keys));
});

test("3D evolution rebins earlier layers when the pattern expands past the display limit", async () => {
  const block = [[20, 62], [20, 63], [21, 62], [21, 63]];
  const result = await buildStack(snapshot(Life.createWorld([...vertical, ...block])), 2);
  assert.equal(result.pitch, 2);
  assert.deepEqual(result.layers.map(keys), [
    [[-1, 0], [0, 0], [10, 31]],
    [[0, -1], [0, 0], [10, 31]],
    [[-1, 0], [0, 0], [10, 31]],
  ].map(keys));
});

test("3D evolution reads and evolves large tiled worlds without materializing cells", async () => {
  const cells = Array.from({ length: 8 }, (_, index) => {
    const column = (index - 4) * 256;
    return [[0, column], [0, column + 1], [1, column], [1, column + 1]];
  }).flat();
  const world = Tiles.prepare(Life.createWorld(cells));
  assert.ok(Tiles.describeWorld(world));
  Object.defineProperty(world, "cells", { get() { throw new Error("materialized world"); } });
  const result = await buildStack(snapshot(world), 2);
  const blocks = keys(cells.map(([row, column]) => [Math.floor(row / result.pitch), Math.floor(column / result.pitch)]));
  assert.ok(result.pitch >= Tiles.TILE_SIZE);
  assert.deepEqual(result.layers.map(keys), [blocks, blocks, blocks]);
});

test("3D evolution stops after cancellation and rejects invalid generation counts", async () => {
  const source = snapshot(Life.createWorld(horizontal));
  let done = 0;
  assert.equal(await buildStack(source, 32, {
    isCurrent: () => done < 2,
    onProgress: (count) => { done = count; },
  }), null);
  assert.equal(done, 2);
  await assert.rejects(buildStack(source, 33), RangeError);
});
