(function exposeRecordImport(root, factory) {
  const api = typeof module === "object" && module.exports
    ? factory(require("./pattern-library.js"), require("./logic-function-library.js"))
    : factory(root.PatternLibrary, root.LogicFunctionLibrary);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeRecordImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRecordImport(PatternStore, FunctionStore) {
  "use strict";

  const stores = { patterns: PatternStore, functions: FunctionStore };
  const BACKUP_FORMAT = "conway-life-record-backup";
  const BACKUP_VERSION = 1;
  const MAX_BACKUP_BYTES = 8_000_000;

  function checkBackupSize(raw) {
    if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error("合并备份文件超过 8 MB 大小上限");
  }

  function parseBackup(data) {
    if (data.version !== BACKUP_VERSION) throw new Error("不支持的合并备份版本");
    const imported = {};
    for (const [type, store] of Object.entries(stores)) {
      if (!data[type] || typeof data[type] !== "object") throw new Error("合并备份必须同时包含图案库和函数库");
      imported[type] = store.parseLibrary(JSON.stringify(data[type]));
    }
    return imported;
  }

  function serializeBackup(libraries) {
    const validated = parseBackup({ ...libraries, version: BACKUP_VERSION });
    const raw = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, ...validated }, null, 2);
    checkBackupSize(raw);
    return raw;
  }

  async function readFiles(files) {
    if (!files.length || files.length > 2) throw new Error("请选择一份合并备份，或旧版图案库和/或函数库 JSON（最多两份）。");
    const imported = {};
    for (const file of files) {
      try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error("文件超过 8 MB 大小上限");
        const raw = await file.text();
        checkBackupSize(raw);
        const data = JSON.parse(raw);
        const format = data?.format;
        if (format === BACKUP_FORMAT) {
          if (files.length !== 1) throw new Error("合并备份必须单独选择，不能与其它备份混选");
          return parseBackup(data);
        }
        const type = Object.keys(stores).find((name) => stores[name].LIBRARY_FORMAT === format);
        if (!type) throw new Error("不是受支持的合并备份、函数库或图案库备份");
        if (imported[type]) throw new Error("同一类备份只能选择一份，请分别选择函数库和图案库");
        imported[type] = stores[type].parseLibrary(raw);
      } catch (error) {
        throw new Error(`无法导入 ${file.name}：${error.message}`);
      }
    }
    return imported;
  }

  // 确认时重新生成计划，保留读取文件期间其它页面新增的本地记录。
  function prepare(storage, imported) {
    return Object.entries(stores).filter(([type]) => imported[type]).map(([type, store]) => {
      const current = store.loadLibrary(storage);
      const result = store.mergeLibraries(current, imported[type]);
      store.serializeLibrary(result.library); // 全部容量校验必须发生在第一次写入之前。
      return { type, store, ...result, before: storage.getItem(store.STORAGE_KEY) };
    });
  }

  function commit(storage, plan) {
    const written = [];
    try {
      for (const entry of plan) {
        if (entry.addedCount === 0) continue;
        entry.store.saveLibrary(storage, entry.library);
        written.push(entry);
      }
    } catch (error) {
      let rollbackFailed = false;
      for (const entry of written.reverse()) {
        try {
          if (entry.before === null) storage.removeItem(entry.store.STORAGE_KEY);
          else storage.setItem(entry.store.STORAGE_KEY, entry.before);
        } catch { rollbackFailed = true; }
      }
      const failure = new Error(rollbackFailed
        ? `导入未完成且部分回滚失败，请检查记录并从备份恢复：${error.message}`
        : `导入未完成，原有记录已保留：${error.message}`);
      failure.rollbackFailed = rollbackFailed;
      throw failure;
    }
  }

  return Object.freeze({ readFiles, prepare, commit, serializeBackup, BACKUP_FORMAT, BACKUP_VERSION, MAX_BACKUP_BYTES });
});
