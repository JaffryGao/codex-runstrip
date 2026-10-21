<div align="center">

# Codex Runstrip

**A lightweight session status strip for the Codex desktop app**

See the current chat's turns, tool steps, Token usage, cache metrics, and approximate output speed below the composer.

[Latest release](https://github.com/JaffryGao/codex-runstrip/releases/latest) · [Changelog](CHANGELOG.md) · [简体中文](README.md)

</div>

## Preview

<img src="docs/images/runstrip-speed.png" alt="Codex Runstrip speed card with current Token rate, P50/P95, and server response data" width="100%">

> Screenshot from the Codex desktop client. Runstrip is an unofficial runtime overlay, not a built-in Codex feature.

<details>
<summary>View Token usage, cache, and turns cards</summary>

**Token usage**

<img src="docs/images/runstrip-usage.png" alt="Cumulative, input, and output Token usage for the current chat" width="100%">

**Cache**

<img src="docs/images/runstrip-cache.png" alt="Cache hit rate, cached input, and uncached input Token metrics" width="100%">

**Turns and steps**

<img src="docs/images/runstrip-turns.png" alt="Started turns and completed tool steps for the current chat" width="100%">

</details>

## Download and install

There is one public lightweight edition. The app is named `Codex Runstrip`; there is no separate Full/Lite product split and no `Lite` suffix.

| Chip | Download | Requirements |
| --- | --- | --- |
| Apple Silicon (M-series) | [`Codex-Runstrip-macos-arm64.zip`](https://github.com/JaffryGao/codex-runstrip/releases/latest) | macOS, ChatGPT desktop app with Codex, Node.js 22 or newer |

Only the Apple Silicon (`arm64`) package is currently published. There is no Intel package.

1. Install Node.js 22 or newer. The app supports the official macOS installer, Homebrew, and nvm in its default `~/.nvm` location.
2. Download the ZIP, extract it, and move `Codex Runstrip.app` to Applications.
3. Save your work and fully quit ChatGPT/Codex, then open Codex Runstrip. The launcher starts Codex with a loopback-only debugging port; it does not force-quit an already running Codex instance.
4. If macOS blocks the first launch, Control-click the app and choose **Open**, or follow the prompt in **System Settings → Privacy & Security**.

The app is ad-hoc signed and not notarized by Apple, so macOS may require a one-time manual confirmation. Do not run multiple Runstrip copies at the same time. The launcher log is stored at `~/Library/Logs/Codex fork/launcher.log`.

## Status cards

- **Turns and steps**: started task turns and completed tool-call steps for the current chat.
- **Token usage**: cumulative input and output Token counts from the current chat log.
- **Cache**: cache hit rate, cached input Tokens, and uncached input Tokens.
- **Speed**: a single-color animated waveform showing approximate Token/s for observable output. After the turn ends, the card shows streaming-sample P50/P95 values. Click a card to view details.

## Metric definitions and privacy

- Runstrip reads only the selected local chat's session log under `~/.codex/sessions`. It does not upload chat content and does not modify the Codex app bundle.
- It prefers the active composer's formal conversation ID and host. If the chat cannot be uniquely identified, metrics remain pending instead of being guessed. Late responses from a previous chat are discarded after switching chats.
- Turns are deduplicated by `task_started.turn_id`; tool steps are deduplicated by completed tool-item ID. Context occupancy is provided by Codex's built-in indicator and is not duplicated by Runstrip.
- Token totals and cache rates are aggregated from the current chat log. Before the first usage record arrives, the UI shows a pending state rather than treating unknown data as zero.
- Live speed uses local `tiktoken 1.0.22 / o200k_base` BPE counting over observable assistant and reasoning deltas. It is an approximate throughput measurement, not the server's exact decoding speed. Hidden reasoning, tool-result text, and periods without visible Token deltas cannot be measured.
- P50/P95 are throughput percentiles for at most 500 recent effective output windows of about one second in the current turn. They are not per-Token latency measurements. They appear only after the turn completes or is interrupted; tail windows shorter than one second are excluded.
- Server-settled output Tokens, including reasoning, plus response averages and historical percentiles are shown separately in the speed details. They do not replace the live local estimate. Reloading the page cannot restore previous live samples.
- The injector connects only to the local loopback debugging endpoint. It exits after Codex closes, and a new launch can take over a previously verified Runstrip injector.
- Remote-host history and detached chat windows are not supported. Codex updates may change its UI anchors and require a corresponding Runstrip update.

## Automatic update check

After startup, Runstrip silently checks GitHub for the latest stable Release. It prompts only when a newer Release exists and includes an installer for the current chip architecture. Confirming the prompt opens that Release page; Runstrip does not download or replace the app automatically. Network failures, no-update results, and cancellation remain silent.

## Build and test from source

On macOS with the ChatGPT desktop app installed, prepare Node.js 22 or newer, the `tiktoken 1.0.22` source package, and its license file, then run:

```bash
RUNSTRIP_TOKENIZER_SOURCE="$PWD/dependencies/tiktoken-1.0.22" \
RUNSTRIP_TOKENIZER_LICENSE="$PWD/dependencies/tiktoken-LICENSE" \
./package-release.sh
```

The default build creates one lightweight package without a `Lite` suffix. Set `RUNSTRIP_RELEASE_ROOT` to choose another output directory; existing builds are not overwritten. See [STANDALONE.md](STANDALONE.md) for the internal standalone validation build, which is not a public release option.

Run the test suite with:

```bash
RUNSTRIP_TOKENIZER_PATH="$PWD/dependencies/tiktoken-1.0.22" \
node --test test/*.test.mjs
```

For public-package validation, set `RUNSTRIP_PUBLIC_TEST_APP` to the built `.app`. The internal standalone validation package uses `RUNSTRIP_TEST_APP`; see [STANDALONE.md](STANDALONE.md). `test/preview.html` uses synthetic data for UI regression checks.

## Project notes

Codex Runstrip is an unofficial runtime UI injection project. It is not affiliated with or endorsed by OpenAI. The project has not selected a software license; third-party component licenses remain in effect.

Thanks to [@LospAgile](https://github.com/LospAgile) for the conversation binding, streaming BPE metrics, and regression tests contributed in [PR #2](https://github.com/JaffryGao/codex-runstrip/pull/2).
