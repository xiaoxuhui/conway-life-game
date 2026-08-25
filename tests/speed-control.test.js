"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Speed = require("../scripts/speed-control.js");

test("范围内整数可以即时作为演化速度", () => {
  for (const value of ["1", "5", "20", "60", "300", "1000"]) {
    assert.equal(Speed.isValidInput(value), true);
    assert.equal(Speed.normalize(value, 5), Number(value));
  }
});

test("编辑中的空值、非数字和小数不是即时有效速度", () => {
  for (const value of ["", " ", "abc", "4.5", "0", "1001"]) {
    assert.equal(Speed.isValidInput(value), false);
  }
});

test("确认输入时恢复空值并取整限制越界数值", () => {
  assert.equal(Speed.normalize("", 7), 7);
  assert.equal(Speed.normalize("abc", 7), 7);
  assert.equal(Speed.normalize("4.6", 7), 5);
  assert.equal(Speed.normalize("-8", 7), 1);
  assert.equal(Speed.normalize("9999", 7), 1000);
});

test("按经过时间累积代数并限制页面恢复后的追赶量", () => {
  assert.equal(Speed.accumulate(0, 16, 1000), 16);
  assert.equal(Speed.accumulate(0.5, 100, 5), 1);
  assert.equal(Speed.accumulate(0, 10_000, 1000), 250);
  assert.equal(Speed.accumulate(0, 10_000, 1), 0.25);
  assert.equal(Speed.FRAME_COMPUTE_BUDGET_MS, 10);
  assert.equal(Speed.ACTUAL_SPEED_WINDOW_MS, 500);
});
