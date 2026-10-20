#!/bin/bash
# 从 src/ 组装可分享的 Runstrip.app。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$ROOT_DIR/src"
DIST_DIR="$ROOT_DIR/dist"
OUTPUT_DIR="${CODEX_FORK_OUTPUT_DIR:-$DIST_DIR}"
APP_NAME="${CODEX_FORK_APP_NAME:-Runstrip}"
APP_DIR="$OUTPUT_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
NODE_DIR="$RESOURCES_DIR/node"
EDITION="${RUNSTRIP_EDITION:-full}"
case "$EDITION" in
  full|lite) ;;
  *) printf '未知版本：%s（使用 full 或 lite）\n' "$EDITION" >&2; exit 1 ;;
esac

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
if [ "$EDITION" = "full" ]; then
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

for file in Info.plist inject.js launcher.sh run.mjs; do
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
cp "$SRC_DIR/launcher.sh" "$MACOS_DIR/Codex fork"
cp "$SRC_DIR/inject.js" "$RESOURCES_DIR/inject.js"
cp "$SRC_DIR/run.mjs" "$RESOURCES_DIR/run.mjs"
cp "$ICON_SOURCE" "$RESOURCES_DIR/AppIcon.icns"
if [ "$EDITION" = "full" ]; then
  mkdir -p "$NODE_DIR/bin"
  cp "$NODE_SOURCE" "$NODE_DIR/bin/node"
  cp "$NODE_HOME/LICENSE" "$NODE_DIR/LICENSE"
  chmod 755 "$NODE_DIR/bin/node"
else
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Runstrip Lite" "$CONTENTS_DIR/Info.plist"
fi
chmod 755 "$MACOS_DIR/Codex fork"

plutil -lint "$CONTENTS_DIR/Info.plist" >/dev/null
xattr -cr "$APP_DIR"
codesign --force --sign - "$APP_DIR" >/dev/null

printf '已构建：%s\n版本：%s\n' "$APP_DIR" "$EDITION"
if [ "$EDITION" = "full" ]; then
  printf 'Node.js：%s (%s, %s)\n' "$NODE_VERSION" "$NODE_ARCH" "$NODE_SOURCE"
fi
