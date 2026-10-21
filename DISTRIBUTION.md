Codex Runstrip 轻量版

这是唯一公开发行版本，应用名称为 Codex Runstrip，不再区分 Full/Lite。
需要 macOS、ChatGPT 桌面端（含 Codex）及 Node.js 22 或更新版本。

安装：解压，将 Codex Runstrip.app 移入“应用程序”；保存工作并完全退出 ChatGPT/Codex，再打开本应用。如首次启动被 macOS 阻止，请按住 Control 点击应用并选“打开”，或前往“系统设置 → 隐私与安全性”确认。

应用使用本地临时签名，未经 Apple 公证。启动时会通过本机回环端口连接 Codex；不会强制退出运行中的 Codex，不上传会话内容。Codex 关闭后注入器自动退出。

支持官方 macOS Node.js 安装包、Homebrew、默认 ~/.nvm 路径下的 nvm。自定义 Node.js 安装路径不会自动识别。
启动后静默检查 GitHub 最新正式版；有更高版本时可选择打开 Release 页面。网络错误静默忽略，不自动下载或覆盖。

日志：~/Library/Logs/Codex fork/launcher.log
项目说明与统计口径：https://github.com/JaffryGao/codex-runstrip#codex-runstrip
