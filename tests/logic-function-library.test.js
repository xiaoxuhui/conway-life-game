"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Functions = require("../scripts/logic-function-library.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function sample(name = "异或", code = "OR(AND(A,NOT(B)),AND(NOT(A),B)),A=1,B=1") {
  return Functions.createFunction({
    name,
    code: code.split(",A=")[0],
    inputs: code.includes(",A=")
      ? [{ name: "A", defaultValue: Number(code.match(/A=([01])/)[1]) }, { name: "B", defaultValue: Number(code.match(/B=([01])/)[1]) }]
      : [],
  }, {
    id: `function-${name}`,
    now: "2026-08-21T12:00:00.000Z",
  });
}

test("创建函数会保留完整代码并规范化元数据", () => {
  const item = sample("  异或  ");
  assert.equal(item.name, "异或");
  assert.equal(item.code, "OR(AND(A,NOT(B)),AND(NOT(A),B))");
  assert.deepEqual(item.inputs, [{ name: "A", defaultValue: 1 }, { name: "B", defaultValue: 1 }]);
  assert.equal(item.createdAt, item.updatedAt);
});

test("函数名称、代码、重名和数量受到限制", () => {
  assert.throws(() => Functions.createFunction({ name: "", code: "NOT 0", inputs: [] }), /名称/);
  assert.throws(() => Functions.createFunction({ name: "测试", code: "", inputs: [] }), /代码/);
  assert.throws(() => Functions.createFunction({ name: "测试", code: "A".repeat(201), inputs: [] }), /200/);
  const library = Functions.addFunction(Functions.createLibrary(), sample("XOR"));
  assert.throws(() => Functions.addFunction(library, sample(" xor ")), /已经存在/);
  const full = Functions.createLibrary(Array.from(
    { length: 100 }, (_, index) => sample(`函数 ${index + 1}`, "NOT 0"),
  ));
  assert.throws(() => Functions.addFunction(full, sample("超出上限", "NOT 0")), /100/);
});

test("修改函数保留 ID 和创建时间并支持删除", () => {
  const original = sample();
  const library = Functions.addFunction(Functions.createLibrary(), original);
  const updated = Functions.updateFunction(library, original.id, {
    name: "半加器异或",
    code: "OR(AND(A,NOT(B)),AND(NOT(A),B))",
    inputs: [{ name: "A", defaultValue: 0 }, { name: "B", defaultValue: 1 }],
  }, "2026-08-21T13:00:00.000Z");
  assert.equal(updated.functions[0].id, original.id);
  assert.equal(updated.functions[0].createdAt, original.createdAt);
  assert.equal(updated.functions[0].updatedAt, "2026-08-21T13:00:00.000Z");
  assert.deepEqual(Functions.deleteFunction(updated, original.id).functions, []);
});

test("函数库可本地往返，损坏和不支持版本不会被接受", () => {
  const storage = memoryStorage();
  const library = Functions.addFunction(Functions.createLibrary(), sample());
  Functions.saveLibrary(storage, library);
  assert.deepEqual(Functions.loadLibrary(storage), library);

  const corrupt = memoryStorage({ [Functions.STORAGE_KEY]: "{" });
  assert.throws(() => Functions.loadLibrary(corrupt), /损坏/);
  const future = memoryStorage({
    [Functions.STORAGE_KEY]: JSON.stringify({ format: Functions.LIBRARY_FORMAT, version: 99, functions: [] }),
  });
  assert.throws(() => Functions.loadLibrary(future), /版本/);
  assert.throws(
    () => Functions.saveLibrary({ getItem() { return null; }, setItem() { throw new Error("quota"); } }, library),
    /保存失败/,
  );
});

test("v1 函数库会把末尾赋值迁移成 v2 参数默认值", () => {
  const legacy = {
    format: Functions.LIBRARY_FORMAT,
    version: 1,
    functions: [{
      id: "function-legacy", name: "旧异或",
      code: "OR(AND(A,NOT(B)),AND(NOT(A),B)),A=1,B=0",
      createdAt: "2026-08-21T12:00:00.000Z", updatedAt: "2026-08-21T12:00:00.000Z",
    }],
  };
  const storage = memoryStorage({ [Functions.STORAGE_KEY]: JSON.stringify(legacy) });
  const migrated = Functions.loadLibrary(storage);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.functions[0].code, "OR(AND(A,NOT(B)),AND(NOT(A),B))");
  assert.deepEqual(migrated.functions[0].inputs, [
    { name: "A", defaultValue: 1 }, { name: "B", defaultValue: 0 },
  ]);
});

test("函数库可导出为可读 JSON 并重新导入", () => {
  const library = Functions.createLibrary([sample("XOR")]);
  const raw = Functions.serializeLibrary(library, { pretty: true });
  assert.match(raw, /\n  "version": 2/);
  assert.deepEqual(Functions.parseLibrary(raw), library);
  assert.throws(() => Functions.parseLibrary(""), /为空/);
  assert.throws(() => Functions.parseLibrary("{"), /JSON 已损坏/);
  assert.throws(
    () => Functions.parseLibrary(JSON.stringify({ format: "other", version: 2, functions: [] })),
    /格式无效/,
  );
});

test("合并导入只新增不冲突函数并报告跳过项", () => {
  const original = sample("XOR");
  const current = Functions.createLibrary([original]);
  const imported = Functions.createLibrary([
    sample(" xor "),
    sample("NOR", "NOT(OR(A,B))"),
  ]);
  const result = Functions.mergeLibraries(current, imported);
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.skippedNames, ["xor"]);
  assert.deepEqual(result.library.functions.map((item) => item.name), ["XOR", "NOR"]);
});
