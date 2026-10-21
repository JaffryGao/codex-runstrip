# 内部独立验证构建（非公开发行）

公开发行仅提供一个轻量版 `Codex Runstrip.app`，使用本机 Node.js 22+。本文件仅记录维护者用于空环境和依赖隔离验收的内部 Standalone 构建；不属于 GitHub Release 的下载选项，也不参与启动时更新匹配。

## 构建内部验证包

在 macOS 上准备自包含的 Node.js 22+ 运行时（含许可证）和官方 npm `tiktoken 1.0.22` 文件及完整许可证：

公开发行打包脚本只支持 Lite；内部 Standalone 直接调用构建脚本：

```bash
CODEX_FORK_NODE_PATH="$(command -v node)" \
RUNSTRIP_TOKENIZER_SOURCE="$PWD/dependencies/tiktoken-1.0.22" \
RUNSTRIP_TOKENIZER_LICENSE="$PWD/dependencies/tiktoken-LICENSE" \
RUNSTRIP_EDITION=standalone \
CODEX_FORK_APP_NAME="Codex Runstrip" \
CODEX_FORK_OUTPUT_DIR="$PWD/release/internal/Codex-Runstrip-Standalone" \
./build.sh
```

该构建把 Node.js 与最小 BPE 文件集放入应用，仅用于隔离性、签名与运行时测试，不要上传为公开版本或替代正式 Lite 包。

## 验证

```bash
RUNSTRIP_TOKENIZER_PATH="$PWD/dependencies/tiktoken-1.0.22" \
RUNSTRIP_TEST_APP="$PWD/release/internal/Codex-Runstrip-Standalone/Codex Runstrip.app" \
node --test test/*.test.mjs
```

完整源文件、运行环境及组件许可证说明见仓库 README。
