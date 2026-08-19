# 康威生命游戏

一个使用原生 HTML、CSS 和 JavaScript 实现的本地康威生命游戏。

GitHub：<https://github.com/xiaoxuhui/conway-life-game>

> 当前状态：可用 MVP 已完成，包含经典图案与 JSON 导入/导出。

## 项目目标

- 双击 `index.html` 即可使用，不依赖后端服务。
- 让第一次接触生命游戏的人也能直观地绘制、运行和理解演化过程。
- 保持代码和交互简单，为后续添加更多图案与实验功能留出空间。

## 功能

- 点击或拖动棋盘绘制、擦除活细胞。
- 开始/暂停、单步、清空与撤销、25% 密度随机填充。
- 1–20 代/秒速度调节，实时显示代数、状态和活细胞数。
- 滑翔机、闪烁器、轻量级飞船和脉冲星预设。
- 带版本校验的 JSON 导入/导出。
- `空格` 开始/暂停、`→` 单步、`C` 清空。
- 响应式桌面和手机布局，核心玩法完全离线。

## 文档

- [需求文档](docs/requirements.md)
- [交互与视觉设计](docs/interaction-design.md)
- [技术设计](docs/technical-design.md)
- [开发计划与阶段门](docs/roadmap.md)
- [实施清单](docs/implementation-plan.md)
- [测试报告](docs/test-report.md)
- [阶段总结](docs/stage-summary.md)

## 本地运行

最简单的方式是在文件管理器中双击 `index.html`。应用不使用 ES Module、远程资源、后端或数据库。

开发调试时也可以在仓库目录启动任意静态文件服务器，例如：

```powershell
python -m http.server 8000
```

然后打开 `http://127.0.0.1:8000/`。

## 自动化测试

测试只使用 Node.js 自带的测试运行器，不需要安装依赖：

```powershell
npm test
```

也可以直接执行：

```powershell
node --test
```

当前测试覆盖 B3/S23 规则、经典图案、有限边界、随机填充、JSON 往返、非法导入、预设数据和离线资源结构。

## 项目结构

```text
index.html                 页面与语义结构
styles/main.css            视觉和响应式布局
scripts/life-engine.js     规则、棋盘和 JSON 格式
scripts/presets.js         经典图案
scripts/renderer.js        Canvas 渲染与坐标转换
scripts/app.js             控制、计时器和交互
tests/                     自动化测试
docs/                      需求、设计、计划与测试记录
```

## 仓库约定

- `main` 分支用于保留可演示版本。
- 每个开发阶段必须通过对应的验收清单后才能进入下一阶段。
- 新功能先更新需求或设计，再进入实现。

## 许可证

暂未选择许可证；在正式版本发布或接受外部贡献前确定。
