#!/bin/bash
# Build full and/or lite editions. Existing release targets are never replaced.

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

EDITION="${1:-all}"
case "$EDITION" in
  all) EDITIONS=(full lite) ;;
  full|lite) EDITIONS=("$EDITION") ;;
  *) printf '用法：%s [all|full|lite]\n' "$0" >&2; exit 1 ;;
esac
RELEASE_ROOT="${RUNSTRIP_RELEASE_ROOT:-$ROOT_DIR/release}"

# Preflight all targets before building either edition.
for edition in "${EDITIONS[@]}"; do
  NAME="Runstrip"
  [ "$edition" != "lite" ] || NAME="Runstrip-Lite"
  RELEASE_DIR="$RELEASE_ROOT/$NAME-macos-$ARCH_NAME"
  ZIP_PATH="$RELEASE_DIR.zip"
  if [ -e "$RELEASE_DIR" ] || [ -e "$ZIP_PATH" ]; then
    printf '发布目标已存在，拒绝覆盖：\n%s\n%s\n' "$RELEASE_DIR" "$ZIP_PATH" >&2
    exit 1
  fi
done

mkdir -p "$RELEASE_ROOT"
for edition in "${EDITIONS[@]}"; do
  NAME="Runstrip"
  APP_NAME="Runstrip"
  if [ "$edition" = "lite" ]; then NAME="Runstrip-Lite"; APP_NAME="Runstrip Lite"; fi
  RELEASE_DIR="$RELEASE_ROOT/$NAME-macos-$ARCH_NAME"
  APP_PATH="$RELEASE_DIR/$APP_NAME.app"
  ZIP_PATH="$RELEASE_DIR.zip"
  RUNSTRIP_EDITION="$edition" \
  CODEX_FORK_OUTPUT_DIR="$RELEASE_DIR" \
  CODEX_FORK_APP_NAME="$APP_NAME" \
    "$ROOT_DIR/build.sh"

  if [ "$edition" = "lite" ]; then
    printf '轻量版 / LITE EDITION\n未内置 Node.js，需要自行安装 Node.js 22 或更新版本。\nRequires a separate Node.js 22+ installation. No Node.js runtime is bundled.\n\n' > "$RELEASE_DIR/README.txt"
  else
    printf '完整版 / FULL EDITION\n已内置 Node.js，无需另行安装；解压后约 121 MB。\nIncludes Node.js; no separate installation needed. About 121 MB unpacked.\n\n' > "$RELEASE_DIR/README.txt"
  fi
  cat "$ROOT_DIR/DISTRIBUTION.md" >> "$RELEASE_DIR/README.txt"
  ditto -c -k --sequesterRsrc --keepParent "$RELEASE_DIR" "$ZIP_PATH"

  printf '分享包：%s\nApp：%s\n' "$ZIP_PATH" "$APP_PATH"
done
