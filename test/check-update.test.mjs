import test from 'node:test';
import assert from 'node:assert/strict';
import { checkForUpdate, compareVersions, packageAssetName } from '../src/check-update.mjs';

const release = (tag, asset) => ({
  ok: true,
  json: async () => ({ tag_name: tag, assets: [{ name: asset }] }),
});

test('compares numeric and prerelease versions semantically', () => {
  assert.equal(compareVersions('1.1', 'v1.1.0'), 0);
  assert.equal(compareVersions('1.1.9', 'v1.2.0'), -1);
  assert.equal(compareVersions('v2.0.0-beta.2', '2.0.0-beta.11'), -1);
  assert.equal(compareVersions('2.0.0-rc.1', '2.0.0'), -1);
  assert.equal(compareVersions('2.0.0', '2.0.0-rc.1'), 1);
  assert.equal(compareVersions('dev', '2.0.0'), null);
});

test('chooses the release asset matching the installed edition and architecture', () => {
  assert.equal(packageAssetName('lite', 'arm64'), 'Codex-Runstrip-macos-arm64.zip');
  assert.equal(packageAssetName('lite', 'x64'), 'Codex-Runstrip-macos-x86_64.zip');
  assert.equal(packageAssetName('standalone', 'arm64', 'v1.2.0'), null);
  assert.equal(packageAssetName('full', 'arm64'), null);
  assert.equal(packageAssetName('lite', 'invalid'), null);
  assert.equal(packageAssetName('unknown', 'arm64'), null);
});

test('prompts for a newer matching release and opens only after confirmation', async () => {
  let prompted = null;
  let opened = null;
  const result = await checkForUpdate({
    currentVersion: '1.1',
    edition: 'lite',
    arch: 'arm64',
    fetchRelease: async () => release('v1.2.0', 'Codex-Runstrip-macos-arm64.zip'),
    showPrompt: async value => { prompted = value; return true; },
    openRelease: async url => { opened = url; },
  });

  assert.equal(result, true);
  assert.equal(prompted.edition, 'lite');
  assert.equal(opened, 'https://github.com/JaffryGao/codex-runstrip/releases/tag/v1.2.0');
});

test('does not prompt for equal/older releases or a release without the matching package', async () => {
  let prompts = 0;
  const options = {
    currentVersion: '1.2.0',
    edition: 'lite',
    arch: 'arm64',
    showPrompt: async () => { prompts++; return true; },
  };
  assert.equal(await checkForUpdate({
    ...options,
    fetchRelease: async () => release('v1.2', 'Codex-Runstrip-macos-arm64.zip'),
  }), false);
  assert.equal(await checkForUpdate({
    ...options,
    fetchRelease: async () => release('v1.3.0', 'Codex-Runstrip-Lite-macos-arm64.zip'),
  }), false);
  assert.equal(prompts, 0);
});

test('silently ignores network errors and user dismissal', async () => {
  let prompts = 0;
  const base = {
    currentVersion: '1.1',
    edition: 'lite',
    arch: 'arm64',
    showPrompt: async () => { prompts++; return false; },
  };
  assert.equal(await checkForUpdate({ ...base, fetchRelease: async () => { throw new Error('offline'); } }), false);
  assert.equal(await checkForUpdate({
    ...base,
    fetchRelease: async () => release('v1.2.0', 'Codex-Runstrip-macos-arm64.zip'),
  }), false);
  assert.equal(prompts, 1);
});

test('invalid installed metadata never makes a network request', async () => {
  let requests = 0;
  const fetchRelease = async () => { requests++; throw new Error('must not fetch'); };
  for (const options of [
    { currentVersion: 'dev', edition: 'lite', arch: 'arm64' },
    { currentVersion: '1.1', edition: 'full', arch: 'arm64' },
    { currentVersion: '1.1', edition: 'unknown', arch: 'arm64' },
    { currentVersion: '1.1', edition: 'lite', arch: 'unknown' },
  ]) assert.equal(await checkForUpdate({ ...options, fetchRelease }), false);
  assert.equal(requests, 0);
});

test('API failures and draft/prerelease releases never prompt', async () => {
  let prompts = 0;
  for (const response of [
    { ok: false },
    { ok: true, json: async () => { throw new SyntaxError('bad response'); } },
    { ok: true, json: async () => null },
    { ok: true, json: async () => ({ tag_name: 'v2.0', draft: true, assets: [{ name: 'Codex-Runstrip-macos-arm64.zip' }] }) },
    { ok: true, json: async () => ({ tag_name: 'v2.0', prerelease: true, assets: [{ name: 'Codex-Runstrip-macos-arm64.zip' }] }) },
  ]) {
    assert.equal(await checkForUpdate({
      currentVersion: '1.1', edition: 'lite', arch: 'arm64',
      fetchRelease: async () => response,
      showPrompt: async () => { prompts++; return true; },
    }), false);
  }
  assert.equal(prompts, 0);
});

test('timeout, prompt errors and browser errors remain silent', async () => {
  const base = {
    currentVersion: '1.1', edition: 'lite', arch: 'arm64',
    fetchRelease: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return release('v1.2', 'Codex-Runstrip-macos-arm64.zip');
    },
  };
  assert.equal(await checkForUpdate({
    ...base, fetchRelease: async () => { throw new DOMException('timeout', 'TimeoutError'); },
  }), false);
  assert.equal(await checkForUpdate({
    ...base, showPrompt: async () => { throw new Error('dialog unavailable'); },
  }), false);
  assert.equal(await checkForUpdate({
    ...base, showPrompt: async () => true,
    openRelease: async () => { throw new Error('browser unavailable'); },
  }), false);
});
