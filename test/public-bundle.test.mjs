import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = process.env.RUNSTRIP_PUBLIC_TEST_APP;
const options = { skip: !app };
const source = fileURLToPath(new URL('../src/', import.meta.url));
const packageScript = fileURLToPath(new URL('../package-release.sh', import.meta.url));
const plistValue = key => execFileSync('/usr/libexec/PlistBuddy',
  ['-c', `Print :${key}`, join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();

test('public app keeps Lite behavior without the Lite name or bundled Node.js', options, () => {
  assert.equal(basename(app), 'Codex Runstrip.app');
  for (const key of ['CFBundleName', 'CFBundleDisplayName', 'CFBundleExecutable']) {
    assert.equal(plistValue(key), 'Codex Runstrip');
  }
  assert.equal(plistValue('CodexRunstripEdition'), 'lite');
  const sourceVersion = execFileSync('/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleShortVersionString', join(source, 'Info.plist')], { encoding: 'utf8' }).trim();
  assert.equal(plistValue('CFBundleShortVersionString'), sourceVersion);
  assert.equal(plistValue('CFBundleVersion'), sourceVersion);
  const resources = join(app, 'Contents/Resources');
  assert.equal(existsSync(join(resources, 'node')), false);
  const executable = join(app, 'Contents/MacOS/Codex Runstrip');
  accessSync(executable, constants.X_OK);
  assert.deepEqual(readFileSync(executable), readFileSync(join(source, 'launcher.sh')));
  for (const name of ['binding.js', 'speed.js', 'stats.mjs', 'inject.js', 'run.mjs',
    'tokenizer.mjs', 'check-update.mjs', 'injector-process.mjs']) {
    assert.deepEqual(readFileSync(join(resources, name)), readFileSync(join(source, name)), name);
  }
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
});

test('public app uses its bundled BPE with the separately installed Node.js', options, () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import vm from 'node:vm';
    import { resolve } from 'node:path';
    import { createTokenizerScript } from './tokenizer.mjs';
    const adapter = createTokenizerScript([resolve('vendor/tiktoken')]);
    assert.equal(adapter.available, true);
    const runtime = { TextDecoder, TextEncoder, WebAssembly, atob };
    vm.runInNewContext(adapter.script, runtime);
    assert.equal(runtime.__RunstripTokenizer.count('hello world'), 2);
    assert.equal(runtime.__RunstripTokenizer.count('你好，世界！'), 4);
    console.log('public-bpe-ok');
  `], { cwd: join(app, 'Contents/Resources'), encoding: 'utf8' });
  assert.equal(result.trim(), 'public-bpe-ok');
});

test('public packaging rejects removed editions before touching output', () => {
  for (const edition of ['full', 'all', 'standalone']) {
    const result = spawnSync('/bin/bash', [packageScript, edition], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /公开发行仅保留一个轻量包/);
  }
});
