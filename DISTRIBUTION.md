# Runstrip

Runstrip is an unofficial local companion for the Codex desktop app. It adds a
small session-status strip below the composer.

## Install

1. Download the `Runstrip-macos-arm64.zip` asset from the latest GitHub Release.
2. Unzip it and move `Runstrip.app` to Applications.
3. Quit ChatGPT/Codex completely, then open Runstrip.
4. If macOS blocks the first launch, Control-click the app and choose Open.

Runstrip relaunches ChatGPT with a loopback-only debugging port. It does not
force-quit an already running app.

## Data and limitations

Runstrip reads local Codex session files from `~/.codex/sessions`. It does not
upload session content. Some figures are approximations; see the README for
their definitions and known limitations.

This release targets Apple Silicon Macs. It is ad-hoc signed and not notarized,
so macOS may require a one-time manual confirmation on first launch.

Logs: `~/Library/Logs/Codex fork/launcher.log`.

## 简体中文安装说明

1. 解压并将 `Runstrip.app` 移入“应用程序”。
2. 完全退出 ChatGPT/Codex，再打开 Runstrip。
3. 若 macOS 阻止首次启动，按住 Control 点击应用并选择“打开”。
   系统若仍阻止运行，请检查“系统设置 → 隐私与安全性”中对应应用的提示。

此包仅适用于 Apple Silicon Mac，内置 Node.js，无需另行安装。
应用未经过 Apple 公证，首次启动可能需要手动确认。
Runstrip 不会强制退出正在运行的 Codex，也不会上传会话内容。
多会话并行时可能读取最近写入的另一个会话，部分统计为估算值。
