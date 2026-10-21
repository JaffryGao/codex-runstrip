# Codex Runstrip

Codex Runstrip is an unofficial local companion for the Codex desktop app. It adds a
small session-status strip below the composer.

## Install

Choose one edition:

| Edition | ZIP filename | Unpacked app | Node.js |
| --- | --- | --- | --- |
| Full (recommended if unsure) | `Codex-Runstrip-macos-arm64.zip` | About 121 MB | Bundled; no separate install |
| Lite | `Codex-Runstrip-Lite-macos-arm64.zip` | About 1 MB | Requires a separate Node.js 22+ install |

These are unpacked sizes; ZIP downloads are smaller.
The full edition's size is almost entirely its bundled Node.js runtime.
Source builds can include a local BPE tokenizer; without it, live speed is unavailable,
while usage and turn/step counts still work. Standalone builds include both Node.js
and the tokenizer; their build and installation guide is in STANDALONE.md.

1. Download one of the ZIP files above from GitHub Releases.
2. Unzip it and move `Codex Runstrip.app` or `Codex Runstrip Lite.app` to Applications.
3. Quit ChatGPT/Codex completely, then open Codex Runstrip.
4. If macOS blocks the first launch, Control-click the app and choose Open.

Codex Runstrip relaunches ChatGPT with a loopback-only debugging port. It does not
force-quit an already running app.

Launch only one edition. Lite detects Node.js installed by the official macOS
installer, Homebrew, or nvm in the default `~/.nvm` directory. If Node.js 22+ is
missing, it shows a dialog. Install Node.js and reopen Lite, or use Full.
Custom Node.js installation paths are not automatically detected.

## Data and limitations

Codex Runstrip reads local Codex session files from `~/.codex/sessions`. It does not
upload session content. Some figures are approximations; see the README for
their definitions and known limitations.
Statistics follow the selected chat and host; ambiguous selection stays pending.
Remote-host logs and detached chat windows are not currently supported. The main
speed is approximate local BPE throughput; completed-turn P50/P95 use output-rate
windows, not per-token latency. Actual server usage is shown separately in details.

This release targets Apple Silicon Macs. It is ad-hoc signed and not notarized,
so macOS may require a one-time manual confirmation on first launch.

Logs: `~/Library/Logs/Codex fork/launcher.log`.

## 简体中文安装说明

请选择一个版本：

| 版本 | 下载文件名 | 解压后应用大小 | Node.js 要求 |
| --- | --- | --- | --- |
| 完整版（不确定时选这个） | `Codex-Runstrip-macos-arm64.zip` | 约 121 MB | 已内置，无需另行安装 |
| 轻量版 | `Codex-Runstrip-Lite-macos-arm64.zip` | 约 1 MB | 需自行安装 Node.js 22 或更新版本 |

以上为解压后的体积，ZIP 下载包更小。完整版体积主要来自内置 Node.js。
源码构建可内置 BPE 分词器，缺失时实时速度不可用，用量和轮步统计仍可使用。
Standalone 内置 Node.js 与分词器，构建和安装说明见 STANDALONE.md。

1. 解压并将 `Codex Runstrip.app` 或 `Codex Runstrip Lite.app` 移入“应用程序”。
2. 完全退出 ChatGPT/Codex，再打开 Codex Runstrip。
3. 若 macOS 阻止首次启动，按住 Control 点击应用并选择“打开”。
   系统若仍阻止运行，请检查“系统设置 → 隐私与安全性”中对应应用的提示。

两个版本均仅适用于 Apple Silicon Mac，选一个使用，请勿同时启动。
轻量版支持官方 macOS 安装包、Homebrew 和默认 `~/.nvm` 目录的 nvm 安装。
缺少 Node.js 22 或更新版本时会弹窗提示；安装后重开轻量版，或改用完整版。
自定义 Node.js 安装路径不会自动识别。
应用未经过 Apple 公证，首次启动可能需要手动确认。
Codex Runstrip 不会强制退出正在运行的 Codex，也不会上传会话内容。
统计绑定当前聊天与 host，绑定有歧义时保持待统计；远端日志和分离聊天窗口暂不支持。
主条是近似 BPE 吞吐率，结束后的 P50/P95 按输出速度窗口统计，并非逐 Token 延迟。
服务端真实用量在详情中单独展示。
