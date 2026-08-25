# 代码评审报告 — conway-life-game

- **评审日期**：2026-08-25
- **评审人**：WorkBuddy AI
- **技术栈**：原生 HTML / CSS / JavaScript（零依赖、零构建），UMD 双模式（`<script>` 全局 + `module.exports`），Canvas 2D 渲染，Node 内置 `node:test` 测试；无 npm 依赖、无打包器。
- **源码规模**：`scripts/` 共 8 个文件、约 4100 行 JS（其中 `app.js` 1533 行、`logic-code.js` 973 行、`presets.js` 443 行、`pattern-library.js` 301 行、`logic-function-library.js` 219 行、`renderer.js` 312 行、`life-engine.js` 259 行、`speed-control.js` 52 行）；`tests/` 7 个文件、约 88 个用例；`docs/` 8 篇设计/测试文档。
- **测试结果**：用例数 **88**，通过 **88**，失败 **0**；实测命令 `node --test`，耗时 **约 139.4 秒（2 分 19 秒）**（详见第三节，最重用例单项 71.8 秒）。

---

## 一、总体评价

**可维护性评级：B（良好，但存在局部高风险耦合）**。

一个零依赖、零构建却实现了“无限稀疏世界 + 真实滑翔机逻辑门级联 + 自定义逻辑语言”的工程项目，架构分层清晰、UMD 双模式设计使核心逻辑可独立测试、枪体安全验证器与门体物理正确性均被端到端测试覆盖（包括把合成结构放进规则引擎逐代演化验证真值）。主要风险集中在两处单文件巨石：`app.js`（1533 行、约 37 字段的全局 `state` 对象）与 `logic-code.js`（973 行，解析器/宏展开/电路编译器/枪体安全验证器全部塞在一个 IIFE 内）。逻辑正确性与工程质量之间存在落差：功能正确性相当扎实，但可维护性、性能边界与工程化（无 license / 无 lint / 无 CI）存在明显缺口。

---

## 二、核心架构分析

1. **UMD 双模式模块设计**（`life-engine.js:1-5` 等 8 处）：通用 `(function expose(root, factory){ const api = factory(); if (module.exports) module.exports=api; root.X = api; })(...)` 模式，使同一文件既能 `<script>` 全局加载，又能 `require` 进 Node 测试。这是项目“双击 `index.html` 离线可用 + 纯 Node 测试”双重目标得以成立的关键，设计得当。

2. **core / renderer / app 分层**：
   - `life-engine.js` 是纯规则层（`nextGeneration`、`serialize/deserialize`、v1→v2 迁移），不触碰 DOM/计时器，全部为纯函数（除抛错外）。
   - `renderer.js` 只负责相机、坐标变换与 Canvas 绘制，绝不修改世界。
   - `app.js` 是唯一控制器，持有 `state`、事件绑定、单一 `requestAnimationFrame` 调度。
   - 分层边界总体遵守良好；但 `app.js` 同时承担了“控制 + 计时 + 交互 + 多套对话框状态 + 双本地存储库协调”，职责过宽。

3. **逻辑门编译管线**（最复杂路径，`logic-code.js`）：
   `parse` / `parseExpanded`（数字与函数式语法，支持中/英/符号）→ `expandFunctions`（AST 级宏展开，循环引用检测，8 层深度上限）→ `composePattern` / `composePatternAsync`（同步/异步）→ `compileCircuit`（递归下降，门体套件 `getLogicGateKit` 取可连接门体，按 p30 脉冲对齐子门输出到父门输入）→ `normalizeCircuit`（整体归一化）→ `validateGunSafety` / `validateGunSafetyAsync`（逐代、逐枪占用区双向包含比较，时域 `4*max(w,h)+120`）。管线设计思想成熟：用真实滑翔机碰撞而非查表完成布尔运算，且安全验证基于“规则引擎重新演化”，而非信任预设答案。

---

## 三、测试结果

