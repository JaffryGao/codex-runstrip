#!/bin/bash
# 从 src/ 组装可分享的 Codex Runstrip.app。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$ROOT_DIR/src"
DIST_DIR="$ROOT_DIR/dist"
OUTPUT_DIR="${CODEX_FORK_OUTPUT_DIR:-$DIST_DIR}"
EDITION="${RUNSTRIP_EDITION:-full}"
case "$EDITION" in
  full|standalone) DEFAULT_APP_NAME="Codex Runstrip" ;;
  lite) DEFAULT_APP_NAME="Codex Runstrip Lite" ;;
  *) printf '未知版本：%s（使用 full、lite 或 standalone）\n' "$EDITION" >&2; exit 1 ;;
esac
APP_NAME="${CODEX_FORK_APP_NAME:-$DEFAULT_APP_NAME}"
APP_DIR="$OUTPUT_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
NODE_DIR="$RESOURCES_DIR/node"

CODEX_APP="${CODEX_APP_PATH:-/Applications/ChatGPT.app}"
ICON_SOURCE="$CODEX_APP/Contents/Resources/electron.icns"
NODE_SOURCE="${CODEX_FORK_NODE_PATH:-$(command -v node || true)}"

if [ ! -d "$SRC_DIR" ]; then
  printf '缺少源码目录：%s\n' "$SRC_DIR" >&2
  exit 1
fi
if [ ! -f "$ICON_SOURCE" ]; then
  printf '找不到 ChatGPT 图标：%s\n请设置 CODEX_APP_PATH 指向 ChatGPT.app。\n' "$ICON_SOURCE" >&2
  exit 1
fi
if [ "$EDITION" != "lite" ]; then
  if [ -z "$NODE_SOURCE" ] || [ ! -x "$NODE_SOURCE" ]; then
    printf '找不到可用的 Node.js。请安装 Node.js 22 或更新版本。\n' >&2
    exit 1
  fi

  NODE_VERSION="$("$NODE_SOURCE" -p 'process.versions.node')"
  NODE_MAJOR="${NODE_VERSION%%.*}"
  if [ "$NODE_MAJOR" -lt 22 ]; then
    printf 'Node.js 版本过旧：%s（需要 22 或更新版本）\n' "$NODE_VERSION" >&2
    exit 1
  fi

  HOST_ARCH="$(uname -m)"
  NODE_ARCH="$("$NODE_SOURCE" -p 'process.arch')"
  case "$HOST_ARCH:$NODE_ARCH" in
    arm64:arm64|x86_64:x64) ;;
    *)
      printf 'Node.js 架构与当前 Mac 不匹配：Mac=%s，Node=%s\n' "$HOST_ARCH" "$NODE_ARCH" >&2
      exit 1
      ;;
  esac

  NODE_HOME="$(cd "$(dirname "$NODE_SOURCE")/.." && pwd)"
  if [ ! -f "$NODE_HOME/LICENSE" ]; then
    printf '找不到 Node.js 许可证文件：%s/LICENSE\n' "$NODE_HOME" >&2
    exit 1
  fi
fi

