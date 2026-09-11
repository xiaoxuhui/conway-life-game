(function exposeLogicFunctionLibrary(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicFunctionLibrary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicFunctionLibrary() {
  "use strict";

  const LIBRARY_FORMAT = "conway-life-logic-function-library";
  const LIBRARY_VERSION = 2;
  const STORAGE_KEY = "conway-life-game.logic-functions.v1";
  const MAX_NAME_LENGTH = 30;
  const MAX_CODE_LENGTH = 200;
  const MAX_FUNCTIONS = 100;
  const MAX_INPUTS = 8;
  const MAX_LIBRARY_BYTES = 100_000;

  class LogicFunctionLibraryError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "LogicFunctionLibraryError";
      this.code = code;
      Object.assign(this, details);
    }
  }

  function fail(code, message, details) {
    throw new LogicFunctionLibraryError(code, message, details);
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function count(value) {
    return Array.from(value).length;
  }

  function normalizeName(value) {
    return clean(value).toLocaleLowerCase("zh-CN");
  }

  function validateName(value) {
    const name = clean(value);
    if (count(name) < 1 || count(name) > MAX_NAME_LENGTH) {
      fail("INVALID_NAME", `函数名称必须为 1–${MAX_NAME_LENGTH} 个字符`);
    }
    return name;
  }

  function validateCode(value) {
    const code = clean(value);
    if (count(code) < 1 || count(code) > MAX_CODE_LENGTH) {
      fail("INVALID_CODE", `函数代码必须为 1–${MAX_CODE_LENGTH} 个字符`);
    }
    return code;
  }

  function validateDate(value, label) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail("INVALID_DATE", `${label}无效`);
    return new Date(value).toISOString();
  }

  function validateInputs(value = []) {
    if (!Array.isArray(value) || value.length > MAX_INPUTS) fail("INVALID_INPUTS", `函数最多支持 ${MAX_INPUTS} 个输入`);
    const seen = new Set();
    return value.map((input) => {
      if (!input || typeof input !== "object") fail("INVALID_INPUTS", "函数输入无效");
      const name = clean(input.name).toUpperCase();
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) fail("INVALID_INPUTS", "函数输入名称无效");
      if (seen.has(name)) fail("INVALID_INPUTS", `函数输入 ${name} 重复`);
      if (input.defaultValue !== 0 && input.defaultValue !== 1) fail("INVALID_INPUTS", `函数输入 ${name} 默认值只能是 0 或 1`);
      seen.add(name);
      return { name, defaultValue: input.defaultValue };
    });
  }

  function validateFunction(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("INVALID_FUNCTION", "函数数据无效");
    const id = clean(item.id);
    if (!id.startsWith("function-") || id.length > 120) fail("INVALID_ID", "函数 ID 无效");
    return {
      id,
      name: validateName(item.name),
      code: validateCode(item.code),
      inputs: validateInputs(item.inputs),
      createdAt: validateDate(item.createdAt, "创建时间"),
      updatedAt: validateDate(item.updatedAt, "更新时间"),
    };
  }

  function defaultId() {
    if (typeof globalThis.crypto?.randomUUID === "function") return `function-${globalThis.crypto.randomUUID()}`;
    return `function-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function createFunction(values = {}, options = {}) {
    const timestamp = options.now instanceof Date
      ? options.now.toISOString()
      : options.now || new Date().toISOString();
    return validateFunction({
      id: options.id || defaultId(),
      name: values.name,
      code: values.code,
      inputs: values.inputs || [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  function createLibrary(functions = []) {
    if (!Array.isArray(functions)) fail("INVALID_LIBRARY", "函数库列表无效");
    if (functions.length > MAX_FUNCTIONS) fail("LIBRARY_LIMIT", `最多保存 ${MAX_FUNCTIONS} 个函数`);
    const validated = functions.map(validateFunction);
    const ids = new Set();
    const names = new Map();
    for (const item of validated) {
      if (ids.has(item.id)) fail("DUPLICATE_ID", "函数 ID 重复");
      ids.add(item.id);
      const key = normalizeName(item.name);
      if (names.has(key)) fail("DUPLICATE_NAME", `已经存在名为“${item.name}”的函数`, { functionId: names.get(key) });
      names.set(key, item.id);
    }
    return { format: LIBRARY_FORMAT, version: LIBRARY_VERSION, functions: validated };
  }

  function addFunction(library, item) {
    const current = createLibrary(library?.functions || []);
    if (current.functions.length >= MAX_FUNCTIONS) fail("LIBRARY_LIMIT", `最多保存 ${MAX_FUNCTIONS} 个函数`);
    const validated = validateFunction(item);
    const duplicate = current.functions.find((entry) => normalizeName(entry.name) === normalizeName(validated.name));
    if (duplicate) fail("DUPLICATE_NAME", `已经存在名为“${duplicate.name}”的函数`, { functionId: duplicate.id });
    if (current.functions.some((entry) => entry.id === validated.id)) fail("DUPLICATE_ID", "函数 ID 重复");
    return createLibrary([...current.functions, validated]);
  }

  function updateFunction(library, id, changes, now = new Date().toISOString()) {
    const current = createLibrary(library?.functions || []);
    const index = current.functions.findIndex((item) => item.id === id);
    if (index < 0) fail("FUNCTION_NOT_FOUND", "没有找到这个函数");
    const original = current.functions[index];
    const updated = validateFunction({
      ...original,
      ...changes,
      id: original.id,
      createdAt: original.createdAt,
      updatedAt: now instanceof Date ? now.toISOString() : now,
    });
    const duplicate = current.functions.find(
      (item) => item.id !== id && normalizeName(item.name) === normalizeName(updated.name),
    );
    if (duplicate) fail("DUPLICATE_NAME", `已经存在名为“${duplicate.name}”的函数`, { functionId: duplicate.id });
    const functions = [...current.functions];
    functions[index] = updated;
    return createLibrary(functions);
  }

  function deleteFunction(library, id) {
    const current = createLibrary(library?.functions || []);
    if (!current.functions.some((item) => item.id === id)) fail("FUNCTION_NOT_FOUND", "没有找到这个函数");
    return createLibrary(current.functions.filter((item) => item.id !== id));
  }

  function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
  }

  function migrateVersionOne(functions) {
    return functions.map((item) => {
      if (!item || typeof item !== "object" || typeof item.code !== "string") return item;
      const segments = [];
      let depth = 0;
      let start = 0;
      for (let index = 0; index < item.code.length; index += 1) {
        if (item.code[index] === "(") depth += 1;
        if (item.code[index] === ")") depth -= 1;
        if (item.code[index] === "," && depth === 0) {
          segments.push(item.code.slice(start, index).trim());
          start = index + 1;
        }
      }
      segments.push(item.code.slice(start).trim());
      const code = segments.shift();
      const inputs = [];
      for (const segment of segments) {
        const match = segment.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([01])$/);
        if (!match) return { ...item, inputs: [] };
        inputs.push({ name: match[1].toUpperCase(), defaultValue: Number(match[2]) });
      }
      return { ...item, code, inputs };
    });
  }

  function parseLibrary(raw) {
    if (typeof raw !== "string" || !raw.trim()) fail("INVALID_IMPORT", "函数库文件为空");
    if (byteLength(raw) > MAX_LIBRARY_BYTES) fail("LIBRARY_SIZE_LIMIT", "函数库文件超过大小上限");
    let data;
    try { data = JSON.parse(raw); } catch { fail("CORRUPT_LIBRARY", "函数库 JSON 已损坏"); }
    if (!data || data.format !== LIBRARY_FORMAT) fail("CORRUPT_LIBRARY", "函数库格式无效");
    if (data.version !== 1 && data.version !== LIBRARY_VERSION) fail("UNSUPPORTED_VERSION", "函数库版本不受支持");
    const functions = data.version === 1 ? migrateVersionOne(data.functions) : data.functions;
    try { return createLibrary(functions); } catch (error) {
      if (error instanceof LogicFunctionLibraryError) fail("CORRUPT_LIBRARY", `函数库数据无效：${error.message}`);
      throw error;
    }
  }

  function serializeLibrary(library, options = {}) {
    const validated = createLibrary(library?.functions || []);
    const raw = JSON.stringify(validated, null, options.pretty ? 2 : 0);
    if (byteLength(raw) > MAX_LIBRARY_BYTES) fail("LIBRARY_SIZE_LIMIT", "函数库已达到大小上限");
    return raw;
  }

  function mergeLibraries(currentLibrary, importedLibrary) {
    const current = createLibrary(currentLibrary?.functions || []);
    const imported = createLibrary(importedLibrary?.functions || []);
    const functions = [...current.functions];
    const ids = new Set(functions.map((item) => item.id));
    const names = new Set(functions.map((item) => normalizeName(item.name)));
    const skippedNames = [];
    let addedCount = 0;

    for (const item of imported.functions) {
      if (ids.has(item.id) || names.has(normalizeName(item.name)) || functions.length >= MAX_FUNCTIONS) {
        skippedNames.push(item.name);
        continue;
      }
      functions.push(item);
      ids.add(item.id);
      names.add(normalizeName(item.name));
      addedCount += 1;
    }

    return {
      library: createLibrary(functions),
      addedCount,
      skippedCount: skippedNames.length,
      skippedNames,
    };
  }

  function loadLibrary(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== "function") fail("STORAGE_UNAVAILABLE", "浏览器本地存储不可用");
    let raw;
    try { raw = storage.getItem(STORAGE_KEY); } catch { fail("STORAGE_READ_FAILED", "无法读取浏览器本地存储"); }
    if (raw === null) return createLibrary();
    try { return parseLibrary(raw); } catch (error) {
      if (error instanceof LogicFunctionLibraryError && error.code === "CORRUPT_LIBRARY") {
        fail("CORRUPT_LIBRARY", `本地${error.message}，请勿覆盖原数据`);
      }
      throw error;
    }
  }

  function saveLibrary(storage = globalThis.localStorage, library) {
    if (!storage || typeof storage.setItem !== "function") fail("STORAGE_UNAVAILABLE", "浏览器本地存储不可用");
    const validated = createLibrary(library?.functions || []);
    const raw = serializeLibrary(validated);
    try { storage.setItem(STORAGE_KEY, raw); } catch { fail("STORAGE_WRITE_FAILED", "保存失败：浏览器本地存储不可用或空间不足"); }
    return validated;
  }

  return Object.freeze({
    LIBRARY_FORMAT, LIBRARY_VERSION, STORAGE_KEY, MAX_NAME_LENGTH, MAX_CODE_LENGTH, MAX_INPUTS,
    MAX_LIBRARY_BYTES,
    MAX_FUNCTIONS, LogicFunctionLibraryError, addFunction, createFunction, createLibrary,
    deleteFunction, loadLibrary, mergeLibraries, normalizeName, parseLibrary, saveLibrary,
    serializeLibrary, updateFunction, validateFunction,
  });
});
