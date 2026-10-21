import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RolloutReader, SessionIndex } from '../src/stats.mjs';
const idA = '11111111-1111-1111-1111-111111111111';
const idB = '22222222-2222-2222-2222-222222222222';
const row = (type, payload) => JSON.stringify({ type, payload }) + '\n';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'runstrip-test-'));
  t.after(() => rmSync(dir, { recursive: true }));
  return dir;
}
const usage = (input = 100) => row('event_msg', { type: 'token_count', info: {
  total_token_usage: { input_tokens: input, cached_input_tokens: 25, output_tokens: 20 },
  last_token_usage: { input_tokens: 50 }, model_context_window: 1000,
} });
test('current selected chat wins over most recently written log; remote never reads local', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, '2026'));
  writeFileSync(join(dir, '2026', `rollout-${idA}.jsonl`), row('session_meta', { id: idA }) + usage(100));
  writeFileSync(join(dir, `rollout-${idB}.jsonl`), row('session_meta', { id: idB }) + usage(900));
  const index = new SessionIndex(dir);
  assert.equal(index.read({ hostId: 'local', threadId: idA }).input, 100);
  assert.equal(index.read({ hostId: 'local', threadId: idB }).input, 900);
  assert.equal(index.read({ hostId: 'remote', threadId: idA }), null);
  assert.equal(index.read(null), null);
});
test('incremental parser preserves partial lines and UTF-8; repeats do not inflate counts', t => {
  const path = join(fixture(t), 'rollout.jsonl');
  writeFileSync(path, row('session_meta', { id: idA }) + usage());
  const reader = new RolloutReader(path, idA);
  const first = reader.read();
  assert.equal(first.cache_rate, 25);
  assert.equal(first.context_used, 50);
  assert.equal(first.context_pct, 5);
  const context = Buffer.from(row('turn_context', { turn_id: 'turn-a', model: '模型' }));
  const split = context.indexOf(Buffer.from('模型')) + 1;
  appendFileSync(path, context.subarray(0, split));
  assert.equal(reader.read().model, null);
  appendFileSync(path, context.subarray(split));
  const turns = row('event_msg', { type: 'task_started', turn_id: 'turn-a' });
  const tool = row('event_msg', { type: 'item_completed', item: { type: 'McpToolCall', id: 'tool-a' } });
  appendFileSync(path, turns + tool + turns + tool);
  const result = reader.read();
  assert.equal(result.model, '模型');
  assert.equal(result.turnId, 'turn-a');
  assert.equal(result.turns, 1);
  assert.equal(result.steps, 1);
  assert.deepEqual(reader.read(), result);
});
test('truncated/replaced file resets prior usage and counters', t => {
  const path = join(fixture(t), 'rollout.jsonl');
  writeFileSync(path, row('session_meta', { id: idA }) + usage(9000) + row('event_msg', { type: 'task_started', turn_id: 'old' }));
  const reader = new RolloutReader(path, idA);
  assert.equal(reader.read().input, 9000);
  writeFileSync(path, usage(1));
  assert.equal(reader.read().input, 1);
  assert.equal(reader.read().turns, 0);
});
test('mismatched session and missing usage are unavailable', t => {
  const path = join(fixture(t), 'rollout.jsonl');
  writeFileSync(path, row('session_meta', { id: idB }) + usage());
  assert.equal(new RolloutReader(path, idA).read(), null);
  writeFileSync(path, row('session_meta', { id: idA }));
  assert.equal(new RolloutReader(path, idA).read(), null);
});
test('first-turn counters arrive before usage without inventing cache or context values', t => {
  const path = join(fixture(t), 'rollout.jsonl');
  const started = row('event_msg', { type: 'task_started', turn_id: 'first' });
  const tool = row('event_msg', { type: 'item_completed', item: { type: 'CommandExecution', id: 'command' } });
  writeFileSync(path, row('session_meta', { id: idA }) + started);
  const reader = new RolloutReader(path, idA);
  const initial = reader.read();
  assert.equal(initial.turns, 1);
  assert.equal(initial.steps, 0);
  for (const key of ['input', 'cached', 'output', 'total_tokens', 'cache_rate', 'context_used', 'context_pct']) {
    assert.equal(initial[key], null, key);
  }
  appendFileSync(path, started + tool + tool
    + row('event_msg', { type: 'item_started', item: { type: 'WebSearch', id: 'running' } })
    + row('event_msg', { type: 'item_completed', item: { type: 'Reasoning', id: 'thought' } })
    + row('event_msg', { type: 'item_completed', item: { type: 'AgentMessage', id: 'answer' } }));
  assert.equal(reader.read().turns, 1);
  assert.equal(reader.read().steps, 1);
  appendFileSync(path, usage() + row('event_msg', { type: 'task_started', turn_id: 'second' }));
  const settled = reader.read();
  assert.equal(settled.turns, 2);
  assert.equal(settled.steps, 1);
  assert.equal(settled.total_tokens, 120);
  assert.equal(settled.cache_rate, 25);
});
test('early counters remain isolated to the selected local session', t => {
  const dir = fixture(t);
  const started = row('event_msg', { type: 'task_started', turn_id: 'first' });
  writeFileSync(join(dir, `rollout-${idA}.jsonl`), row('session_meta', { id: idA }) + started);
  writeFileSync(join(dir, `rollout-${idB}.jsonl`), row('session_meta', { id: idB }) + started
    + row('event_msg', { type: 'task_started', turn_id: 'second' }));
  const index = new SessionIndex(dir);
  assert.equal(index.read({ hostId: 'local', threadId: idA }).turns, 1);
  assert.equal(index.read({ hostId: 'local', threadId: idB }).turns, 2);
  assert.equal(index.read({ hostId: 'remote', threadId: idA }), null);
  const mismatched = new RolloutReader(join(dir, `rollout-${idB}.jsonl`), idA);
  assert.equal(mismatched.read(), null);
  const unverified = join(dir, 'unknown.jsonl');
  writeFileSync(unverified, started);
  assert.equal(new RolloutReader(unverified, idA).read(), null);
});
test('missing last usage or window is unknown, not inferred from cumulative totals', t => {
  const path = join(fixture(t), 'rollout.jsonl');
  writeFileSync(path, row('token_usage_record', { thread_token_usage: { input_tokens: 900 } }));
  const stats = new RolloutReader(path, idA).read();
  assert.equal(stats.context_used, null);
  assert.equal(stats.context_pct, null);
  assert.equal(stats.total_tokens, 900);
});

