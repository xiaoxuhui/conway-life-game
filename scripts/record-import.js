(function exposeRecordImport(root, factory) {
  const api = typeof module === "object" && module.exports
    ? factory(require("./pattern-library.js"), require("./logic-function-library.js"))
    : factory(root.PatternLibrary, root.LogicFunctionLibrary);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeRecordImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRecordImport(PatternStore, FunctionStore) {
  "use strict";

  const stores = { patterns: PatternStore, functions: FunctionStore };

  async function readFiles(files) {
    if (!files.length || files.length > 2) throw new Error("请选择一份图案库和/或一份函数库 JSON，最多两份文件。");
    const imported = {};
    for (const file of files) {
      try {
        if (file.size > PatternStore.MAX_LIBRARY_BYTES) throw new Error("文件超过 4 MB 大小上限");
        const raw = await file.text();
        const format = JSON.parse(raw)?.format;
        const type = Object.keys(stores).find((name) => stores[name].LIBRARY_FORMAT === format);
        if (!type) throw new Error("不是受支持的函数库或图案库备份");
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

  return Object.freeze({ readFiles, prepare, commit });
});
