import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = process.env.RUNSTRIP_TEST_APP;
const source = fileURLToPath(new URL('../src/', import.meta.url));
const options = { skip: !app };

test('standalone keeps current UI and metrics, and vendors only the required tokenizer files', options, () => {
  const resources = join(app, 'Contents/Resources');
  const executable = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  accessSync(join(app, 'Contents/MacOS', executable), constants.X_OK);
  assert.deepEqual(readFileSync(join(app, 'Contents/MacOS', executable)), readFileSync(join(source, 'launcher.sh')));
  for (const name of ['binding.js', 'speed.js', 'stats.mjs', 'inject.js', 'run.mjs', 'tokenizer.mjs']) {
    assert.deepEqual(readFileSync(join(resources, name)), readFileSync(join(source, name)), name);
  }
  const vendor = join(resources, 'vendor/tiktoken');
  const files = readdirSync(vendor, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
    .map(e => join(e.parentPath, e.name).slice(vendor.length + 1)).sort();
  assert.deepEqual(files, ['LICENSE', 'encoders/o200k_base.json', 'lite/tiktoken_bg.cjs', 'lite/tiktoken_bg.wasm', 'package.json']);
  assert.ok(readFileSync(join(vendor, 'LICENSE'), 'utf8').includes('Permission is hereby granted'));
  assert.ok(readFileSync(join(resources, 'node/LICENSE'), 'utf8').includes('Node.js'));
  assert.deepEqual(readdirSync(join(resources, 'node/bin')), ['node']);
});

test('bundled runtime has only macOS system library dependencies and a matching minimum OS', options, () => {
  const node = join(app, 'Contents/Resources/node/bin/node');
  assert.ok(Number(execFileSync(node, ['-p', 'process.versions.node.split(".")[0]'], { encoding: 'utf8' }).trim()) >= 22);
  const libraries = execFileSync('/usr/bin/otool', ['-L', node], { encoding: 'utf8' }).trim().split('\n').slice(1);
  assert.ok(libraries.length > 0);
  for (const library of libraries) assert.match(library.trim(), /^\/(System\/Library|usr\/lib)\//);
  const minimum = execFileSync('/usr/bin/xcrun', ['vtool', '-show-build', node], { encoding: 'utf8' }).match(/\bminos\s+(\S+)/)?.[1];
  assert.ok(minimum);
  assert.equal(execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim(), minimum);
});

test('bundle tokenizes with Homebrew and usr/local reads denied and an empty environment', options, () => {
  const resources = join(app, 'Contents/Resources');
  const node = join(resources, 'node/bin/node');
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import vm from 'node:vm';
    import { createTokenizerScript } from './tokenizer.mjs';
    assert.throws(() => readFileSync('/opt/homebrew/bin/node'));
    const adapter = createTokenizerScript();
    assert.equal(adapter.available, true);
    const runtime = { TextDecoder, TextEncoder, WebAssembly, atob };
    vm.runInNewContext(adapter.script, runtime);
    assert.equal(runtime.__RunstripTokenizer.count('hello world'), 2);
    assert.equal(runtime.__RunstripTokenizer.count('你好，世界！'), 4);
    assert.equal(runtime.__RunstripTokenizer.count('测'.repeat(200)), 200);
    assert.equal(typeof WebSocket, 'function');
    assert.equal(typeof fetch, 'function');
    console.log('standalone-bpe-ok');
  `;
  const result = execFileSync('/usr/bin/sandbox-exec', ['-p',
    '(version 1)(allow default)(deny file-read* (subpath "/opt/homebrew") (subpath "/usr/local"))',
    '/usr/bin/env', '-i', 'PATH=/usr/bin:/bin', node, '--input-type=module', '-e', script],
  { cwd: resources, encoding: 'utf8' });
  assert.equal(result.trim(), 'standalone-bpe-ok');
});

test('standalone app and bundled node signatures validate', options, () => {
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', join(app, 'Contents/Resources/node/bin/node')]);
});
