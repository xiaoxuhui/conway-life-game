# 康威生命游戏 · 安卓外壳

把康威生命游戏（纯静态网页应用）打包成可离线安装的安卓 APK。
外壳是一个极简 WebView 容器，不含任何业务逻辑，网页改动会自动跟随。

- 包名：`com.xiaoxuhui.conway`
- 应用名：康威生命游戏
- 版本：0.16.0（versionCode 1）
- minSdk 24（Android 7.0）/ targetSdk 34
- 权限：**无**（完全离线，不申请网络权限）

## 目录结构

```
android/
├── app/src/main/
│   ├── assets/index.html           # 由脚本从仓库根同步，不入库
│   ├── assets/scripts/             # 同上（Type B 多文件静态站）
│   ├── assets/styles/              # 同上
│   ├── java/com/xiaoxuhui/conway/
│   │   └── MainActivity.kt         # WebView 外壳与 JS 桥
│   └── res/                        # 图标、主题、备份规则
├── icon-source/                    # 图标原图与去水印归档
├── tools/make-icons.py             # 图标各密度生成脚本
└── gradle/wrapper/                 # Gradle wrapper
```

## 构建

### 1. 同步网页资源（必需）

网页属于 **Type B 多文件静态站**（`index.html` 相对路径引用 `scripts/` 与 `styles/`），
**没有打包器产物**，仓库根目录的文件就是发布内容，因此不需要 `npm run build`：

```bash
npm run sync:android    # index.html + scripts/ + styles/ → android/app/src/main/assets/
npm run check:android   # 校验外壳工程与预期一致（包名、版本、桥名、入口）
```

`assets/` 已在 `.gitignore` 中，**副本不入库**，避免与仓库根目录的源文件重复维护。
唯一的同步来源是仓库根目录，由 `scripts/android-assets.config.mjs` 声明。

### 2. 本地构建

需要 JDK 17：

```bash
cd android
./gradlew assembleDebug        # Linux / macOS（首次需 chmod +x gradlew）
gradlew.bat assembleDebug      # Windows
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

直接用 Android Studio 打开 `android/` 目录亦可，但需先完成第 1 步。

### 3. 云构建

推送到 `main` 或 `feat-*` 分支、且改动涉及 `index.html` / `scripts/**` / `styles/**`、`android/**`
或本 workflow 时自动触发；也可在 Actions 页面手动运行 `Android APK` workflow。
产物在 workflow 的 Artifacts 中下载（artifact 名 `conway-life-game-debug-apk`，含 `apk-sha256.txt`）。

## 版本号一致性（易漏）

发布新版本时，这几处必须一起改：

| 位置 | 内容 |
|---|---|
| `package.json` | `"version": "0.16.0"` |
| `android/app/build.gradle.kts` | `versionCode`（递增）、`versionName = "0.16.0"` |
| 根目录 `index.html` | 全部 `<script>` / `<link>` 尾缀 `?v=0.16.0` |
| `CHANGELOG.md` / `README.md` | 发布日期与下载直链 |

其中 `index.html` 的 `?v=` 尾缀是给浏览器端的静态资源去缓存用的，
忘了同步会出现"页面是新版、JS 是旧版"的组合。改完用 `npm run check:android` 复核。

## 说明

- **为什么用 WebViewAssetLoader**：以固定域名 `appassets.androidplatform.net` 加载内置页面，
  使 `localStorage` 的 origin 保持稳定 —— 这是**关键**：自定义函数与自定义图案分别存在
  `conway-life-game.logic-functions.v1`、`conway-life-game.custom-patterns.v1` 两个 key 里，
  origin 一旦漂移，用户自己攒的图案与函数会全部"消失"。
- **导出功能**：网页用 Blob URL 导出 JSON，WebView 不支持该下载方式，
  外壳注入脚本拦截带 `download` 属性的点击，抓取内容后经 JS 桥写入系统「下载」目录
  （Android 10+ 走 MediaStore，更低版本写应用外部目录）。
  覆盖图案库、函数库、世界导出三处，缺省文件名 `conway-life-export.json`。
- **导入功能**：网页的 `<input type="file">` 由 `onShowFileChooser` 转发到系统文件选择器。
- **旋转与返回键**：Activity 声明 `configChanges` 并保存/恢复 WebView 状态，旋转不重建；
  返回键优先回退网页历史，无历史时退出。
- **刘海 / 系统栏**：声明边距由 `OnApplyWindowInsetsListener` 转成 padding，
  避免 Android 15 起强制 edge-to-edge 后内容被状态栏遮挡。
- **图标重新生成**：把新原图放到 `icon-source/`（`icon-full.png`、`icon-foreground.png`），
  再执行 `python tools/make-icons.py`（需要 Pillow）。脚本会先做对称裁剪去掉生成水印；
  若原图背景是不透明的黑色（生成图常见），`make_transparent()` 会取绿通道作为 alpha。

## 触摸端已知限制

画布交互本身基于 Pointer Events（`pointerdown`），单指拖拽放置图案不受影响；
双指缩放已在 WebView 设置中关闭，避免与页面手势冲突。
本期交付目标是"能装、能开、断网可玩、数据不丢、导入导出可用"，
更精细的移动端排版属于独立改动，不在本次打包范围内。
