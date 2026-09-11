/**
 * 网页资源 → 安卓 assets 的同步配置。
 *
 * 同步脚本与单元测试共用这份配置，保证「网页单一数据源」。
 * 按项目网页形态选择一种写法（详见 SKILL.md「网页形态分类」）：
 *
 * A. 单文件 HTML（构建产物就是一个 html）
 *    export const SYNC_ITEMS = [
 *      { type: "file", from: "dist/app.html", to: "app.html" },
 *    ];
 *
 * B. 多文件静态站点（根目录 index.html + 若干脚本/样式目录）
 *    export const SYNC_ITEMS = [
 *      { type: "file", from: "index.html", to: "index.html" },
 *      { type: "dir",  from: "scripts", to: "scripts" },
 *      { type: "dir",  from: "styles",  to: "styles" },
 *    ];
 *
 * C. 打包器产物（Vite 等，dist 下已是完整站点）
 *    export const SYNC_ITEMS = [
 *      { type: "dir", from: "dist", to: "." },   // "." 表示 assets 根目录
 *    ];
 */

/** assets 目标根目录（相对仓库根） */
export const ASSETS_DIR = "android/app/src/main/assets";

/** 需要同步的条目；from 相对仓库根，to 相对 ASSETS_DIR */
export const SYNC_ITEMS = [
  { type: "file", from: "index.html", to: "index.html" },
  { type: "dir", from: "scripts", to: "scripts" },
  { type: "dir", from: "styles", to: "styles" },
];

/** WebView 加载的入口页（相对 ASSETS_DIR），需与 MainActivity 的 ASSET_FILE 一致 */
export const ENTRY_PAGE = "index.html";
