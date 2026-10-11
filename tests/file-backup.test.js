"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Backup = require("../scripts/file-backup.js");
const raw = '{"functions":[{"name":"测试"}]}';
const name = "functions-test.json";
const stateError = () => new DOMException("state had changed since it was read from disk", "InvalidStateError");

function fixture({ stage, times = 1, error = stateError, existing, mismatch, abortFail } = {}) {
  let content = existing;
  let failures = 0;
  const calls = { create: 0, open: 0, write: 0, close: 0, abort: 0, read: 0, handles: [] };
  function check(at) {
    calls[at] += 1;
    if (stage === at && failures++ < times) throw error();
  }
  const directory = {
    async getFileHandle(_, { create }) {
      calls.handles.push(create);
      if (content === undefined && !create) throw new DOMException("不存在", "NotFoundError");
      if (create) { check("create"); content = ""; }
      return {
        async createWritable() {
          check("open");
          let draft;
          return {
            async write(value) { check("write"); draft = value; },
            async close() { check("close"); content = mismatch === undefined ? draft : mismatch; },
            async abort() { calls.abort += 1; if (abortFail) throw new Error("无法中止"); },
          };
        },
        async getFile() {
          check("read");
          // File 是不可复用的快照，每次回读必须重新获取。
          const snapshot = content;
          return { text: async () => snapshot };
        },
      };
    },
  };
  return { directory, calls, content: () => content };
}

function save(f, events = []) {
  return Backup.save(f.directory, name, raw, { wait: async () => {}, onProgress: (event) => events.push(event) });
}

test("保存必须依次写入关闭并回读完全一致", async () => {
  const f = fixture();
  const events = [];
  await save(f, events);
  assert.equal(f.content(), raw);
  assert.deepEqual(events.map((event) => event.stage), ["检查同名文件", "创建文件", "打开写入流", "写入内容", "关闭文件", "回读校验"]);
  assert.deepEqual(f.calls.handles, [false, true, false]);
});

for (const stage of ["open", "write", "close", "read"]) {
  test(`${stage} 一次状态异常可恢复，回读失败不重写`, async () => {
    const f = fixture({ stage });
    await save(f);
    assert.equal(f.content(), raw);
    assert.equal(f.calls[stage], 2);
    assert.equal(f.calls.create, 1);
    assert.equal(f.calls.open, stage === "read" ? 1 : 2);
    assert.equal(f.calls.abort, ["write", "close"].includes(stage) ? 1 : 0);
  });
}

for (const [stage, label] of [["open", "打开写入流"], ["write", "写入内容"], ["close", "关闭文件"], ["read", "回读校验"]]) {
  test(`${stage} 持续状态错误最多尝试两次且保留诊断`, async () => {
    const f = fixture({ stage, times: 9 });
    await assert.rejects(save(f), (error) => {
      assert.equal(error.fileName, name);
      assert.equal(error.stage, label);
      assert.equal(error.attempts, 2);
      assert.match(error.message, /已重试一次.*InvalidStateError/);
      return true;
    });
    assert.equal(f.calls[stage], 2);
  });
}

for (const errorName of ["NotAllowedError", "QuotaExceededError", "UnknownError", "AbortError", "Error"]) {
  test(`${errorName} 非状态错误不重试`, async () => {
    const f = fixture({ stage: "write", error: () => new DOMException("其它失败", errorName) });
    await assert.rejects(save(f), new RegExp(`写入内容失败.*${errorName}`));
    assert.equal(f.calls.write, 1);
    assert.equal(f.calls.abort, 1);
  });
}

test("UnknownError 只有包含已知状态信息时重试", async () => {
  const f = fixture({ stage: "open", error: () => new DOMException("state had changed since it was read from disk", "UnknownError") });
  await save(f);
  assert.equal(f.calls.open, 2);
});

test("中止失败停止重试并保留两个错误", async () => {
  const f = fixture({ stage: "write", abortFail: true });
  await assert.rejects(save(f), /写入内容失败.*InvalidStateError.*中止写入也失败.*无法中止.*未继续重写/);
  assert.equal(f.calls.open, 1);
});

for (const mismatch of ["", "不完整"]) {
  test(`回读内容不符 ${JSON.stringify(mismatch)} 必须失败`, async () => {
    const f = fixture({ mismatch });
    await assert.rejects(save(f), /回读校验失败.*内容与原始记录不一致/);
    assert.equal(f.calls.read, 1);
    assert.equal(f.calls.open, 1);
  });
}

test("已有同名备份零写入且原文件不变", async () => {
  const f = fixture({ existing: "旧备份" });
  await assert.rejects(save(f), /已有同名备份/);
  assert.equal(f.content(), "旧备份");
  assert.equal(f.calls.create, 0);
});

test("检查同名文件权限错误不是文件不存在", async () => {
  const directory = { getFileHandle: async () => { throw new DOMException("拒绝访问", "NotAllowedError"); } };
  await assert.rejects(Backup.save(directory, name, raw), /检查同名文件失败.*NotAllowedError/);
});
