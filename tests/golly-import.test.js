"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { gzipSync } = require("node:zlib");
const Golly = require("../scripts/golly-import.js");

const glider = [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
const macrocell = "[M2] (golly 5.0)\n#R B3/S23\n#G 500\n$$..*$...*$.***$$$$\n4 0 1 0 0\n";

test("Golly Extended RLE 识别位置和代数注释、跳行和两状态别名", () => {
  const pattern = Golly.parsePattern(
    "\uFEFF#N 滑翔机\r\n#CXRLE Pos=-42,76 Gen=800\r\nx = 9, y = 9, rule = 23/3\r\n2$3.A$4bo$\r\n2b3A!",
  );
  assert.deepEqual(pattern, { name: "滑翔机", cells: glider, rule: "B3/S23", width: 3, height: 3 });
  assert.equal(Golly.parsePattern("x=1,y=1\no").rule, null);
});

test("Macrocell 支持共享节点、空象限、相对坐标和 gzip 文件", async () => {
  const file = new File([gzipSync(macrocell)], "glider.mc.gz");
  const pattern = await Golly.readFile(file);
  assert.deepEqual(pattern, { name: "glider", cells: glider, rule: "B3/S23", width: 3, height: 3 });
  const repeated = Golly.parsePattern(macrocell.replace("4 0 1 0 0", "4 1 1 0 1"));
  assert.deepEqual(repeated.cells, [
    ...glider,
    ...glider.map(([row, column]) => [row, column + 8]),
    ...glider.map(([row, column]) => [row + 8, column + 8]),
  ]);
});

test("拒绝坏数据、空图案和项目规则不支持的状态", () => {
  assert.throws(() => Golly.parsePattern("x=1,y=1,rule=B3/S23/C3\nA!"), /不支持图案规则/);
  assert.throws(() => Golly.parsePattern("x=1,y=1,rule=B3/S23:T5,5\no!"), /不支持图案规则/);
  assert.throws(() => Golly.parsePattern("x=1,y=1\nB!"), /不支持的细胞状态/);
  assert.throws(() => Golly.parsePattern("x=2,y=1\n2 o!"), /RLE 数据无效/);
  assert.throws(() => Golly.parsePattern("x=1,y=1\nb!"), /没有活细胞/);
  assert.throws(() => Golly.parsePattern(macrocell.replace("4 0 1 0 0", "4 0 2 0 0")), /引用无效/);
});

test("导入上限拦截巨大的 RLE 活细胞行、Macrocell 共享节点扩张和 gzip 解压", async () => {
  assert.throws(() => Golly.parsePattern("x=50001,y=1\n50001o!"), /5 万/);
  const nodes = Array.from({ length: 8 }, (_, index) => {
    const child = index + 1;
    return [index + 4, child, child, child, child].join(" ");
  });
  assert.throws(() => Golly.parsePattern(["[M2]", "*", ...nodes].join("\n")), /5 万/);
  const oversized = new File([gzipSync(Buffer.alloc(4_000_001, 32))], "oversized.rle.gz");
  await assert.rejects(Golly.readFile(oversized), /解压后的图案不能超过 4 MB/);
});