- **实测命令**：`cd "D:/soft/conway-life-game" && node --test`
- **实测耗时**：`duration_ms 139435.5843`（约 2 分 19 秒；与 README 所述“枪体安全验证较重”一致）。
- **结果**：`# tests 88  # pass 88  # fail 0  # cancelled 0  # skipped 0  # todo 0`。
- **耗时分布（最重用例）**：
  - `ok 48 - 十五门保存函数组合会搜索替代布局……` `duration_ms 71837.932`（71.8 秒）
  - `ok 43 - 变量异或的两条分支均由实际滑翔机接入 OR` `duration_ms 44013.410`（44.0 秒）
  - `ok 42 - NOT(OR(A,B)) ……` `duration_ms 9726.958`（9.7 秒）
  - `ok 41 / ok 39 / ok 40` 各约 1.7–2.6 秒
  - 其余规则/相机/库/页面静态测试均在毫秒级。
- **覆盖评价**：覆盖非常充分——B3/S23 规则、负坐标与百万格外演化、输入不可变、v1/v2 存档迁移、24 预设几何、10 行逻辑门真值表、门到门真实滑翔机逐代传递、枪体 900 代 p30 完整性、枪体安全验证失败关闭、异步让出/取消、本地存储损坏/版本/写入失败、页面控件与离线资源结构。门体物理正确性是被**端到端演化验证**的，而非单测 mock，可信度高。缺口：浏览器指针/触控交互仍只有静态结构覆盖，无自动浏览器回归（测试报告 `test-report.md` 已自陈）。

---

## 四、发现的问题

### 严重（Bug / 正确性问题）

1. **`logic-code.js:364` — 宏展开替换串未转义 `$`，存在字符串替换注入隐患**
   `custom.inputs.forEach((input, i) => { body = body.replace(new RegExp(\`\\b${input.name}\\b\`, "g"), args[parameterIndex]); })`
   `String.prototype.replace` 的第二个参数若为字符串，`$&`/`$1`/``$` ``/`$'``/`$$` 会被当作特殊序列。当前逻辑代码文法（0/1、AND/OR/NOT、括号、变量字母）不会产出含 `$` 的实参，故**当前不可触达**；但 `args[parameterIndex]` 是展开后的代码文本，一旦未来支持任意字符的函数实参或常量，该写法会错误改写输出（例如插入匹配子串或相邻文本）。建议改为函数式替换：`body.replace(re, () => args[parameterIndex])`。影响：潜在静默错误输出。修复成本极低。

2. **`app.js:354` 与 `app.js:363-374` — 清空的撤销不恢复“是否运行中”**
   `clearWorld` 把 `wasRunning` 存入 `undoSnapshot`，但 `undoClear` 只读回 `world/generation/camera/logicOutputs`，丢失 `wasRunning`。结果：运行时清空→撤销可恢复世界，但世界保持暂停，与用户“撤销清空”的心智模型不一致。影响：轻微功能偏差。建议：`undoClear` 中若 `snapshot.wasRunning` 为真则调用 `start()`。

3. **`life-engine.js:98` — “无限世界”在 ±(MAX_SAFE_INTEGER−2) 处存在硬边界**
   `if (Math.abs(neighborRow) > MAX_COORDINATE || Math.abs(neighborColumn) > MAX_COORDINATE) continue;`
   坐标超过约 9×10¹⁵ 后邻居被静默丢弃，向外运动的滑翔机/飞船会“凭空消失”。这是工程取舍（用安全整数保证精度），README “无限的边界”一节也承认了容量边界；但对“无限世界”这一核心卖点而言属于真实（即便极难触达）的正确性边界。建议：在文档/注释中明确“实际为安全整数边界”，或在 `nextGeneration` 对超界细胞抛出可识别错误而非静默丢弃。影响：极端长程演化语义失真。

### 中等（设计 / 可维护性）

