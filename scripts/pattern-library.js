(function exposePatternLibrary(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PatternLibrary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPatternLibraryModule() {
  "use strict";

  const LIBRARY_FORMAT = "conway-life-pattern-library";
  const LIBRARY_VERSION = 1;
  const STORAGE_KEY = "conway-life-game.custom-patterns.v1";
  const MAX_NAME_LENGTH = 30;
  const MAX_DESCRIPTION_LENGTH = 120;
  const MAX_PATTERN_CELLS = 50_000;
  const MAX_PATTERNS = 200;
  const MAX_LIBRARY_BYTES = 4_000_000;

  class PatternLibraryError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "PatternLibraryError";
      this.code = code;
      Object.assign(this, details);
    }
  }

  function fail(code, message, details) {
    throw new PatternLibraryError(code, message, details);
  }

  function countCharacters(value) {
    return Array.from(value).length;
  }

  function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeName(value) {
    return cleanText(value).toLocaleLowerCase("zh-CN");
  }

  function validateName(value) {
    const name = cleanText(value);
    if (countCharacters(name) < 1 || countCharacters(name) > MAX_NAME_LENGTH) {
      fail("INVALID_NAME", `图案名称必须为 1–${MAX_NAME_LENGTH} 个字符`);
    }
    return name;
  }

  function validateDescription(value = "") {
    const description = cleanText(value);
    if (countCharacters(description) > MAX_DESCRIPTION_LENGTH) {
      fail("INVALID_DESCRIPTION", `图案说明不能超过 ${MAX_DESCRIPTION_LENGTH} 个字符`);
    }
    return description;
  }

  function validateDate(value, label) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      fail("INVALID_DATE", `${label}无效`);
    }
    return new Date(value).toISOString();
  }

  function parseWorldKey(key) {
    if (typeof key !== "string") fail("INVALID_WORLD", "世界坐标无效");
    const separator = key.indexOf(",");
    const row = Number(key.slice(0, separator));
    const column = Number(key.slice(separator + 1));
    if (separator < 1 || !Number.isSafeInteger(row) || !Number.isSafeInteger(column)) {
      fail("INVALID_WORLD", "世界坐标无效");
    }
    return [row, column];
  }

  function normalizeWorld(world) {
    if (!world || !(world.cells instanceof Set)) fail("INVALID_WORLD", "无限世界数据无效");
    if (world.cells.size === 0) fail("EMPTY_WORLD", "先绘制一些细胞，再保存为图案");
    if (world.cells.size > MAX_PATTERN_CELLS) {
      fail("PATTERN_LIMIT", `单个图案最多保存 ${MAX_PATTERN_CELLS.toLocaleString("zh-CN")} 个活细胞`);
    }

    const coordinates = [...world.cells].map(parseWorldKey);
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minColumn = Infinity;
    let maxColumn = -Infinity;
    for (const [row, column] of coordinates) {
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    }
    const height = maxRow - minRow + 1;
    const width = maxColumn - minColumn + 1;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
      fail("PATTERN_SPAN_LIMIT", "图案跨度过大，无法安全保存");
    }
    const cells = coordinates
      .map(([row, column]) => [row - minRow, column - minColumn])
      .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    return { width, height, cells };
  }

  function validateCells(cells, width, height) {
    if (!Array.isArray(cells) || cells.length < 1 || cells.length > MAX_PATTERN_CELLS) {
      fail("INVALID_CELLS", `图案必须包含 1–${MAX_PATTERN_CELLS.toLocaleString("zh-CN")} 个活细胞`);
    }
    const unique = new Map();
    for (const coordinate of cells) {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        fail("INVALID_CELLS", "图案坐标必须是 [行, 列]");
      }
      const [row, column] = coordinate;
      if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 || row >= height || column >= width) {
        fail("INVALID_CELLS", "图案坐标超出声明尺寸");
      }
      unique.set(`${row},${column}`, [row, column]);
    }
    const normalized = [...unique.values()].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const actualHeight = Math.max(...normalized.map(([row]) => row)) + 1;
    const actualWidth = Math.max(...normalized.map(([, column]) => column)) + 1;
    if (actualWidth !== width || actualHeight !== height) {
      fail("INVALID_DIMENSIONS", "图案尺寸必须与活细胞的最小包围盒一致");
    }
    return normalized;
  }

  function validatePattern(pattern) {
    if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
      fail("INVALID_PATTERN", "图案数据无效");
    }
    const id = cleanText(pattern.id);
    if (!id.startsWith("custom-") || id.length > 120) fail("INVALID_ID", "自定义图案 ID 无效");
    const width = pattern.width;
    const height = pattern.height;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      fail("INVALID_DIMENSIONS", "图案宽高必须是正安全整数");
    }
    return {
      id,
      name: validateName(pattern.name),
      description: validateDescription(pattern.description),
      width,
      height,
      cells: validateCells(pattern.cells, width, height),
      createdAt: validateDate(pattern.createdAt, "创建时间"),
      updatedAt: validateDate(pattern.updatedAt, "更新时间"),
    };
  }

  function defaultId() {
    if (typeof globalThis.crypto?.randomUUID === "function") return `custom-${globalThis.crypto.randomUUID()}`;
    return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function createPatternFromWorld(world, metadata = {}, options = {}) {
    const normalized = normalizeWorld(world);
    const timestamp = options.now instanceof Date
      ? options.now.toISOString()
      : options.now || new Date().toISOString();
    return validatePattern({
      id: options.id || defaultId(),
      name: metadata.name,
      description: metadata.description || "",
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  function createLibrary(patterns = []) {
    if (!Array.isArray(patterns)) fail("INVALID_LIBRARY", "图案库列表无效");
    if (patterns.length > MAX_PATTERNS) fail("LIBRARY_LIMIT", `最多保存 ${MAX_PATTERNS} 个自定义图案`);
    const validated = patterns.map(validatePattern);
    const ids = new Set();
    const names = new Map();
    for (const pattern of validated) {
      if (ids.has(pattern.id)) fail("DUPLICATE_ID", "自定义图案 ID 重复");
      ids.add(pattern.id);
      const nameKey = normalizeName(pattern.name);
      if (names.has(nameKey)) {
        fail("DUPLICATE_NAME", `已经存在名为“${pattern.name}”的自定义图案`, { patternId: names.get(nameKey) });
      }
      names.set(nameKey, pattern.id);
    }
    return { format: LIBRARY_FORMAT, version: LIBRARY_VERSION, patterns: validated };
  }

  function addPattern(library, pattern) {
    const current = createLibrary(library?.patterns || []);
    if (current.patterns.length >= MAX_PATTERNS) fail("LIBRARY_LIMIT", `最多保存 ${MAX_PATTERNS} 个自定义图案`);
    const validated = validatePattern(pattern);
    const duplicate = current.patterns.find((item) => normalizeName(item.name) === normalizeName(validated.name));
    if (duplicate) {
      fail("DUPLICATE_NAME", `已经存在名为“${duplicate.name}”的自定义图案`, { patternId: duplicate.id });
    }
    if (current.patterns.some((item) => item.id === validated.id)) fail("DUPLICATE_ID", "自定义图案 ID 重复");
    return createLibrary([...current.patterns, validated]);
  }

  function updatePattern(library, id, changes, now = new Date().toISOString()) {
    const current = createLibrary(library?.patterns || []);
    const index = current.patterns.findIndex((pattern) => pattern.id === id);
    if (index < 0) fail("PATTERN_NOT_FOUND", "没有找到这个自定义图案");
    const original = current.patterns[index];
    const updated = validatePattern({
      ...original,
      ...changes,
      id: original.id,
      createdAt: original.createdAt,
      updatedAt: now instanceof Date ? now.toISOString() : now,
    });
    const duplicate = current.patterns.find(
      (pattern) => pattern.id !== id && normalizeName(pattern.name) === normalizeName(updated.name),
    );
    if (duplicate) {
      fail("DUPLICATE_NAME", `已经存在名为“${duplicate.name}”的自定义图案`, { patternId: duplicate.id });
    }
    const patterns = [...current.patterns];
    patterns[index] = updated;
    return createLibrary(patterns);
  }

  function deletePattern(library, id) {
    const current = createLibrary(library?.patterns || []);
    if (!current.patterns.some((pattern) => pattern.id === id)) {
      fail("PATTERN_NOT_FOUND", "没有找到这个自定义图案");
    }
    return createLibrary(current.patterns.filter((pattern) => pattern.id !== id));
  }

  function encodedSize(value) {
    return new TextEncoder().encode(value).byteLength;
  }

  function parseLibrary(raw) {
    if (typeof raw !== "string" || !raw.trim()) fail("INVALID_IMPORT", "图案库文件为空");
    if (encodedSize(raw) > MAX_LIBRARY_BYTES) fail("LIBRARY_SIZE_LIMIT", "图案库文件超过 4 MB 大小上限");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      fail("CORRUPT_LIBRARY", "图案库 JSON 已损坏");
    }
    if (!data || data.format !== LIBRARY_FORMAT) fail("CORRUPT_LIBRARY", "图案库格式无效");
    if (data.version !== LIBRARY_VERSION) fail("UNSUPPORTED_VERSION", "图案库版本不受支持");
    try {
      return createLibrary(data.patterns);
    } catch (error) {
      if (error instanceof PatternLibraryError) fail("CORRUPT_LIBRARY", `图案库数据无效：${error.message}`);
      throw error;
    }
  }

  function serializeLibrary(library, options = {}) {
    const validated = createLibrary(library?.patterns || []);
    const raw = JSON.stringify(validated, null, options.pretty ? 2 : 0);
    if (encodedSize(raw) > MAX_LIBRARY_BYTES) fail("LIBRARY_SIZE_LIMIT", "自定义图案库已达到 4 MB 大小上限");
    return raw;
  }

  function mergeLibraries(currentLibrary, importedLibrary) {
    const current = createLibrary(currentLibrary?.patterns || []);
    const imported = createLibrary(importedLibrary?.patterns || []);
    const patterns = [...current.patterns];
    const ids = new Set(patterns.map((pattern) => pattern.id));
    const names = new Set(patterns.map((pattern) => normalizeName(pattern.name)));
    const skippedNames = [];
    let addedCount = 0;

    for (const pattern of imported.patterns) {
      if (ids.has(pattern.id) || names.has(normalizeName(pattern.name)) || patterns.length >= MAX_PATTERNS) {
        skippedNames.push(pattern.name);
        continue;
      }
      patterns.push(pattern);
      ids.add(pattern.id);
      names.add(normalizeName(pattern.name));
      addedCount += 1;
    }

    return {
      library: createLibrary(patterns),
      addedCount,
      skippedCount: skippedNames.length,
      skippedNames,
    };
  }

  function loadLibrary(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== "function") fail("STORAGE_UNAVAILABLE", "浏览器本地存储不可用");
    let raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      fail("STORAGE_READ_FAILED", "无法读取浏览器本地存储");
    }
    if (raw === null) return createLibrary();
    try {
      return parseLibrary(raw);
    } catch (error) {
      if (error instanceof PatternLibraryError && error.code === "CORRUPT_LIBRARY") {
        fail("CORRUPT_LIBRARY", `本地${error.message}，请勿覆盖原数据`);
      }
      throw error;
    }
  }

  function saveLibrary(storage = globalThis.localStorage, library) {
    if (!storage || typeof storage.setItem !== "function") fail("STORAGE_UNAVAILABLE", "浏览器本地存储不可用");
    const validated = createLibrary(library?.patterns || []);
    const raw = serializeLibrary(validated);
    try {
      storage.setItem(STORAGE_KEY, raw);
    } catch {
      fail("STORAGE_WRITE_FAILED", "保存失败：浏览器本地存储不可用或空间不足");
    }
    return validated;
  }

  return Object.freeze({
    LIBRARY_FORMAT,
    LIBRARY_VERSION,
    MAX_DESCRIPTION_LENGTH,
    MAX_LIBRARY_BYTES,
    MAX_NAME_LENGTH,
    MAX_PATTERN_CELLS,
    MAX_PATTERNS,
    PatternLibraryError,
    STORAGE_KEY,
    addPattern,
    createLibrary,
    createPatternFromWorld,
    deletePattern,
    loadLibrary,
    mergeLibraries,
    normalizeName,
    normalizeWorld,
    parseLibrary,
    saveLibrary,
    serializeLibrary,
    updatePattern,
    validatePattern,
  });
});
