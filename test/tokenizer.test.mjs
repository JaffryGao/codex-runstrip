import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTokenizerScript } from '../src/tokenizer.mjs';
import speed from '../src/speed.js';

test('missing or incompatible local tokenizer supplies no numeric fallback', () => {
  assert.equal(createTokenizerScript([]).available, false);
  const directory = mkdtempSync(join(tmpdir(), 'runstrip-tokenizer-'));
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'tiktoken', version: '0.0.0' }));
    const adapter = createTokenizerScript([directory]);
    const context = { __RunstripTokenizer: { count: () => 100 } };
    vm.runInNewContext(adapter.script, context);
    assert.equal(adapter.available, false);
    assert.equal(context.__RunstripTokenizer, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

const adapter = createTokenizerScript();
const runtime = { TextDecoder, TextEncoder, WebAssembly, atob };
if (adapter.available) vm.runInNewContext(adapter.script, runtime);
const tokenizer = runtime.__RunstripTokenizer;

test('existing o200k BPE handles Chinese, English and literal special-token text', { skip: !adapter.available }, () => {
  assert.ok(tokenizer);
  assert.equal(tokenizer.count('hello world'), 2);
  assert.equal(tokenizer.count('你好，世界！'), 4);
  assert.equal(tokenizer.count('测'.repeat(200)), 200);
  assert.doesNotThrow(() => tokenizer.count('<|endoftext|>'));
  assert.ok(tokenizer.count('🧪中文 English') > 0);
  vm.runInNewContext(adapter.script, runtime);
  assert.equal(runtime.__RunstripTokenizer, tokenizer);
});

test('real BPE stream count is invariant to delta boundaries and excludes pause time', { skip: !adapter.available }, () => {
  const scope = { hostId: 'local', threadId: 'test-chat' };
  const track = chunks => {
    const tracker = new speed.SpeedTracker({ countTokens: tokenizer.count });
    chunks.forEach((delta, i) => tracker.ingest({ type: 'mcp-notification', hostId: 'local',
      method: 'item/agentMessage/delta', params: { threadId: scope.threadId, turnId: 'turn', itemId: 'item', delta } },
    i * 1000 / (chunks.length - 1), 1700000000000 + i * 1000 / (chunks.length - 1)));
    const live = tracker.snapshot(scope, 1000);
    assert.equal(tracker.snapshot(scope, 10000).tps, live.tps);
    assert.equal(tracker.snapshot(scope, 10000).flowing, false);
    return live;
  };
  const text = '你好，世界！hello world 🧪'.repeat(20);
  const a = track([text.slice(0, 5), text.slice(5)]);
  const b = track(Array.from(text));
  assert.equal(a.estimatedTokens, tokenizer.count(text));
  assert.equal(b.estimatedTokens, a.estimatedTokens);
  // 首块在不同到达时间含有不同 Token；计数不受分块影响，速率需扣除各自首块基线。
  assert.equal(a.tps, tokenizer.count(text) - tokenizer.count(text.slice(0, 5)));
  assert.equal(b.tps, tokenizer.count(text) - tokenizer.count(Array.from(text)[0]));
  assert.equal(a.source, 'local-bpe/o200k_base');
});
