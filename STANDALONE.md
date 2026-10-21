# Codex Runstrip Standalone

Standalone bundles a self-contained Node.js runtime and the minimal tiktoken BPE files. Recipients do not need Node, npm, Homebrew or Claude Code Router. It uses the same UI and statistics as Full/Lite. This is a build option, not an additional upstream release.

## Build from source

Build on macOS with ChatGPT Desktop installed and Apple's command-line tools available. Supply these verified inputs outside the repository:

- An official Node.js 22+ runtime matching the build Mac's architecture, including `bin/node` and the complete `LICENSE`. The build rejects non-system dynamic-library dependencies and copies Node's minimum macOS version to the app. The validated configuration is official Node **24.22.0 / darwin-arm64**, requiring macOS **13.5+**; Intel builds have not been validated.
- The official npm **tiktoken 1.0.22** package. Only `package.json`, `lite/tiktoken_bg.cjs`, `lite/tiktoken_bg.wasm`, and `encoders/o200k_base.json` are copied.
- The tiktoken license from the package's exact source revision; the npm archive does not contain it. Preserve the complete license text.

Verified dependency sources:

| Component | Source / verification |
| --- | --- |
| Node 24.22.0 arm64 | [Official archive](https://nodejs.org/dist/v24.22.0/node-v24.22.0-darwin-arm64.tar.gz), compare SHA256 with [official SHASUMS256.txt](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt) |
| tiktoken 1.0.22 | [Official npm archive](https://registry.npmjs.org/tiktoken/-/tiktoken-1.0.22.tgz), verify `dist.integrity` in [version metadata](https://registry.npmjs.org/tiktoken/1.0.22) |
| tiktoken license | [LICENSE at npm gitHead 4c8b748e07992c00386f3180af5c574b27b65139](https://github.com/dqbd/tiktoken/blob/4c8b748e07992c00386f3180af5c574b27b65139/LICENSE) |

After extracting these inputs into a local `dependencies/` directory:

```bash
CODEX_FORK_NODE_PATH="$PWD/dependencies/node-v24.22.0-darwin-arm64/bin/node" \
RUNSTRIP_TOKENIZER_SOURCE="$PWD/dependencies/tiktoken-1.0.22" \
RUNSTRIP_TOKENIZER_LICENSE="$PWD/dependencies/tiktoken-LICENSE" \
  ./package-release.sh standalone
```

The ZIP is `release/Codex-Runstrip-Standalone-<version>-macos-<arch>.zip`; `<version>` comes from `src/Info.plist`. The application is `Codex Runstrip.app`. Existing targets are not replaced. Set `RUNSTRIP_RELEASE_ROOT` to retain multiple builds. If a synced directory automatically adds Finder metadata and invalidates signatures, use a fresh local directory under `/private/tmp` for the release root. The build does not change the upstream release version.

To embed the same tokenizer in Full/Lite, provide `RUNSTRIP_TOKENIZER_SOURCE` and `RUNSTRIP_TOKENIZER_LICENSE` to their build commands. Full/Lite can still be built without it; then real-time BPE numbers require a compatible existing installation or an explicit `RUNSTRIP_TOKENIZER_PATH` when invoking `node src/run.mjs`. Missing tokenizers never trigger character-based estimates.

Validation:

```bash
RUNSTRIP_TOKENIZER_PATH="$PWD/dependencies/tiktoken-1.0.22" \
RUNSTRIP_TEST_APP="$PWD/release/Codex-Runstrip-Standalone-<version>-macos-arm64/Codex Runstrip.app" \
  dependencies/node-v24.22.0-darwin-arm64/bin/node --test test/*.test.mjs
```

Replace `<version>` with the generated directory name. Bundle tests check the source files, minimal dependencies, minimum macOS version, signatures, and BPE tokenization with Homebrew and `/usr/local` reads denied. Without `RUNSTRIP_TEST_APP`, bundle tests are explicitly skipped. Do not commit downloaded dependencies or built apps.

## Install / 安装

1. Confirm the package's CPU architecture and minimum macOS version, and install ChatGPT Desktop with Codex. / 确认包对应的芯片架构及最低 macOS 版本，并已安装带 Codex 的 ChatGPT 桌面端。
2. Unzip and move `Codex Runstrip.app` to Applications; retain a backup if replacing an older copy. / 解压并移入“应用程序”，替换旧副本时先保留备份。
3. Save work, quit ChatGPT/Codex completely, then open Codex Runstrip. / 保存工作，完全退出 ChatGPT/Codex 后，从 Codex Runstrip 启动。
4. If macOS blocks it, follow the app-specific prompt in Privacy & Security. The build is ad-hoc signed, not notarized; see [Apple's instructions](https://support.apple.com/102445). / 如被阻止，按“隐私与安全”中对应应用的提示操作；此包为临时签名，未经 Apple 公证。

No administrator access is required. The launcher does not modify ChatGPT's application bundle or force-quit an active app. Launch only one Runstrip edition. It checks `/Applications/ChatGPT.app`, then `~/Applications/ChatGPT.app`.

无需管理员权限，不修改 ChatGPT 应用包，也不会强制退出正在运行的应用。请只运行一个 Runstrip 版本。启动器依次查找上述两个 ChatGPT 路径。

An older Runstrip injector can remain running after the app exits. When upgrading, save work and restart the Mac once if the old overlay persists, then launch only the new copy. Fresh installs do not need a Mac restart.

升级时旧版后台注入进程可能仍在运行；若退出应用后旧状态栏仍持续出现，保存工作并重启 Mac 一次，再只启动新副本。首次安装无需重启 Mac。

## Reading the strip / 显示口径

- Main `≈ tok/s` is recent local BPE throughput for observable text/reasoning deltas, not exact server decoding speed. / 主条是可观测正文及思考增量的近期 BPE 速度，不是服务端精确解码速度。
- The rectangle updates only with output; completion preserves it and adds current-turn P50/P95. / 矩形只随输出变化，结束后保留速度与矩形，追加本轮 P50/P95。
- Percentiles use the latest 500 approximately one-second effective output windows, not per-token latency. / 分位数取最近 500 个约 1 秒有效输出窗，不是逐 Token 延迟。
- Click for separate actual server usage and response timing. / 点击查看单独统计的服务端真实用量与响应时长。
- Turns and supported completed tool steps are deduplicated per chat. Initial usage/cache/context stays pending until recorded. / 轮步按当前聊天去重；首次用量、缓存和上下文等记录到达后才展示。

Remote-host historical logs and detached chat windows are not supported. Page reload loses earlier live samples. The binding uses runtime DOM/React properties and may need adjustment after Codex updates. See README for exact metrics and test coverage.

暂不支持远端历史日志与分离聊天窗口；重载页面会丢失先前的实时采样。绑定依赖运行时 DOM/React 属性，Codex 更新后可能需要调整。完整统计口径和测试方式见 README。

## Disable and components / 停用与组件

Quit ChatGPT/Codex, then launch its original app to run without injection. Chat history is retained. Logs are at `~/Library/Logs/Codex fork/launcher.log`; redact private information before sharing them.

完全退出 ChatGPT/Codex，再从原应用启动即可停用注入，聊天记录保留。日志位于上述路径，分享前请移除隐私信息。

The bundle contains no npm, developer headers, other tokenizer dictionaries, account configuration or chat records. Complete component licenses are in `Contents/Resources/node/LICENSE` and `Contents/Resources/vendor/tiktoken/LICENSE`. The upstream project has not selected a software license; bundling third-party licenses does not assign one to Runstrip.

包内不含 npm、开发头文件、其他词表、账号配置或聊天记录。依赖的完整许可证在上述两个路径；原项目尚未选择软件许可证，附带第三方许可证并不代表为 Runstrip 指定许可证。
