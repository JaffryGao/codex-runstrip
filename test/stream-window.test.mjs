import { test } from 'node:test';
import assert from 'node:assert/strict';
import speed from '../src/speed.js';

const scope = { hostId: 'local', threadId: 'new-chat' };
const epoch = 1790000000000;
function fixture() {
  const tracker = new speed.SpeedTracker({ countTokens: text => text.length });
  const emit = (method, params, at) => tracker.ingest({ type: 'mcp-notification', hostId: scope.hostId,
    method, params: { threadId: scope.threadId, turnId: 'turn', ...params } }, at, epoch + at);
  const chunk = (tokens, at) => {
    emit('item/agentMessage/delta', { itemId: 'message', delta: 'x'.repeat(tokens) }, at);
    return tracker.snapshot(scope, at);
  };
  return { tracker, emit, chunk };
}

test('new chat warms up, then follows a two-second token window instead of lifetime average', () => {
  const { chunk } = fixture();
  assert.equal(chunk(200, 0).tps, null);
  assert.equal(chunk(10, 500).tps, null);
  assert.equal(chunk(10, 1000).tps, 20);
  chunk(20, 2000); chunk(20, 3000); chunk(80, 4000);
  assert.equal(chunk(80, 5000).tps, 80);
});

test('turn completion and delayed actual usage preserve the last observed rate and percentiles', () => {
  const { tracker, emit, chunk } = fixture();
  chunk(1, 0); chunk(20, 1000); chunk(40, 2000); const live = chunk(80, 3000);
  assert.equal(live.stream.p50, 40);
  assert.equal(live.stream.p95, 80);
  assert.equal(live.stream.count, 3);
  assert.equal(live.finished, false);
  emit('item/completed', { item: { id: 'message', type: 'agentMessage' } }, 3010);
  assert.equal(tracker.snapshot(scope, 3010).finished, false);
  emit('turn/completed', { turn: { id: 'turn', status: 'completed' } }, 3020);
  tracker.update(scope, { turnId: 'turn', phase: 'complete', tps: 28, p50: 28, p95: 28, count: 1,
    last: { turnId: 'turn', outputTokens: 1449, endedAt: epoch + 3030 } });
  const done = tracker.snapshot(scope, 5000);
  assert.equal(done.tps, live.tps);
  assert.equal(done.estimated, true);
  assert.equal(done.finished, true);
  assert.equal(done.flowing, false);
  assert.deepEqual(done.stream, live.stream);
  assert.equal(done.actual.tps, 28);
  assert.equal(tracker.thread(scope).live.items.size, 0);
  tracker.update(scope, { turnId: 'previous-turn', phase: 'complete', tps: 99, p50: 99, p95: 99, count: 1 });
  assert.equal(tracker.snapshot(scope).turnId, 'turn');
  assert.equal(tracker.snapshot(scope).tps, live.tps);
  assert.equal(tracker.snapshot(scope).actual.tps, 28);
});

test('silence freezes the meter; a long gap warms up again and does not sample tool waiting time', () => {
  const { tracker, chunk } = fixture();
  chunk(1, 0); chunk(30, 1000);
  const frozen = tracker.snapshot(scope, 10000);
  assert.equal(frozen.tps, 30);
  assert.equal(frozen.flowing, false);
  assert.equal(frozen.stream.count, 1);
  assert.equal(chunk(200, 11000).tps, 30);
  const resumed = chunk(60, 12000);
  assert.equal(resumed.tps, 60);
  assert.equal(resumed.stream.count, 2);
  assert.equal(resumed.stream.p50, 30);
  assert.equal(resumed.stream.p95, 60);
});

test('actual history never masquerades as an unobserved current stream; next turn resets samples', () => {
  const { tracker, emit, chunk } = fixture();
  tracker.update(scope, { turnId: 'old', phase: 'complete', tps: 99, p50: 99, p95: 99, count: 10 });
  assert.equal(tracker.snapshot(scope).tps, null);
  chunk(1, 0); chunk(40, 1000);
  emit('turn/started', { turnId: 'next' }, 2000);
  const next = tracker.snapshot(scope, 2000);
  assert.equal(next.tps, null);
  assert.equal(next.stream, null);
  assert.equal(next.actual, null);
  assert.equal(next.finished, false);
});

test('tool boundaries preserve turn samples, exclude tool time, and wait for turn completion', () => {
  const { tracker, emit, chunk } = fixture();
  chunk(1, 0); chunk(20, 1000);
  emit('item/started', { item: { id: 'tool', type: 'mcpToolCall' } }, 1100);
  assert.equal(tracker.snapshot(scope, 12000).finished, false);
  assert.equal(tracker.snapshot(scope, 12000).tps, 20);
  emit('item/agentMessage/delta', { itemId: 'next-message', delta: 'x' }, 20000);
  emit('item/agentMessage/delta', { itemId: 'next-message', delta: 'x'.repeat(60) }, 21000);
  const next = tracker.snapshot(scope, 21000);
  assert.equal(next.stream.tokens, 82);
  assert.equal(next.stream.count, 2);
  assert.equal(next.stream.p50, 20);
  assert.equal(next.stream.p95, 60);
  assert.equal(next.tps, 60);
});

test('sub-second responses do not invent percentiles; partial tails leave the last rate unchanged', () => {
  const { tracker, emit, chunk } = fixture();
  chunk(1, 0); chunk(20, 250); chunk(20, 500);
  emit('turn/completed', {}, 510);
  const short = tracker.snapshot(scope, 520);
  assert.equal(short.tps, null);
  assert.equal(short.stream.count, 0);
  assert.equal(short.finished, true);
  const other = fixture();
  other.chunk(1, 0); other.chunk(30, 1000);
  const live = other.chunk(10, 1500);
  other.emit('turn/completed', {}, 1501);
  const done = other.tracker.snapshot(scope, 3000);
  assert.equal(done.tps, live.tps);
  assert.equal(done.stream.count, 1);
});

test('sampling is independent of repeated renders and capped within the current turn', () => {
  const { tracker, chunk } = fixture();
  chunk(1, 0);
  for (let i = 1; i <= 600; i++) {
    chunk(i, i * 1000);
    for (let j = 1; j <= 5; j++) tracker.snapshot(scope, i * 1000 + j * 100);
  }
  const current = tracker.snapshot(scope, 600000);
  assert.equal(current.stream.count, 500);
  assert.equal(current.stream.p50, 350);
  assert.equal(current.stream.p95, 575);
});
