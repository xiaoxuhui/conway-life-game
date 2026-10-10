# 逐项导出并删除

- **Status**: VERIFIED
- **Approved**: 2026-10-11 用户确认继续实现；先保存再删除，不额外确认
- **Type**: feature

## R1 单项备份与删除 `[VERIFIED]`

- **Objective**: 管理函数、图案时，可将所选已保存记录导出成可恢复的 JSON，文件写入完成后立即删除该项。
- **Definition of Done**: `npm run check`、`npm run lint` 通过；`npm run test:browser` 在桌面与移动 Chromium 验证保存完成前不删除、成功删除、导入恢复、取消/写入失败/存储失败保留及防重复操作。
- **Files**: index.html、styles/main.css、scripts/dialogs.js、scripts/app.js、e2e/record-export-delete.spec.js、README.md、docs/requirements.md、docs/technical-design.md、docs/record-export-delete-plan.md。

原始代码已归档：`D:/soft/conway-life-game-backup-20261011-87027a6.zip`（Git 基线 `87027a6`）。网页确认后再推进 Android 外壳与发版。

## 验证记录（2026-10-11）

- Node.js 24.19.0；Playwright 1.62.1，桌面 Chromium 与 Pixel 7 移动视口。
- `node --test tests/static-app.test.js tests/logic-function-library.test.js tests/pattern-library.test.js`：36/36 通过。
- `node node_modules/@playwright/test/cli.js test --max-failures=2`：42/42 通过（50.2 秒），包含原有 6 项冒烟与新操作 36 项。
- `node --check` 检查 scripts 中所有 JS 及新浏览器测试；`node node_modules/eslint/bin/eslint.js scripts` 与 `git diff --check`：通过。当前环境无 npm/npx 命令，直接调用本地 CLI。
- 新操作覆盖：真实管理窗口的按钮绑定、单项序列化、磁盘备份内容、文件关闭前不删除、防重复点击与 Escape、删除持久化和重载、原导入流程恢复、保留其它项、保存期间新增记录与目标修改、最后一项删除。
- 故障注入覆盖：取消文件选择、创建文件失败、写入失败、关闭失败、不支持安全存盘、本地存储写入失败，均保留记录；存储失败时提示备份已保存。
- 用例模拟文件选择器/可写文件句柄，通过测试绑定实际写入 `test-results/**/record-backup.json`，而后释放关闭操作以证明时序。系统原生“另存为”窗口及右侧内置浏览器的支持情况仍需用户试用；没有以模拟结果宣称原生窗口已验证。
- 桌面和移动截图位于 `test-results/**/record-export-delete.png`；已检查按钮、说明和管理表单无横向裁切。
- 本次保持存档格式及 Android 外壳不变，不构建或发布 APK；原代码 ZIP 可用于恢复。
