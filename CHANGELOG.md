# 变更日志

本文件记录重要的用户可见变化。版本号遵循语义化版本；发布日期在正式发布时填写。

## [Unreleased]

### Added

- MIT License、ESLint、GitHub Actions 和可复现依赖锁。
- 对话框模块，以及逻辑解析、展开、编译、安全验证四个独立 UMD 模块。
- 共享字符串键细胞集合演化核心和相位元数据回归测试。
- 贡献、安全、行为准则及 GitHub 协作模板。

### Changed

- 项目版本与页面资源缓存参数统一为 v0.15.0。
- CI 在受支持 Node.js 版本上执行语法、lint 和完整测试。

### Fixed

- 函数展开替换中的特殊 `$` 文本处理。
- 清空后撤销恢复运行状态。
- `phaseShiftCircuit` 的输出、终端和连接探针时间轴。

正式发布记录及早期版本细节见 `docs/stage-summary.md` 和 Git 提交历史。
