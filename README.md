<div align="center">

# Runstrip

### A glanceable session strip for Codex Desktop.

Local session signals, right below the composer.

[English](#english) · [简体中文](#简体中文) · [Download](https://github.com/JaffryGao/codex-runstrip/releases/latest)

</div>

<p align="center">
  <img src="docs/images/01-token-cache.png" width="100%" alt="Token and cache details inside Codex, above the composer status strip">
</p>
<p align="center">
  <img src="docs/images/02-session-stats.png" width="100%" alt="Session statistics inside Codex, with the full composer and status strip visible">
</p>
<p align="center">
  <img src="docs/images/03-context-window.png" width="100%" alt="Context usage inside Codex, with the full composer and status strip visible">
</p>

<p align="center"><sub>Actual Codex Desktop screenshots · Runtime overlay, not an official built-in feature<br>Codex 客户端实机截图 · 运行时注入浮层，非官方内置功能</sub></p>

---

## English

Runstrip adds a compact, clickable status strip below the Codex Desktop composer. It surfaces session activity, token totals, cache usage, and context-window occupancy without changing Codex's installed application bundle.

### What it shows

- **Session activity:** task turns, selected tool steps, and an approximate output rate.
- **Token usage:** cumulative input and output tokens, plus the aggregate cache-hit ratio for the selected session log.
- **Context window:** the latest recorded input size against the reported context window.
- **Details on demand:** click a segment to open its breakdown.

### Install

1. Open [Releases](https://github.com/JaffryGao/codex-runstrip/releases/latest) and download `Runstrip-macos-arm64.zip`.
2. Unzip it and move `Runstrip.app` to Applications.
3. Quit ChatGPT/Codex completely, then open Runstrip.
4. If macOS blocks the first launch, Control-click the app and choose **Open**.

Runstrip bundles Node.js; no separate Node install is required. The first release targets Apple Silicon Macs. The app is ad-hoc signed and not notarized, so macOS may require a one-time manual confirmation.

If Codex is already running without a debugging port, Runstrip will not force-quit it. Quit Codex and open Runstrip again. The launcher starts ChatGPT with a loopback debugging port, then attaches the status-strip injector.

### How it works

Runstrip uses Chrome DevTools Protocol (CDP) to inject a small DOM overlay at runtime. It does not patch `app.asar`, modify Codex's React tree, or replace the installed app. A bundled Node.js process reads local Codex rollout JSONL files and updates the overlay.

### Data, accuracy, and privacy

- Session data is read from `~/.codex/sessions`; it is not uploaded by Runstrip.
- The injector connects to the local debugging endpoint. It does not expose a remote service.
- The current implementation selects the most recently modified session file globally. With multiple active sessions, the displayed figures may belong to a different session.
- Turns count `task_started` events. Tool steps count completed items from a defined set of tool types, not every UI action.
- Token totals and cache ratio are aggregated for the selected session log. Cache ratio is not split by model.
- Context occupancy uses the latest recorded input size and context-window value.
- Output rate and model time are estimates derived from event timestamps. The system-prompt and tool-definition portions of the context breakdown are fixed estimates, not measured values.

### Build from source

Requirements: macOS, ChatGPT Desktop with Codex, and Node.js 22 or newer for building.

```bash
./build.sh
```

To create an architecture-specific app and ZIP:

```bash
./package-release.sh
```

Build outputs are written under `dist/` or `release/`. Existing app bundles and release targets are not overwritten by default.

### Project status

Runstrip is an unofficial experiment built on runtime UI injection. Codex UI updates can change the DOM anchors and require adjustments. It is not affiliated with or endorsed by OpenAI. No software license has been selected yet.

## 简体中文

Runstrip 为 Codex 桌面端的输入框下方增加一条紧凑、可点击的状态条，展示会话活动、Token 用量、缓存命中和上下文占用。它不会修改已安装的 Codex 应用包。

### 显示内容

- **会话活动：**任务轮次、指定类型的工具步骤，以及近似输出速度。
- **Token 用量：**所选会话日志中的累计输入/输出 Token 和总体缓存命中率。
- **上下文窗口：**最近记录的输入量及其占上下文窗口的比例。
- **按需查看：**点击状态条各分区查看明细。

### 安装

1. 打开 [Releases](https://github.com/JaffryGao/codex-runstrip/releases/latest)，下载 `Runstrip-macos-arm64.zip`。
2. 解压后将 `Runstrip.app` 移入“应用程序”。
3. 完全退出 ChatGPT/Codex，再打开 Runstrip。
4. 如果 macOS 阻止首次启动，按住 Control 点击应用并选择“打开”。

Runstrip 已内置 Node.js，不需要另行安装。首个发布包面向 Apple Silicon Mac。应用使用本地临时签名且未经过 Apple 公证，首次启动时 macOS 可能要求手动确认。

如果 Codex 已经运行且没有调试端口，Runstrip 不会强制退出它。请先退出 Codex，再打开 Runstrip。启动器会用本机回环调试端口启动 ChatGPT，然后连接状态条注入器。

### 实现方式

Runstrip 通过 Chrome DevTools Protocol（CDP）在运行时注入轻量 DOM 浮层，不修改 `app.asar`、不改 Codex 的 React 树，也不替换已安装的应用。内置 Node.js 进程读取本地 Codex 会话 JSONL 文件并更新浮层。

### 数据口径、准确性与隐私

- 会话数据读取自 `~/.codex/sessions`；Runstrip 不会上传会话内容。
- 注入器连接本机调试端点，不对外提供远程服务。
- 当前实现全局选择最近修改的会话文件。多个会话同时活动时，底栏可能显示另一个会话的数据。
- 轮次按 `task_started` 事件计数；工具步骤只统计指定工具类型的完成事件，不等同于所有 UI 操作。
- Token 总量和缓存命中率按所选会话日志汇总，缓存率没有按模型拆分。
- 上下文占用使用最近记录的输入量和上下文窗口值。
- 输出速度和模型用时是根据事件时间戳推算的近似值；上下文拆分中的系统提示词和工具定义是固定估值，并非实测。

### 从源码构建

构建要求：macOS、安装了 Codex 的 ChatGPT 桌面端，以及 Node.js 22 或更新版本。

```bash
./build.sh
```

生成当前架构的 `.app` 和 ZIP：

```bash
./package-release.sh
```

构建产物分别放在 `dist/` 或 `release/`。默认不会覆盖已存在的应用包或发布目标。

### 项目状态

Runstrip 是基于运行时 UI 注入的非官方实验项目。Codex 更新可能改变 DOM 锚点，需要相应调整。Runstrip 与 OpenAI 无隶属关系，也未获其背书。目前尚未选择软件许可证。