4. **`logic-code.js:272-287` `collectVariableNames` 混淆“函数调用名”与“变量名”**
   该函数对所有 `[A-Za-z][A-Za-z0-9_]*` 取 token，仅跳过内置门名；因此**被调用但未在 `definitions` 中提供的自定义函数名**（以及即便已展开、仍残留在文本中的同名）会被当作输入变量统计。后果：`createFunctionDefinition` 的“最多 8 个输入”计数会把函数调用名算进去，且一个引用了未定义函数的表达式会被误判为“输入未使用”或凭空多出输入。应用层 `callableLogicFunctions` 总是先 `expandFunctions` 再解析，故常见路径（定义时函数已在库里）恰好被展开掉了调用名——但“保存一个调用了尚未保存的函数的表达式”这条路径未被测试覆盖，存在隐患。影响：函数定义输入识别的边缘错误。建议：在 `collectVariableNames` 中同时跳过已展开/已登记的调用名，或改为先解析 AST 再收集变量。

5. **`logic-code.js:436-454` 复制了 `life-engine.js` 的核心演化 `nextCellSet`**
   `logic-code.js` 内部的 `nextCellSet` 与 `life-engine.js:86-110` 的 `nextGeneration` 本质相同（字符串键 `Set` 上的 B3/S23 计算）。两处独立维护，未来规则微调（如坐标边界、性能）需同步改动，否则会分叉。建议：将核心一步演化抽为共享纯函数，由 `life-engine` 暴露、`logic-code` 复用（注意 `logic-code` 的 `Set` 直接存 `"r,c"` 键，可加一个接受 `Set<string>` 的薄封装）。

6. **`logic-code.js:516-530` `phaseShiftCircuit` 未同步推进 `signalCells` / `terminalCells`**
   转置+相位预演仅推进了 `cells`、`gunGroups.referenceCells`、`observeGeneration`、`connections.alignGeneration`，但 `signalCells` 与 `terminalCells` 停留在“未相位预演”的几何上。当前编译器靠 `compileCircuit` 中的 4 次相位搜索（`logic-code.js:593-605`）吸收这一常数偏移，而 `signalDelta` 也未随相位更新——逻辑上能跑通（测试通过），但是**脆弱的隐式耦合**：任何对相位搜索次数或对齐公式的改动都可能破坏正确性，且 `signalDelta` 输出元数据在转置分支下并不严格反映真实传播方向。影响：编译器可维护性/脆弱性。建议：相位预演时一并推进 `signalCells`/`terminalCells`，并在 `signalDelta` 上叠加 2 代相位换算。

7. **`app.js:96-133` 全局 `state` 对象约 37 个字段、单文件 1533 行**
   `state` 混合了“世界/代数/速度/相机”等核心域状态与“对话框开关、`toastTimer`、删除二次确认计时器、指针手势、存储阻塞标志”等大量 UI 状态，且无子结构分组。任何跨功能重构都需通读整文件；拖动/放置/平移/缩放/逻辑生成的多套临时状态交织在 `handlePointer*` 系列里。影响：维护成本高、回归风险大。建议：将 `state` 拆为 `world`（规则+相机+速度）、`pointer`（手势）、`dialogs`、`storage` 等子对象；并把对话框/逻辑库管理逻辑拆分为独立模块。

8. **`logic-code.js` 单文件承担 4 个职责**
   同一 IIFE 内同时有：递归下降解析器、函数式宏展开器、门体电路编译器、枪体安全验证器。每个都足以独立成模块。影响：单文件 973 行、认知负荷高、难以单测某一阶段。建议：按 `parse / expand / compile / safety` 拆分为子模块（仍可用 UMD 暴露）。

### 轻微（代码味道 / 小瑕疵）

9. **`renderer.js:169` 冗余 `Math.min(size, size)`**
   `const inset = Math.max(0.45 * ratio, Math.min(size, size) * 0.07);` —— `Math.min(size, size)` 恒等于 `size`，应直接写 `size`。无意义代码。

