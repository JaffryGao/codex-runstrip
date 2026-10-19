#!/bin/bash
# Build a self-contained, architecture-specific app and a shareable ZIP.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ARCH_NAME="arm64" ;;
  x86_64) ARCH_NAME="x86_64" ;;
  *)
    printf '不支持的 Mac 架构：%s\n' "$ARCH" >&2
    exit 1
    ;;
esac

RELEASE_DIR="$ROOT_DIR/release/Runstrip-macos-$ARCH_NAME"
APP_PATH="$RELEASE_DIR/Runstrip.app"
ZIP_PATH="$ROOT_DIR/release/Runstrip-macos-$ARCH_NAME.zip"

if [ -e "$RELEASE_DIR" ] || [ -e "$ZIP_PATH" ]; then
  printf '发布目标已存在，拒绝覆盖：\n%s\n%s\n' "$RELEASE_DIR" "$ZIP_PATH" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/release"
CODEX_FORK_OUTPUT_DIR="$RELEASE_DIR" \
CODEX_FORK_APP_NAME="Runstrip" \
  "$ROOT_DIR/build.sh"

cp "$ROOT_DIR/DISTRIBUTION.md" "$RELEASE_DIR/README.txt"
ditto -c -k --sequesterRsrc --keepParent "$RELEASE_DIR" "$ZIP_PATH"

printf '分享包：%s\nApp：%s\n' "$ZIP_PATH" "$APP_PATH"
