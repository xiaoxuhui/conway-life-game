"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Life = require("../scripts/life-engine.js");
const { verifyRules } = require("../tools/verify-rules.cjs");

test("B/S 顺序、大小写、空白及 C2 规范为相同规则", () => {
  for (const raw of ["B3/S23", "S23/B3", " b3 / s32 / c2 ", "S23/B3/C2"]) {
    const rule = Life.parseRule(raw);
    assert.equal(rule.canonical, "B3/S23");
    assert.equal(rule.birth, "3");
    assert.equal(rule.survival, "23");
    assert.equal(rule.states, 2);
    assert.ok(Object.isFrozen(rule));
  }
  assert.equal(Life.parseRule("S3/B23/C2").canonical, "B23/S3");
  assert.equal(Life.parseRule("B2/S").survival, "");
  assert.equal(Life.parseRule("B/S0").survival, "0");
});

test("三个显示格式可来回转换而不改变语义", () => {
  const cases = { bs: "B23/S3", sb: "S3/B23", sbc: "S3/B23/C2" };
  for (const [notation, expected] of Object.entries(cases)) {
    assert.equal(Life.formatRule("S3/B23/C2", notation), expected);
    assert.equal(Life.parseRule(expected).canonical, "B23/S3");
  }
  assert.throws(() => Life.formatRule("B3/S23", "unknown"));
});

test("拒绝缺项、重复、非法数字、B0、多状态及超长输入", () => {
  for (const raw of [undefined, null, {}, "", "23/3", "B3", "B3/S23/S3", "B3/B2", "B33/S23", "B3/S223",
    "B9/S23", "B-1/S23", "B3/S23/", "B0/S23", "B03/S23", "B3/S23/C3", "B3/S23/C0", "B3/S23/C02", " ".repeat(65)]) {
    assert.throws(() => Life.parseRule(raw), `应拒绝 ${String(raw)}`);
  }
  assert.throws(() => Life.parseRule("B0/S23"), /无限/);
  assert.throws(() => Life.parseRule("S3/B23/C3"), /C2/);
});

test("自定义规则驱动世界演化，S0 单细胞存活且不改输入", () => {
  const world = Life.createWorld([[0, 0], [0, 1], [1, 0], [1, 1]]);
  const original = Life.aliveCoordinates(world);
  assert.equal(Life.countAlive(Life.nextGeneration(world)), 4);
  assert.equal(Life.countAlive(Life.nextGeneration(world, "S3/B23/C2")), 12);
  assert.deepEqual(Life.aliveCoordinates(world), original);
  assert.deepEqual(Life.nextGeneration(Life.createWorld([[0, 0]]), "B/S0").cells, new Set(["0,0"]));
  assert.throws(() => Life.nextCellSet(world.cells, "B0/S"));
});

test("所有 512 局部布局及每个邻居计数与独立密集参考一致", () => {
  assert.deepEqual(verifyRules(), { rules: 22, neighborhoods: 512, transitions: 11264 });
});

test("世界 v3 存档保留规范规则，旧 v1/v2 恢复康威默认", () => {
  const world = Life.createWorld([[-8, 2], [0, 0]]);
  const archive = Life.serialize(world, 7, Life.DEFAULT_VIEW, "S3/B23/C2");
  assert.equal(archive.version, 3);
  assert.equal(archive.rule, "B23/S3");
  const restored = Life.deserialize(JSON.stringify(archive));
  assert.equal(restored.rule, "B23/S3");
  assert.deepEqual(restored.world.cells, world.cells);
  assert.equal(restored.generation, 7);
  assert.equal(Life.deserialize({ ...archive, version: 2, rule: undefined }).rule, "B3/S23");
  assert.equal(Life.deserialize({ ...archive, version: 1, alive: [[0, 0]], rows: 2, columns: 2, rule: undefined }).rule, "B3/S23");
  assert.equal(Life.serialize(world).rule, "B3/S23");
  for (const rule of [undefined, null, "broken", "B0/S", "B3/S23/C4"]) {
    assert.throws(() => Life.deserialize({ ...archive, rule }));
  }
});