10. **`app.js:1147` 每次绘制即清空 `logicOutputs`**
    `paintPointer` 中 `state.logicOutputs = []` 在落笔时清空所有逻辑输出锁存。虽符合“绘制会改变世界”的直觉，但用户只在空白处点一下也会丢失已放置逻辑门的结果显示。影响：轻微体验。可考虑仅在确实改变世界后清除。

11. **`logic-code.js:312` 等处 `splitProgram` 对赋值的校验仅接受单比特**
    `/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([01])$/` 只接受 0/1，符合设计；但错误提示统一为“值只能是 0 或 1”，当用户输入 `A=10` 时只报“无效”而非指出“10 不是单比特”——可提升诊断信息，非缺陷。

12. **`app.js:238` 单步会清空放置预览**
    `evolveOneGeneration` 中 `if (state.placement) state.placement = null;`：在放置模式下按 `→` 单步会直接丢弃预览。若用户期望“先放再单步观察”会落空。影响：轻微交互。

---

## 五、安全风险

- **localStorage 损坏保护（良好）**：`pattern-library.js:237-262` 与 `logic-function-library.js:163-202` 在 `JSON.parse` 失败时抛 `CORRUPT_LIBRARY`，且 `app.js` 的 `initializePatternLibrary`/`initializeLogicFunctionLibrary`（app.js:1084、807）捕获后设置 `patternStorageBlocked`/`logicFunctionStorageBlocked`，后续写操作经 `commitPatternLibrary`/`commitLogicFunctionLibrary`（app.js:913、656）直接拒绝，从而**不覆盖原始数据**。这是成熟的做法。
- **自定义 Error 类型**：`LogicCodeError`、`PatternLibraryError`、`LogicFunctionLibraryError` 均带 `code` 字段，便于上层按 `error.code` 分支（如 `DUPLICATE_NAME`、`ABORTED`、`STORAGE_WRITE_FAILED`）。错误处理规范。
- **输入校验**：坐标要求安全整数（`life-engine.js:15-23`），世界大小/图案数量/库尺寸/名称长度均有上限，导入文件限 1 MB（`app.js:1112`）且校验通过后才替换状态——无原型污染、无超大对象注入。
- **唯一需加固点**：见第四节第 1 条 `expandFunctions` 的 `$` 替换注入；虽当前文法不可触达，但属安全/正确性短板，应趁早改为函数式替换。
- 无 XSS：所有用户文本均经 `textContent` / `value` 赋值，未出现 `innerHTML` 拼接；随机数用库自带 `Math.random` 或注入源，无熵问题。

---

## 六、性能风险

- **“无限世界”的真实边界**：见第四节第 3 条。对运行数亿代、坐标持续外扩的滑翔机枪，在 ±9×10¹⁵ 处会静默截断。日常使用无碍，但需在文档强调。
- **枪体安全验证耗时**：`validateGunSafety` 的时域为 `4*max(w,h)+120` 代，且对每张候选布局/间距组合逐代做双向包含比较。实测 15 门组合（`ok 48`）耗时 **71.8 秒**。即便异步分片保持页面响应，单次生成的绝对耗时仍随电路规模近似线性增长，大型嵌套表达式可能阻塞数十秒。建议：对超 5 门结构默认异步（已做）并考虑 Web Worker（当前为兼容 `file://` 刻意不用 Worker，需在“离线兼容”与“长时间生成体验”间权衡）；或缓存已验证布局的相位结果。
- **`nextGeneration` 复杂度 O(活细胞×8)**：稀疏世界下表现良好；但 `bounds/serialize/aliveCoordinates` 每次都全量遍历 `Set` 并排序（`life-engine.js:151-156`），在高频渲染路径（每帧 `render` → 若调用 `bounds` 会触发）。当前 `render` 不直接调 `bounds`，仅 `fitView` 调用，风险可控。
- **`drawCells` 全量遍历 `world.cells`**（`renderer.js:154-175`）：每个可见/不可见细胞都参与绘制判断，细胞数极大（如数万）且小缩放时仍遍历全部——存在“大纸带”场景下的绘制开销。当前有视口裁剪（`x+drawSize<0` 等），但不可见细胞仍被遍历。可加空间索引（如按行分桶）跳过视口外整行。

