"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Life = require("../scripts/life-engine.js");
const Patterns = require("../scripts/pattern-library.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    value(key) {
      return values.get(key);
    },
  };
}

function samplePattern(name = "双滑翔机") {
  return Patterns.createPatternFromWorld(
    Life.createWorld([[-2, 5], [-1, 6], [3, 12]]),
    { name, description: "测试图案" },
    { id: "custom-test", now: "2026-08-19T12:00:00.000Z" },
  );
}

test("负坐标世界按最小包围盒归一化且保留相对间距", () => {
  const normalized = Patterns.normalizeWorld(
    Life.createWorld([[-2, 5], [-1, 6], [3, 12]]),
  );
  assert.deepEqual(normalized, {
    width: 8,
    height: 6,
    cells: [[0, 0], [1, 1], [5, 7]],
  });
});

test("空世界不能保存为图案", () => {
  assert.throws(
    () => Patterns.normalizeWorld(Life.createWorld()),
    (error) => error.code === "EMPTY_WORLD",
  );
});

test("创建图案会规范化名称说明并注入稳定 ID 与时间", () => {
  const pattern = Patterns.createPatternFromWorld(
    Life.createWorld([[10, 10], [10, 11]]),
    { name: "  横线  ", description: "  两个细胞  " },
    { id: "custom-line", now: "2026-08-19T12:00:00.000Z" },
  );
  assert.equal(pattern.id, "custom-line");
  assert.equal(pattern.name, "横线");
  assert.equal(pattern.description, "两个细胞");
  assert.deepEqual(pattern.cells, [[0, 0], [0, 1]]);
  assert.equal(pattern.createdAt, pattern.updatedAt);
});

test("名称为空、过长和说明过长时拒绝保存", () => {
  const world = Life.createWorld([[0, 0]]);
  for (const name of ["", " ", "一".repeat(31)]) {
    assert.throws(
      () => Patterns.createPatternFromWorld(world, { name }),
      (error) => error.code === "INVALID_NAME",
    );
  }
  assert.throws(
    () => Patterns.createPatternFromWorld(world, { name: "有效", description: "一".repeat(121) }),
    (error) => error.code === "INVALID_DESCRIPTION",
  );
});

test("添加图案时英文大小写与首尾空格不构成新名称", () => {
  const first = samplePattern("My Glider");
  const library = Patterns.addPattern(Patterns.createLibrary(), first);
  const duplicate = { ...samplePattern(" my glider "), id: "custom-second" };
  assert.throws(
    () => Patterns.addPattern(library, duplicate),
    (error) => error.code === "DUPLICATE_NAME" && error.patternId === first.id,
  );
});

test("更新保留 ID 与创建时间并修改更新时间和形状", () => {
  const first = samplePattern();
  const library = Patterns.addPattern(Patterns.createLibrary(), first);
  const updated = Patterns.updatePattern(
    library,
    first.id,
    {
      name: "更新后的图案",
      description: "新说明",
      width: 2,
      height: 1,
      cells: [[0, 0], [0, 1]],
    },
    "2026-08-20T08:00:00.000Z",
  );
  assert.equal(updated.patterns[0].id, first.id);
  assert.equal(updated.patterns[0].createdAt, first.createdAt);
  assert.equal(updated.patterns[0].updatedAt, "2026-08-20T08:00:00.000Z");
  assert.deepEqual(updated.patterns[0].cells, [[0, 0], [0, 1]]);
});

test("删除只移除指定图案且不存在的 ID 会报错", () => {
  const first = samplePattern("一号");
  const second = { ...samplePattern("二号"), id: "custom-second" };
  const library = Patterns.addPattern(Patterns.addPattern(Patterns.createLibrary(), first), second);
  assert.deepEqual(Patterns.deletePattern(library, first.id).patterns.map((item) => item.id), [second.id]);
  assert.throws(
    () => Patterns.deletePattern(library, "missing"),
    (error) => error.code === "PATTERN_NOT_FOUND",
  );
});

test("保存后可从本地存储完整恢复", () => {
  const storage = memoryStorage();
  const library = Patterns.addPattern(Patterns.createLibrary(), samplePattern());
  Patterns.saveLibrary(storage, library);
  assert.deepEqual(Patterns.loadLibrary(storage), library);
  assert.match(storage.value(Patterns.STORAGE_KEY), /conway-life-pattern-library/);
});

test("首次使用返回空图案库", () => {
  assert.deepEqual(Patterns.loadLibrary(memoryStorage()), Patterns.createLibrary());
});

test("损坏、不支持版本的存储数据不会被静默接受", () => {
  const broken = memoryStorage({ [Patterns.STORAGE_KEY]: "{" });
  assert.throws(() => Patterns.loadLibrary(broken), (error) => error.code === "CORRUPT_LIBRARY");
  const future = memoryStorage({
    [Patterns.STORAGE_KEY]: JSON.stringify({
      format: Patterns.LIBRARY_FORMAT,
      version: 99,
      patterns: [],
    }),
  });
  assert.throws(() => Patterns.loadLibrary(future), (error) => error.code === "UNSUPPORTED_VERSION");
});

test("本地存储写入失败时返回可识别错误", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };
  assert.throws(
    () => Patterns.saveLibrary(storage, Patterns.createLibrary()),
    (error) => error.code === "STORAGE_WRITE_FAILED",
  );
});

test("图案坐标、声明尺寸和数量上限受到校验", () => {
  const valid = samplePattern();
  assert.throws(
    () => Patterns.validatePattern({ ...valid, cells: [[0, 0], [valid.height, 0]] }),
    (error) => error.code === "INVALID_CELLS",
  );
  assert.throws(
    () => Patterns.validatePattern({ ...valid, width: 0 }),
    (error) => error.code === "INVALID_DIMENSIONS",
  );
  assert.throws(
    () => Patterns.createLibrary(Array.from({ length: 201 }, (_, index) => ({
      ...valid,
      id: `custom-${index}`,
      name: `图案 ${index}`,
    }))),
    (error) => error.code === "LIBRARY_LIMIT",
  );
});

test("整个图案库可导出为可读 JSON 并重新导入", () => {
  const second = { ...samplePattern("第二个图案"), id: "custom-second" };
  const library = Patterns.createLibrary([samplePattern(), second]);
  const raw = Patterns.serializeLibrary(library, { pretty: true });
  assert.match(raw, /\n  "version": 1/);
  assert.deepEqual(Patterns.parseLibrary(raw), library);
  assert.throws(() => Patterns.parseLibrary(""), /为空/);
  assert.throws(() => Patterns.parseLibrary("{"), /JSON 已损坏/);
  assert.throws(
    () => Patterns.parseLibrary(JSON.stringify({ format: "other", version: 1, patterns: [] })),
    /格式无效/,
  );
});

test("合并整个图案库只新增非冲突图案并报告跳过项", () => {
  const original = samplePattern("双滑翔机");
  const current = Patterns.createLibrary([original]);
  const imported = Patterns.createLibrary([
    { ...samplePattern(" 双滑翔机 "), id: "custom-conflict" },
    { ...samplePattern("新图案"), id: "custom-new" },
  ]);
  const result = Patterns.mergeLibraries(current, imported);
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedNames, ["双滑翔机"]);
  assert.deepEqual(result.library.patterns.map((pattern) => pattern.name), ["双滑翔机", "新图案"]);
});