test('bad complete log lines invalidate the pairing window; the next intact response can recover', t => {
  const path = join(fixture(t), 'rollout.jsonl');
  const base = 1790000000000;
  const rec = (type, payload, time) => JSON.stringify({ type, payload, timestamp: new Date(base + time).toISOString() }) + '\n';
  const context = rec('turn_context', { turn_id: 'turn-a', model: 'model-a' }, 0);
  const item = (start, end) => rec('event_msg', {
    type: 'item_completed', turn_id: 'turn-a', item: { type: 'Reasoning', id: String(start) },
    started_at_ms: base + start, completed_at_ms: base + end,
  }, end);
  const usage = (id, time) => rec('token_usage_record', {
    thread_id: idA, turn_id: 'turn-a', response_id: id, usage: { output_tokens: 100 },
    thread_token_usage: { input_tokens: 1000, output_tokens: 100 },
  }, time);
  writeFileSync(path, row('session_meta', { id: idA }) + context + item(1000, 1990) + '{broken}\n' + item(2000, 2990) + usage('a', 3000));
  const reader = new RolloutReader(path, idA);
  assert.equal(reader.read().speed.count, 0);
  assert.equal(reader.read().speed.last.reason, 'unreadable_record');
  appendFileSync(path, item(4000, 4990) + usage('b', 5000));
  const actual = reader.read();
  assert.equal(actual.speed.count, 1);
  assert.equal(actual.speed.tps, 100);
  assert.deepEqual(new RolloutReader(path, idA).read().speed, actual.speed);
  assert.deepEqual(reader.read().speed, actual.speed);
});