if [ "$EDITION" = "standalone" ]; then
  # Homebrew 的 node 可能依赖安装目录外的 dylib，不能直接当独立运行时。
  NODE_LIBRARIES="$(otool -L "$NODE_SOURCE")"
  while IFS= read -r dependency; do
    case "$dependency" in
      /System/Library/*|/usr/lib/*) ;;
      *) printf 'Node.js 存在外部动态依赖：%s\n请使用官方自包含运行时。\n' "$dependency" >&2; exit 1 ;;
    esac
  done < <(printf '%s\n' "$NODE_LIBRARIES" | tail -n +2 | awk '{print $1}')
  NODE_MIN_OS="$(xcrun vtool -show-build "$NODE_SOURCE" | awk '$1 == "minos" {print $2; exit}')"
  if [[ ! "$NODE_MIN_OS" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
    printf '无法确认 Node.js 的最低 macOS 版本。\n' >&2
    exit 1
  fi
fi

TOKENIZER_SOURCE="${RUNSTRIP_TOKENIZER_SOURCE:-}"
TOKENIZER_LICENSE="${RUNSTRIP_TOKENIZER_LICENSE:-$TOKENIZER_SOURCE/LICENSE}"
if [ "$EDITION" = "standalone" ] || [ -n "$TOKENIZER_SOURCE" ]; then
  for file in package.json lite/tiktoken_bg.cjs lite/tiktoken_bg.wasm encoders/o200k_base.json; do
    if [ ! -f "$TOKENIZER_SOURCE/$file" ]; then
      printf '缺少分词器文件：%s\n请指定 RUNSTRIP_TOKENIZER_SOURCE。\n' "$file" >&2
      exit 1
    fi
  done
  if [ ! -s "$TOKENIZER_LICENSE" ]; then
    printf '缺少分词器许可证；请指定 RUNSTRIP_TOKENIZER_LICENSE。\n' >&2
    exit 1
  fi
  if [ "$(/usr/bin/plutil -extract name raw -o - "$TOKENIZER_SOURCE/package.json")" != "tiktoken" ] || \
     [ "$(/usr/bin/plutil -extract version raw -o - "$TOKENIZER_SOURCE/package.json")" != "1.0.22" ]; then
    printf '分词器版本不兼容：需要 tiktoken 1.0.22。\n' >&2
    exit 1
  fi
fi

for file in Info.plist inject.js speed.js stats.mjs tokenizer.mjs binding.js launcher.sh run.mjs; do
  if [ ! -f "$SRC_DIR/$file" ]; then
    printf '缺少源码文件：%s\n' "$SRC_DIR/$file" >&2
    exit 1
  fi
done

if [ -e "$APP_DIR" ]; then
  if [ "${CODEX_FORK_REPLACE:-0}" != "1" ]; then
    printf '目标已存在，拒绝覆盖：%s\n设置 CODEX_FORK_REPLACE=1 后可重建。\n' "$APP_DIR" >&2
    exit 1
  fi
  rm -rf "$APP_DIR"
fi
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cp "$SRC_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$SRC_DIR/launcher.sh" "$MACOS_DIR/Codex Runstrip"
cp "$SRC_DIR/inject.js" "$RESOURCES_DIR/inject.js"
cp "$SRC_DIR/speed.js" "$RESOURCES_DIR/speed.js"
cp "$SRC_DIR/stats.mjs" "$RESOURCES_DIR/stats.mjs"
cp "$SRC_DIR/tokenizer.mjs" "$RESOURCES_DIR/tokenizer.mjs"
cp "$SRC_DIR/binding.js" "$RESOURCES_DIR/binding.js"
cp "$SRC_DIR/run.mjs" "$RESOURCES_DIR/run.mjs"
cp "$ICON_SOURCE" "$RESOURCES_DIR/AppIcon.icns"
if [ "$EDITION" != "lite" ]; then
  mkdir -p "$NODE_DIR/bin"
  cp "$NODE_SOURCE" "$NODE_DIR/bin/node"
  cp "$NODE_HOME/LICENSE" "$NODE_DIR/LICENSE"
  chmod 755 "$NODE_DIR/bin/node"
else
  /usr/libexec/PlistBuddy -c "Set :CFBundleName Codex Runstrip Lite" "$CONTENTS_DIR/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Codex Runstrip Lite" "$CONTENTS_DIR/Info.plist"
fi
if [ -n "$TOKENIZER_SOURCE" ]; then
  TOKENIZER_DEST="$RESOURCES_DIR/vendor/tiktoken"
  mkdir -p "$TOKENIZER_DEST/lite" "$TOKENIZER_DEST/encoders"
  for file in package.json lite/tiktoken_bg.cjs lite/tiktoken_bg.wasm encoders/o200k_base.json; do
    cp "$TOKENIZER_SOURCE/$file" "$TOKENIZER_DEST/$file"
  done
  cp "$TOKENIZER_LICENSE" "$TOKENIZER_DEST/LICENSE"
fi
if [ "$EDITION" = "standalone" ]; then
  cp "$ROOT_DIR/STANDALONE.md" "$RESOURCES_DIR/STANDALONE.md"
  /usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion $NODE_MIN_OS" "$CONTENTS_DIR/Info.plist"
fi
chmod 755 "$MACOS_DIR/Codex Runstrip"

plutil -lint "$CONTENTS_DIR/Info.plist" >/dev/null
xattr -cr "$APP_DIR"
codesign --force --sign - "$APP_DIR" >/dev/null

printf '已构建：%s\n版本：%s\n' "$APP_DIR" "$EDITION"
if [ "$EDITION" != "lite" ]; then
  printf 'Node.js：%s (%s, %s)\n' "$NODE_VERSION" "$NODE_ARCH" "$NODE_SOURCE"
fi
