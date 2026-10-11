(function exposeFileBackup(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeFileBackup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFileBackup() {
  "use strict";

  const MAX_ATTEMPTS = 2;
  const STATE_MESSAGE = "state had changed since it was read from disk";

  function isStateError(error) {
    return error.name === "InvalidStateError"
      || (error.name === "UnknownError" && String(error.message).includes(STATE_MESSAGE));
  }

  function backupError(name, stage, cause, attempt, abortError) {
    const detail = `${cause.name || "Error"}：${cause.message || "未知错误"}`;
    const retry = attempt > 1 ? "（已重试一次）" : "";
    const cleanup = abortError ? `；中止写入也失败：${abortError.name}：${abortError.message}，未继续重写` : "";
    const error = new Error(`${name}｜${stage}失败${retry}：${detail}${cleanup}`, { cause });
    error.fileName = name;
    error.stage = stage;
    error.attempts = attempt;
    return error;
  }

  // 只为本次新文件重试，绝不覆盖已有备份，也不以下载触发代替落盘验证。
  async function save(directory, name, raw, options = {}) {
    const progress = options.onProgress || (() => {});
    const wait = options.wait || (() => new Promise((resolve) => setTimeout(resolve, 100)));
    progress({ name, stage: "检查同名文件", attempt: 1 });
    try {
      await directory.getFileHandle(name, { create: false });
    } catch (error) {
      if (error.name !== "NotFoundError") throw backupError(name, "检查同名文件", error, 1);
      // NotFound 是预期结果，允许创建此次备份。
      return writeNewFile();
    }
    throw backupError(name, "检查同名文件", new Error("已有同名备份，请重新执行以使用新文件名"), 1);

    async function writeNewFile() {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let stage = "创建文件";
        let writable;
        try {
          progress({ name, stage, attempt });
          const handle = await directory.getFileHandle(name, { create: attempt === 1 });
          stage = "打开写入流";
          progress({ name, stage, attempt });
          writable = await handle.createWritable();
          stage = "写入内容";
          progress({ name, stage, attempt });
          await writable.write(raw);
          stage = "关闭文件";
          progress({ name, stage, attempt });
          await writable.close();
        } catch (error) {
          let abortError;
          if (writable) {
            try { await writable.abort(); } catch (failure) { abortError = failure; }
          }
          if (!abortError && attempt < MAX_ATTEMPTS && isStateError(error)) {
            progress({ name, stage: `${stage}状态异常，准备重试`, attempt: attempt + 1 });
            await wait();
            continue;
          }
          throw backupError(name, stage, error, attempt, abortError);
        }
        // close 成功后单独回读；回读异常不能导致重写已保存的文件。
        await verify();
        return;
      }
    }

    async function verify() {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        progress({ name, stage: "回读校验", attempt });
        try {
          const handle = await directory.getFileHandle(name, { create: false });
          const file = await handle.getFile();
          if (await file.text() !== raw) throw new Error("备份内容与原始记录不一致（可能为空或不完整）");
          return;
        } catch (error) {
          if (attempt < MAX_ATTEMPTS && isStateError(error)) {
            progress({ name, stage: "回读状态异常，准备重试", attempt: attempt + 1 });
            await wait();
            continue;
          }
          throw backupError(name, "回读校验", error, attempt);
        }
      }
    }
  }

  return { save, MAX_ATTEMPTS };
});
