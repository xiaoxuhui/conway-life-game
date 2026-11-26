"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Life = require("../scripts/life-engine.js");
const Presets = require("../scripts/presets.js");
const Tools = require("../scripts/glider-tools.js");

function advance(cells, steps) {
  let world = Life.createWorld(cells);
  for (let step = 0; step < steps; step += 1) world = Life.nextGeneration(world);
  return world;
}

test("p60 gun repeats its body and emits six additional gliders in 360 generations", () => {
  const gun = Presets.getPreset("glider-gun-p60");
  const initial = new Set(gun.cells.map(String));
  for (const generation of [60, 180, 360]) {
    const world = advance(gun.cells, generation);
    const body = Life.aliveCoordinates(world).filter(([r, c]) => r >= 0 && r < gun.height && c >= 0 && c < gun.width);
    assert.deepEqual(new Set(body.map(String)), initial);
    assert.equal(world.cells.size, gun.cells.length + generation / 60 * 5);
  }
});

test("classic reflector, eater and duplicator recover after three period-60 and period-120 inputs", () => {
  for (const [id, outputs] of [
    ["classic-glider-reflector", 3],
    ["glider-eater", 0],
    ["glider-duplicator-p60", 6],
  ]) {
    const preset = Presets.getPreset(id);
    const input = new Set(preset.component.input.map(String));
    const body = preset.cells.filter((cell) => !input.has(String(cell)));
    for (const period of [60, 120]) {
      const steps = period * 2 + 360;
      const generated = Tools.componentPattern(preset, period);
      const world = advance(generated.cells, steps);
      const raw = [...preset.cells, ...preset.component.input.map(([r, c]) => [r - period / 2, c - period / 2])];
      const box = Life.bounds(Life.createWorld(raw));
      const reference = Life.aliveCoordinates(advance(body, steps))
        .map(([r, c]) => [r - box.minRow, c - box.minColumn]);
      assert.ok(reference.every((cell) => world.cells.has(String(cell))), id + " body changed");
      assert.equal(world.cells.size, reference.length + outputs * 5, id + " output count");
      for (const cell of reference) world.cells.delete(String(cell));
      if (outputs) {
        const later = advance(Life.aliveCoordinates(world), 4);
        assert.equal(later.cells.size, outputs * 5, id + " outputs are not isolated spaceships");
        const delta = id === "classic-glider-reflector" ? [[1, -1]] : [[1, 1], [-1, 1]];
        assert.ok(Life.aliveCoordinates(later).every(([r, c]) =>
          delta.some(([dr, dc]) => world.cells.has((r - dr) + "," + (c - dc)))), id + " output directions");
      }
    }
  }
});

test("all supported recipes create the requested target from pure gliders and from guns", async () => {
  for (const id of ["block", "blinker", "beehive", "boat", "loaf", "glider"]) {
    let target = Presets.getPreset(id);
    target = Presets.flipPattern(Presets.rotatePattern(target));
    for (const guns of [false, true]) {
      const generated = await Tools.synthesize(target.cells, { guns, period: 60 });
      const world = advance(generated.cells, generated.synthesis.generation);
      const expected = new Set(generated.synthesis.target.map(String));
      assert.ok([...expected].every((cell) => world.cells.has(cell)), id + " missing target");
      if (!guns) {
        assert.equal(generated.cells.length, generated.synthesis.gliderCount * 5);
        assert.deepEqual(world.cells, expected);
      } else {
        assert.equal(generated.synthesis.gunCount, generated.synthesis.gliderCount);
        assert.ok(generated.cells.length >= generated.synthesis.gunCount * 113);
      }
    }
  }
});

test("unsupported recipes and periods fail before returning a replacement", async () => {
  for (const period of [0, 30, 61, Number.MAX_SAFE_INTEGER + 1, "", "bad"]) assert.throws(() => Tools.parsePeriod(period));
  assert.equal(Tools.parsePeriod("120"), 120);
  assert.equal(Tools.parsePeriod("3660"), 3660);
  await assert.rejects(Tools.synthesize(Presets.getPreset("block").cells, { guns: true, period: 120 }), /固定 60/);
  await assert.rejects(Tools.synthesize([[0, 0]]), /尚无/);
  await assert.rejects(Tools.synthesize([]), /请先/);
});
