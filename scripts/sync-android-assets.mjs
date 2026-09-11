#!/usr/bin/env node
/**
 * 把网页资源同步到安卓工程的 assets 中（通用版，支持文件与目录）。
 *
 * 单一数据源原则：网页只在源目录维护，安卓外壳只做拷贝，
 * assets 目录不纳入版本库（见 android/.gitignore）。
 *
 * 用法：
 *   node scripts/sync-android-assets.mjs          写入同步
 *   node scripts/sync-android-assets.mjs --check   只校验，不一致时退出码 1
 *
 * 需要同步哪些文件在 scripts/android-assets.config.mjs 中配置。
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASSETS_DIR, SYNC_ITEMS } from "./android-assets.config.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ASSETS_ROOT = path.join(ROOT, ASSETS_DIR);

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await walk(full);
      out.push(...sub.map((f) => path.join(entry.name, f)));
    } else {
      out.push(entry.name);
    }
  }
  return out;
}

/** 展开配置，得到 [{ from, to, rel }] 文件清单 */
export async function buildPlan() {
  const items = [];
  for (const item of SYNC_ITEMS) {
    const from = path.join(ROOT, item.from);
    if (!existsSync(from)) {
      throw new Error(`找不到源：${item.from}（相对仓库根）`);
    }
    const info = await stat(from);
    if (item.type === "file" || info.isFile()) {
      items.push({ from, to: path.join(ASSETS_ROOT, item.to), rel: item.to });
    } else {
      const files = await walk(from);
      for (const file of files) {
        const rel = path.join(item.to, file);
        items.push({
          from: path.join(from, file),
          to: path.join(ASSETS_ROOT, rel),
          rel,
        });
      }
    }
  }
  return items;
}

/** 返回 assets 中存在但不在清单内的多余文件（相对 assets 根） */
async function findExtras(expectedRels) {
  if (!existsSync(ASSETS_ROOT)) return [];
  const expected = new Set(expectedRels.map((r) => path.normalize(r)));
  return (await walk(ASSETS_ROOT)).filter((f) => !expected.has(path.normalize(f)));
}

export async function check() {
  const items = await buildPlan();
  const problems = [];
  for (const item of items) {
    if (!existsSync(item.to)) {
      problems.push(`缺少 ${item.rel}`);
      continue;
    }
    const [source, target] = await Promise.all([readFile(item.from), readFile(item.to)]);
    if (Buffer.compare(source, target) !== 0) {
      problems.push(`内容不一致 ${item.rel}`);
    }
  }
  const extras = await findExtras(items.map((i) => i.rel));
  return { items, problems, extras };
}

async function sync() {
  const { items, extras } = await check();

  // 清理上一版残留（例如打包器带 hash 的旧文件）
  for (const extra of extras) {
    await rm(path.join(ASSETS_ROOT, extra), { force: true });
    console.log(`- 移除旧文件 ${extra}`);
  }

  let total = 0;
  for (const item of items) {
    const content = await readFile(item.from);
    await mkdir(path.dirname(item.to), { recursive: true });
    await writeFile(item.to, content);
    total += content.length;
  }

  console.log(
    `✓ 已同步 ${items.length} 个文件到 ${ASSETS_DIR}（${total} 字节，sha256 ${sha256(
      Buffer.concat(await Promise.all(items.map((i) => readFile(i.from))))
    ).slice(0, 12)}）`
  );
  if (extras.length) console.log(`  清理旧文件 ${extras.length} 个`);
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  try {
    if (checkOnly) {
      const { items, problems, extras } = await check();
      if (problems.length || extras.length) {
        for (const p of problems) console.error(`✗ ${p}`);
        for (const e of extras) console.error(`✗ 多余文件 ${e}`);
        console.error("请执行同步命令后重试");
        process.exit(1);
      }
      console.log(`✓ assets 与源一致（${items.length} 个文件）`);
      return;
    }
    await sync();
  } catch (error) {
    console.error(`✗ 同步失败：${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
