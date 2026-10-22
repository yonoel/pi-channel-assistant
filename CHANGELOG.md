# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- 微信消息始终按 follow-up 投递，并在 Pi runtime 收尾期间暂停注入，避免竞态导致通道阻塞或消息路由错误

## [0.4.0] - 2026-09-02

### Changed
+- 项目与 npm 包更名为 `@jiah-liu/pi-channel-assistant`，为飞书、企业微信等后续通道预留统一定位

## [0.3.3] - 2026-09-02

### Added
- 微信桥接断线恢复后向最近授权用户提示已重连
- 会话锁释放与陈旧锁清理测试

### Changed
- GitHub Actions 通过 npm Trusted Publishing 发布并附带 provenance
- Agent 完成状态由最终回复表达，减少微信消息噪音

## [0.3.2] - 2026-09-02

### Added
- 微信聊天自动提示当前通道与 Agent 待命、处理中、完成状态

### Changed
- 切换至电脑端时在微信明确提示回复通道

## [0.3.1] - 2026-09-01

### Added
- 微信用户授权、一次性远程确认码、任务与待确认状态查询
- 图片/文件批次的立即开始与取消操作，以及模型编号选择
- 中文与英文单语言操作文档

### Changed
- npm 包迁移至 `@jiah-liu/pi-wechat-assistant`，GitHub 仓库迁移至 `jiah-liu/pi-wechat-assistant`
- 微信回复改为任务完成后统一发送，并提供脱敏工具进度

### Fixed
- 限制未授权微信用户、符号链接文件外发、超大媒体下载、锁竞争与轮询重复消息
- 修复文件批处理竞态和过期登录提示

## [0.3.0] - 2026-06-11

### Added
- 单元测试（vitest，47 用例）：`utils`、`message`、`queue` 模块
- 进程退出清理：`SIGINT`/`SIGTERM`/`beforeExit` 自动释放锁 + 落盘 context tokens
- 图片预下载并发控制（`Semaphore`，上限 3 并发）
- CI 增加测试检查（`npm test`）

### Changed
- **Breaking**: `MessageQueue` drain 防重入保护（`_draining` 标志位）
- **Breaking**: `CommandDeps.loadClient` / `lock` / `unlock` 接口改为 async
- **Breaking**: `WeixinClient` 构造函数不再执行 I/O，改用 `WeixinClient.create()` 静态工厂
- 全部文件 I/O 从同步改为 `fs.promises` 异步
- sendFile/sendImage 重复代码提取为 `sendMedia()` 通用方法
- AI 工具守卫逻辑提取为 `guardSendToWechat()` / `guardFileSize()`
- Context token 持久化从立即写入改为 5 秒节流写入（退出时立即落盘）
- 散落的 turn 状态变量封装为 `TurnContext` 类
- 语音无转写消息改为友好提示文案

### Fixed
- `queue.drain()` 中 `setTimeout(0)` 堆叠问题（改用 `setImmediate` + 防重入）
- `tsconfig.json` `rootDir` 修正，`include` 包含根 `index.ts`

## [0.2.1] - 2026-06-10

### Changed
- 重构项目结构：所有源码移至 `src/` 目录
- 模块化拆分：`index.ts`（1378 行）拆分为 8 个职责清晰的模块
- 优化 CI：新增 typecheck 持续集成，发布流程支持 OIDC Trusted Publishing
- 新增 `preversion` hook：发版前自动 typecheck

## [0.2.0] - 2026-06-03

### Added
- 文件消息支持（下载、解密、保存到项目目录）
- 远程命令 `/name`、`/session`
- `send_file_to_wechat` / `send_image_to_wechat` AI 工具
- TUI 输入 → 微信双向同步（预览 + 图片注释）
- 增量回复发送（`message_end` 即发，不等 `agent_end`）
- 图片/文件批处理：连续发送多张图片或多文件时合并处理
- 调试日志（`PI_WECHAT_DEBUG=1`）

### Changed
- 微信时间戳从 system prompt 移至 user message 前缀

## [0.1.3] - 2026-05-30

### Added
- 远程命令：`/model`、`/thinking`、`/tools`、`/compact`、`/stop`、`/status`、`/help`
- 图片支持（下载、AES 解密、发送给模型分析）
- 消息队列 + 合并排队
- 排他锁（同一时间只有一个 TUI session 连接微信）
- 状态栏显示微信连接状态
- 扫码登录（QR code + 轮询）

## [0.1.0] - 2026-05-30

### Added
- 初始版本：微信 iLink Bot 桥接
- 文字消息双向同步
- 语音消息支持（使用微信语音转文字）
