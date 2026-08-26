# 贡献指南

感谢你改进康威生命游戏。项目坚持零运行时依赖、可直接双击 `index.html`、规则与界面分离，以及可验证的小步提交。

## 开发环境

- Node.js 20.19 或更高版本
- npm（使用仓库中的 `package-lock.json`）
- 一个支持 Canvas、Pointer Events 和本地存储的现代浏览器

```powershell
npm ci
npm run check
npm run lint
npm test
```

## 修改流程

1. 先阅读 `docs/requirements.md`、`docs/technical-design.md` 和相关测试。
2. 对行为变化补充验收条件；修复缺陷时先添加能复现问题的测试。
3. 每个提交只处理一个逻辑单元，使用 `feat:`、`fix:`、`refactor:`、`test:`、`docs:`、`ci:` 或 `chore:` 前缀。
4. 保留 UMD/CommonJS 双入口，不引入需要服务器才能运行的 ES Module 或构建产物。
5. 完成后运行全部质量命令，并在 `file://` 页面检查相关交互。

## 模块边界

- `life-engine.js`：B3/S23 世界规则和存档格式。
- `logic-parse.js` / `logic-expand.js`：逻辑语言及保存函数展开。
- `logic-compile.js` / `logic-safety.js`：物理电路与枪体安全验证。
- `renderer.js`：Canvas 绘制和坐标换算。
- `dialogs.js`：图案库、函数库和对话框。
- `app.js`：页面协调、输入和演化调度。

不要在渲染层复制生命规则，也不要用期望真值代替真实细胞演化结果。

## Pull Request 检查

- [ ] 变更范围和动机清楚
- [ ] 自动化测试覆盖新增或修复的行为
- [ ] `npm run check`、`npm run lint`、`npm test` 全部通过
- [ ] 涉及界面时完成桌面与窄屏浏览器检查
- [ ] 没有提交 `node_modules`、临时文件或个人数据
- [ ] 用户可见变化已更新 README、CHANGELOG 或测试报告

提交贡献即表示你有权按本项目 MIT License 提供这些内容，并同意它们按同一许可证分发。
