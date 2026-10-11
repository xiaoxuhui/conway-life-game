# 逐项导出并删除

- **Status**: PENDING
- **Approved**: 2026-10-11 用户确认继续实现；先保存再删除，不额外确认
- **Type**: feature

## R1 单项备份与删除 `[VERIFIED]`

- **Objective**: 管理函数、图案时，可将所选已保存记录导出成可恢复的 JSON，文件写入完成后立即删除该项。
- **Definition of Done**: `npm run check`、`npm run lint` 通过；`npm run test:browser` 在桌面与移动 Chromium 验证保存完成前不删除、成功删除、导入恢复、取消/写入失败/存储失败保留及防重复操作。
- **Files**: index.html、styles/main.css、scripts/dialogs.js、scripts/app.js、e2e/record-export-delete.spec.js、README.md、docs/requirements.md、docs/technical-design.md、docs/record-export-delete-plan.md。

原始代码已归档：`D:/soft/conway-life-game-backup-20261011-87027a6.zip`（Git 基线 `87027a6`）。网页确认后再推进 Android 外壳与发版。

## R2 主页全部导出并删除 `[VERIFIED]`

- **Objective**: 一次选择目录，先保存函数库与图案库两份标准 JSON，再清空两类记录；任一保存失败不删除。
- **Definition of Done**: `node --test` 相关库测试通过；完整 Playwright 桌面/移动测试通过，验证保存关闭顺序、恢复、取消/失败保留、并发变化保护、清理失败回滚、空库与界面布局。
- **Files**: index.html、styles/main.css、scripts/app.js、scripts/dialogs.js、tests/static-app.test.js、e2e/bulk-export-delete.spec.js、README.md、docs/requirements.md、docs/technical-design.md、docs/record-export-delete-plan.md。
- **Approved**: 2026-10-11 用户要求添加主页按钮；按 Skill 规则验收后合并 main、推送、核对并删除本次短分支。

## R3 主页全部导入 `[PENDING]`

- **Objective**: 通过主页配对按钮一次选择函数/图案备份，预览并确认安全合并，不覆盖现有记录。
- **Definition of Done**: `node --test tests/record-import.test.js tests/static-app.test.js tests/logic-function-library.test.js tests/pattern-library.test.js` 全绿；完整桌面/移动 Playwright 全绿，覆盖双库恢复、单库、重复/冲突、坏文件/超限/取消、写入失败回滚与并发新增；语法、lint、diff 检查通过。
- **Files**: index.html、styles/main.css、scripts/record-import.js、scripts/dialogs.js、scripts/app.js、package.json、tests/record-import.test.js、tests/static-app.test.js、e2e/bulk-import.spec.js、README.md、docs/requirements.md、docs/technical-design.md、docs/record-export-delete-plan.md。
- **Approved**: 2026-10-11 用户要求对应的全部导入按钮，验收后按已授权 Skill 流程合并推送主分支并清理本次短分支。

## R1 验证记录（2026-10-11）

- Node.js 24.19.0；Playwright 1.62.1，桌面 Chromium 与 Pixel 7 移动视口。
- `node --test tests/static-app.test.js tests/logic-function-library.test.js tests/pattern-library.test.js`：36/36 通过。
- `node node_modules/@playwright/test/cli.js test --max-failures=2`：42/42 通过（50.2 秒），包含原有 6 项冒烟与新操作 36 项。
- `node --check` 检查 scripts 中所有 JS 及新浏览器测试；`node node_modules/eslint/bin/eslint.js scripts` 与 `git diff --check`：通过。当前环境无 npm/npx 命令，直接调用本地 CLI。
- 新操作覆盖：真实管理窗口的按钮绑定、单项序列化、磁盘备份内容、文件关闭前不删除、防重复点击与 Escape、删除持久化和重载、原导入流程恢复、保留其它项、保存期间新增记录与目标修改、最后一项删除。
- 故障注入覆盖：取消文件选择、创建文件失败、写入失败、关闭失败、不支持安全存盘、本地存储写入失败，均保留记录；存储失败时提示备份已保存。
- 用例模拟文件选择器/可写文件句柄，通过测试绑定实际写入 `test-results/**/record-backup.json`，而后释放关闭操作以证明时序。系统原生“另存为”窗口及右侧内置浏览器的支持情况仍需用户试用；没有以模拟结果宣称原生窗口已验证。
- 桌面和移动截图位于 `test-results/**/record-export-delete.png`；已检查按钮、说明和管理表单无横向裁切。

## R2 验证记录（2026-10-11）

- `node --test tests/static-app.test.js tests/logic-function-library.test.js tests/pattern-library.test.js`：36/36 通过；结构断言包含新增主页按钮、进度窗口和错误提示。
- `node node_modules/@playwright/test/cli.js test --max-failures=2`：最终 78/78 通过（1.3 分钟），包含原有 42 项及新增 36 项全部备份用例，桌面 Chromium 与 Pixel 7 视口均通过。
- `node --check` 检查全部 scripts JS 与新测试；`node node_modules/eslint/bin/eslint.js scripts`、`git diff --check`：通过。
- 用独立测试存档选择目录并真实写入两份 JSON；第二份文件关闭前两库不变，重复点击不重复保存，Escape 不关闭进度窗口。关闭成功后清空、重载仍为空、原导入流程恢复两库，当前棋盘和内置图案不变。
- 故障注入：取消、不支持目录选择、两份文件分别创建句柄/创建流/写入/关闭失败、第一类清理失败、第二类清理失败时回滚、保存期间修改记录、回滚也失败时准确提示恢复。覆盖一类空库、两类均空与按钮状态。
- 首轮因测试使用错误的控件 ID 出现两项超时，修正测试定位后两次完整回归均全绿。截图发现移动端备份说明被省略，改成完整换行后再次回归通过。
- 目录选择器和文件句柄由测试模拟，通过绑定实际写入 `test-results/**/bulk-backup/*.json`；系统原生目录窗口、右侧内置浏览器支持情况尚未验证，不宣称已覆盖。
- 已查看桌面与移动 `test-results/**/bulk-homepage.png`，主页按钮可见、说明完整换行，无横向溢出。
- 未操作用户右侧浏览器的数据；不变更 Android 外壳、不构建 APK、不打版本标签。仅运行相关 Node 测试集，未宣称完整 Node 套件已运行。
- 本次保持存档格式及 Android 外壳不变，不构建或发布 APK；原代码 ZIP 可用于恢复。
