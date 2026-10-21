#!/bin/bash
# Build the single public Lite edition. Existing release targets are never replaced.

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

if [ "$#" -gt 1 ] || [ "${1:-lite}" != "lite" ]; then
  printf '用法：%s [lite]\n公开发行仅保留一个轻量包。\n' "$0" >&2
  exit 1
fi
RELEASE_ROOT="${RUNSTRIP_RELEASE_ROOT:-$ROOT_DIR/release}"
RELEASE_DIR="$RELEASE_ROOT/Codex-Runstrip-macos-$ARCH_NAME"
APP_PATH="$RELEASE_DIR/Codex Runstrip.app"
ZIP_PATH="$RELEASE_DIR.zip"
if [ -e "$RELEASE_DIR" ] || [ -e "$ZIP_PATH" ]; then
  printf '发布目标已存在，拒绝覆盖：\n%s\n%s\n' "$RELEASE_DIR" "$ZIP_PATH" >&2
  exit 1
fi

mkdir -p "$RELEASE_ROOT"
RUNSTRIP_EDITION=lite \
CODEX_FORK_OUTPUT_DIR="$RELEASE_DIR" \
CODEX_FORK_APP_NAME="Codex Runstrip" \
  "$ROOT_DIR/build.sh"

cp "$ROOT_DIR/DISTRIBUTION.md" "$RELEASE_DIR/README.txt"
ditto -c -k --sequesterRsrc --keepParent "$RELEASE_DIR" "$ZIP_PATH"

printf '分享包：%s\nApp：%s\n' "$ZIP_PATH" "$APP_PATH"
