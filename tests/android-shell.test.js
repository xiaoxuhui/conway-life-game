/**
 * 安卓外壳的结构性校验（通用版）。
 *
 * 这些用例不需要 Android 工具链即可运行，用于在 CI 里守住：
 * 应用身份（包名/版本/SDK）、离线要求（无网络权限）、
 * 网页资源同步（U03）、图标与关键 WebView 配置不丢失。
 *
 * 新项目接入时只需修改下面的 EXPECT 常量与 packageDir。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan, ASSETS_ROOT, ROOT } from "../scripts/sync-android-assets.mjs";
import { ENTRY_PAGE } from "../scripts/android-assets.config.mjs";

const ANDROID = path.join(ROOT, "android");
const APP = path.join(ANDROID, "app", "src", "main");

/** ===== 按项目替换 ===== */
const EXPECT = {
  applicationId: "com.xiaoxuhui.conway",
  namespace: "com.xiaoxuhui.conway",
  minSdk: 24,
  targetSdk: 34,
  versionCode: 1,
  versionName: "0.16.0",
  appName: "康威生命游戏",
  /** MainActivity.kt 所在包路径（对应 java/ 下的目录层级） */
  packageDir: ["com", "xiaoxuhui", "conway"],
  /** 网页调用的原生桥名称（addJavascriptInterface 的第二个参数） */
  bridgeName: "ConwayAndroid",
};

const read = (file) => readFile(file, "utf8");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("U03 assets 中的网页与源产物字节一致", async () => {
  const items = await buildPlan();
  assert.ok(items.length > 0, "同步清单为空，请检查 android-assets.config.mjs");
  for (const item of items) {
    assert.ok(existsSync(item.to), `缺少 ${item.rel}，请先执行同步命令`);
    const [source, target] = await Promise.all([
      readFile(item.from),
      readFile(item.to),
    ]);
    assert.equal(Buffer.compare(source, target), 0, `${item.rel} 与源不一致`);
  }
});

test("入口页存在于 assets 中", () => {
  assert.ok(
    existsSync(path.join(ASSETS_ROOT, ENTRY_PAGE)),
    `缺少入口页 ${ENTRY_PAGE}（需与 MainActivity 的 ASSET_FILE 一致）`
  );
});

test("应用身份与需求一致（包名/SDK/版本）", async () => {
  const gradle = await read(path.join(ANDROID, "app", "build.gradle.kts"));
  assert.match(gradle, new RegExp(`applicationId\\s*=\\s*"${escape(EXPECT.applicationId)}"`));
  assert.match(gradle, new RegExp(`namespace\\s*=\\s*"${escape(EXPECT.namespace)}"`));
  assert.match(gradle, new RegExp(`minSdk\\s*=\\s*${EXPECT.minSdk}`));
  assert.match(gradle, new RegExp(`targetSdk\\s*=\\s*${EXPECT.targetSdk}`));
  assert.match(gradle, new RegExp(`versionCode\\s*=\\s*${EXPECT.versionCode}`));
  assert.match(gradle, new RegExp(`versionName\\s*=\\s*"${escape(EXPECT.versionName)}"`));
});

test("应用显示名正确", async () => {
  const strings = await read(path.join(APP, "res", "values", "strings.xml"));
  assert.match(
    strings,
    new RegExp(`<string name="app_name">${escape(EXPECT.appName)}</string>`)
  );
});

test("清单声明启动入口且不申请任何权限（离线运行）", async () => {
  const manifest = await read(path.join(APP, "AndroidManifest.xml"));
  assert.match(manifest, /android\.intent\.category\.LAUNCHER/);
  assert.match(manifest, /android:name="\.MainActivity"/);
  assert.doesNotMatch(manifest, /uses-permission/, "外壳不应申请任何权限");
  assert.doesNotMatch(
    manifest,
    /android\.permission\.INTERNET/,
    "应用必须完全离线，不得声明网络权限"
  );
});

test("旋转屏幕不重建 Activity 且不锁定方向", async () => {
  const manifest = await read(path.join(APP, "AndroidManifest.xml"));
  const configChanges = manifest.match(/android:configChanges="([^"]+)"/);
  assert.ok(configChanges, "MainActivity 应声明 configChanges");
  for (const flag of ["orientation", "screenSize", "keyboardHidden"]) {
    assert.ok(
      configChanges[1].includes(flag),
      `configChanges 应包含 ${flag}，以保证旋转时状态不丢失`
    );
  }
  assert.doesNotMatch(
    manifest,
    /android:screenOrientation/,
    "不应锁定屏幕方向，需同时支持手机竖屏与平板横屏"
  );
});

test("WebView 关键配置齐备（JS/本地存储/离线资源/返回键）", async () => {
  const activity = await read(
    path.join(APP, "java", ...EXPECT.packageDir, "MainActivity.kt")
  );
  assert.match(activity, /javaScriptEnabled\s*=\s*true/, "需启用 JavaScript");
  assert.match(activity, /domStorageEnabled\s*=\s*true/, "需启用 localStorage");
  assert.match(activity, /WebViewAssetLoader/, "需通过资产加载器提供本地页面（离线）");
  assert.match(activity, /allowFileAccess\s*=\s*false/, "不应开放文件系统访问");
  assert.match(activity, /onBackPressedDispatcher/, "需处理返回键");
  assert.match(activity, /canGoBack\(\)/, "返回键需优先回退网页历史");
  assert.match(activity, /setOnApplyWindowInsetsListener/, "需处理系统栏遮挡");
  assert.match(activity, /appassets\.androidplatform\.net/, "应以固定域名加载，保证存储 origin 稳定");
  assert.match(activity, /addJavascriptInterface\(/, "需注册 JS 桥（导出/保存功能）");
  assert.match(
    activity,
    new RegExp(`"${escape(EXPECT.bridgeName)}"`),
    `JS 桥名称应为 ${EXPECT.bridgeName}`
  );
  assert.match(activity, /onShowFileChooser/, "需支持网页选择文件（导入功能）");
});

test("图标资源齐全（各密度传统图标 + 自适应图标前景）", () => {
  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  for (const density of densities) {
    assert.ok(
      existsSync(path.join(APP, "res", `mipmap-${density}`, "ic_launcher.png")),
      `缺少 mipmap-${density}/ic_launcher.png`
    );
    assert.ok(
      existsSync(path.join(APP, "res", `mipmap-${density}`, "ic_launcher_foreground.png")),
      `缺少 mipmap-${density}/ic_launcher_foreground.png`
    );
  }
  assert.ok(existsSync(path.join(APP, "res", "mipmap-anydpi-v26", "ic_launcher.xml")));
  assert.ok(existsSync(path.join(APP, "res", "mipmap-anydpi-v33", "ic_launcher.xml")));
  assert.ok(existsSync(path.join(APP, "res", "drawable", "ic_launcher_background.xml")));
});