---

## 七、工程化缺口

- **无 LICENSE**：仓库目前“暂未选择许可证”（README 第 117-119 行自陈）。对接受外部贡献/正式发布是硬性缺口，建议尽快确定（如 MIT）。
- **无 Lint / 格式化配置**：仓库无 `.eslintrc` / `.prettierrc` / `package.json` 的 lint 脚本；仅有 `npm run check` 做 `node --check` 语法检查。建议引入 ESLint（zero-config vanilla）纳入 pre-commit。
- **无 CI**：无 `.github/workflows` 等；`node --test` 未在任何流水线中自动运行。建议加最小 GitHub Actions：检出→`node --test`（可并行/分片以缩短 139s）。
- **`app.js` 单文件 1533 行**：见第四节第 7 条；是最大可维护性负债。
- **`state` 全局对象约 37 字段**：同上。
- **文档齐全但分散**：`docs/` 8 篇质量高，但架构/风险分散于多文件；缺一份“贡献者须知的边界与限制”摘要（如坐标硬边界、生成耗时、license 状态）。

---

## 八、后续维护建议（按优先级）

1. **（高）修复 `expandFunctions` 的 `$` 替换注入**（`logic-code.js:364`）→ 改为 `() => replacement` 函数式替换，消除当前文法下不可触达但本质不安全的写法。
2. **（高）拆分 `app.js`**：将 `state` 按域（world / pointer / dialogs / storage）分组，并把“对话框与函数库管理”抽为独立模块，降低 1533 行单文件的回归风险。
3. **（中）拆分 `logic-code.js`**：按 parse / expand / compile / safety 四个职责拆子模块，并为 `phaseShiftCircuit` 补齐 `signalCells`/`terminalCells` 的相位推进（第四节第 6 条）。
4. **（中）抽离共享演化核心**：把 `logic-code.js:436` 的 `nextCellSet` 复用以 `life-engine` 暴露的纯函数，避免规则实现分叉。
5. **（中）填补 `collectVariableNames` 的调用名/变量名混淆**（`logic-code.js:272`），并补一条“保存引用未定义函数的表达式”的回归测试。
6. **（中）降低超大型生成耗时**：为 5 门以上结构评估 Web Worker 或布局相位结果缓存，缩短 71.8 秒级阻塞（异步已保证不卡 UI，但绝对时间过长）。
7. **（低）工程化补齐**：补 LICENSE、加 ESLint、加 GitHub Actions 跑 `node --test`（可报告分片）、在 README 显式写出坐标硬边界与生成耗时限制。
8. **（低）代码味道清理**：`renderer.js:169` 冗余 `Math.min(size,size)`、补全清空撤销的 `wasRunning` 恢复、提升赋值错误提示的诊断性。

---

## 九、结论

这是一个在工程取舍上相当成熟、且**功能正确性被端到端物理演化严格验证**的零依赖项目：无限稀疏世界、真实滑翔机逻辑门级联、自定义逻辑语言与枪体安全验证都通过了 88 项测试（0 失败，含把合成电路放进规则引擎逐代核对真值）。核心分层与 UMD 双模式设计值得肯定。主要短板不在“算得对不对”，而在“好不好维护、边界是否讲清”：`app.js`（1533 行 + 37 字段 `state`）与 `logic-code.js`（973 行四职责合一）是两个维护高风险点；`$` 替换注入、`phaseShiftCircuit` 的相位漏推进、`collectVariableNames` 的命名混淆属于应在下一轮优先修掉的设计级隐患；性能上“坐标硬边界”与“大型生成 70 秒级耗时”需在文档与（可选）Worker 化上给出明确交代；工程化方面 license / lint / CI 为发布前必须补齐的缺口。综合评级 **B**：可继续交付，但建议按第八节的优先级推进重构与工程化，避免在功能继续膨胀后技术债加速累积。
