"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Import = require("../scripts/record-import.js");
const Patterns = require("../scripts/pattern-library.js");
const Functions = require("../scripts/logic-function-library.js");
const timestamp = "2026-10-11T00:00:00.000Z";
const pattern = { id: "custom-one", name: "方块", description: "", width: 1, height: 1, cells: [[0, 0]], createdAt: timestamp, updatedAt: timestamp };
const fn = { id: "function-one", name: "ONE", code: "NOT(A)", inputs: [{ name: "A", defaultValue: 0 }], createdAt: timestamp, updatedAt: timestamp };
const imported = { patterns: Patterns.createLibrary([pattern]), functions: Functions.createLibrary([fn]) };

function file(library, name = "backup.json") {
  const raw = typeof library === "string" ? library : JSON.stringify(library);
  return { name, size: Buffer.byteLength(raw), text: async () => raw };
}

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values, writes: [],
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { this.writes.push(key); values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("按内容识别两库，与文件名及选择顺序无关", async () => {
  assert.deepEqual(await Import.readFiles([file(imported.functions, "p.json"), file(imported.patterns, "f.json")]), imported);
});

test("单库和空库备份可导入", async () => {
  assert.deepEqual(await Import.readFiles([file(Patterns.createLibrary())]), { patterns: Patterns.createLibrary() });
  const saved = storage();
  Import.commit(saved, Import.prepare(saved, { functions: imported.functions }));
  assert.equal(saved.getItem(Patterns.STORAGE_KEY), null);
  assert.deepEqual(Functions.loadLibrary(saved), imported.functions);
});

test("函数 v1 沿用原解析器迁移默认输入", async () => {
  const legacy = { ...imported.functions, version: 1, functions: [{ ...fn, code: "NOT(A),A=1", inputs: undefined }] };
  const parsed = await Import.readFiles([file(legacy)]);
  assert.equal(parsed.functions.version, 2);
  assert.equal(parsed.functions.functions[0].code, "NOT(A)");
  assert.deepEqual(parsed.functions.functions[0].inputs, [{ name: "A", defaultValue: 1 }]);
});

test("非法文件数、重复类型、坏 JSON 和未知格式均拒绝", async () => {
  for (const files of [[], [file(imported.patterns), file(imported.functions), file(imported.patterns)],
    [file(imported.patterns), file(imported.patterns)], [file("{broken")], [file({ format: "world", version: 1 })],
    [file({ ...imported.patterns, version: 99 })]]) {
    await assert.rejects(Import.readFiles(files));
  }
});

test("在读取前限制大文件并检查函数库自己的上限", async () => {
  let read = false;
  await assert.rejects(Import.readFiles([{ name: "big.json", size: Patterns.MAX_LIBRARY_BYTES + 1, text: async () => { read = true; } }]), /4 MB/);
  assert.equal(read, false);
  await assert.rejects(Import.readFiles([file(JSON.stringify(imported.functions) + " ".repeat(Functions.MAX_LIBRARY_BYTES))]), /大小上限/);
});

test("双库安全合并、重复导入不写入且现有同名内容不覆盖", () => {
  const saved = storage();
  Import.commit(saved, Import.prepare(saved, imported));
  assert.deepEqual(Patterns.loadLibrary(saved), imported.patterns);
  assert.deepEqual(Functions.loadLibrary(saved), imported.functions);
  saved.writes.length = 0;
  const duplicate = { ...imported, functions: Functions.createLibrary([{ ...fn, code: "AND(A,A)" }]) };
  const plan = Import.prepare(saved, duplicate);
  assert.deepEqual(plan.map((entry) => [entry.addedCount, entry.skippedCount]), [[0, 1], [0, 1]]);
  Import.commit(saved, plan);
  assert.deepEqual(saved.writes, []);
  assert.equal(Functions.loadLibrary(saved).functions[0].code, "NOT(A)");
});

test("损坏本地库不被空状态覆盖", () => {
  const saved = storage({ [Functions.STORAGE_KEY]: "bad-original" });
  assert.throws(() => Import.prepare(saved, imported));
  assert.deepEqual(saved.writes, []);
  assert.equal(saved.getItem(Functions.STORAGE_KEY), "bad-original");
});

for (const original of [null, JSON.stringify(Patterns.createLibrary(), null, 2)]) {
  test(`第二次写入失败回滚第一类的原始存储（${original === null ? "键原不存在" : "保留精确字符串"}）`, () => {
    const saved = storage(original === null ? {} : { [Patterns.STORAGE_KEY]: original });
    const set = saved.setItem;
    saved.setItem = function (key, value) {
      if (key === Functions.STORAGE_KEY) throw new Error("quota");
      set.call(this, key, value);
    };
    assert.throws(() => Import.commit(saved, Import.prepare(saved, imported)), (error) => !error.rollbackFailed && /原有记录已保留/.test(error.message));
    assert.equal(saved.getItem(Patterns.STORAGE_KEY), original);
    assert.equal(saved.getItem(Functions.STORAGE_KEY), null);
  });
}

test("第一类写入失败不写第二类", () => {
  const saved = storage();
  saved.setItem = () => { throw new Error("quota"); };
  assert.throws(() => Import.commit(saved, Import.prepare(saved, imported)), /原有记录已保留/);
  assert.equal(saved.values.size, 0);
});

test("回滚也失败时明确标记部分写入，不能声称全部保留", () => {
  const saved = storage({ [Patterns.STORAGE_KEY]: JSON.stringify(Patterns.createLibrary()) });
  const set = saved.setItem;
  saved.setItem = function (key, value) {
    if (key === Functions.STORAGE_KEY || JSON.parse(value).patterns?.length === 0) throw new Error("quota");
    set.call(this, key, value);
  };
  assert.throws(() => Import.commit(saved, Import.prepare(saved, imported)), (error) => error.rollbackFailed && /部分回滚失败/.test(error.message));
  assert.deepEqual(Patterns.loadLibrary(saved), imported.patterns);
});

test("合并结果大小超限在任何写入前拒绝", () => {
  const cells = Array.from({ length: 50_000 }, (_, index) => [Math.floor(index / 200), index % 200]);
  const large = (index) => ({ ...pattern, id: `custom-${index}`, name: `LARGE${index}`, width: 200, height: 250, cells });
  const existing = Patterns.createLibrary(Array.from({ length: 6 }, (_, index) => large(index)));
  const incoming = Patterns.createLibrary(Array.from({ length: 6 }, (_, index) => large(index + 6)));
  const saved = storage({ [Patterns.STORAGE_KEY]: Patterns.serializeLibrary(existing) });
  assert.throws(() => Import.prepare(saved, { patterns: incoming, functions: imported.functions }), /4 MB/);
  assert.deepEqual(saved.writes, []);
});
