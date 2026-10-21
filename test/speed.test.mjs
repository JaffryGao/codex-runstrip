import { test } from 'node:test';
import assert from 'node:assert/strict';
import speed from '../src/speed.js';
const { UsageMetrics, SpeedTracker, percentile, acceptsStats } = speed;
// Timing tests use a deterministic one-character-per-token vocabulary.
const unitTracker = () => new SpeedTracker({ countTokens: text => text.length });
const context = { hostId: 'local', threadId: 'chat-a' };
const base = 1_790_000_000_000;
const record = (type, payload, ms) => ({ type, payload, timestamp: new Date(base + ms).toISOString() });
const begin = (m, turn = 'turn-a', model = 'model-a', time = 0) => m.consume(record('turn_context', { turn_id: turn, model }, time));
const item = (m, start, end, { turn = 'turn-a', type = 'Reasoning', id = 'item-a', fields = {} } = {}) => m.consume(record('event_msg', {
  type: 'item_completed', thread_id: 'chat-a', turn_id: turn, started_at_ms: base + start, completed_at_ms: base + end,
  item: { id, type, ...fields },
}, end));
const usage = (m, end, { turn = 'turn-a', id = 'resp-a', output = 100, reasoning = 50, thread = 'chat-a' } = {}) => m.consume(record('token_usage_record', {
  thread_id: thread, turn_id: turn, response_id: id, usage: { output_tokens: output, reasoning_output_tokens: reasoning },
}, end));
function sample(m, { turn = 'turn-a', model = 'model-a', start = 1000, end = 2000, id = 'resp-a', output = 100 } = {}) {
  begin(m, turn, model, start - 1);
  item(m, start, end - 10, { turn, id });
  usage(m, end, { turn, id, output });
}
const event = (method, params, scope = context) => ({ type: 'mcp-notification', hostId: scope.hostId, method, params: { threadId: scope.threadId, turnId: 'turn-a', ...params } });

test('nearest-rank percentiles ignore non-finite values and handle one sample', () => {
  assert.equal(percentile([], .5), null);
  assert.equal(percentile([53], .95), 53);
  assert.equal(percentile([40, 10, 30, 20, NaN, Infinity], .5), 20);
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), .95), 95);
});
test('real usage includes hidden reasoning once; multiple items form one response', () => {
  const m = new UsageMetrics('chat-a');
  begin(m);
  item(m, 1000, 20378);
  item(m, 20386, 39762, { id: 'r2' });
  item(m, 39765, 82888, { id: 'message', type: 'AgentMessage' });
  usage(m, 83076, { output: 1982, reasoning: 940 });
  const s = m.snapshot();
  assert.equal(s.count, 1);
  assert.equal(s.last.outputTokens, 1982);
  assert.equal(s.last.reasoningOutputTokens, 940);
  assert.equal(s.last.durationMs, 82076);
  assert.ok(Math.abs(s.tps - 1982 / 82.076) < 1e-10);
  assert.equal(s.p50, s.tps);
  assert.equal(s.p95, s.tps);
  assert.equal(s.source, 'usage.output_tokens');
  assert.equal(s.liveAvailable, false);
});
test('output text and summary contents are never read to determine token count', () => {
  const m = new UsageMetrics('chat-a');
  begin(m);
  const secret = { id: 'r', type: 'Reasoning' };
  Object.defineProperty(secret, 'summary', { get() { throw new Error('must not read text'); } });
  Object.defineProperty(secret, 'content', { get() { throw new Error('must not read text'); } });
  m.consume(record('event_msg', { type: 'item_completed', turn_id: 'turn-a', item: secret, started_at_ms: base + 1000, completed_at_ms: base + 1990 }, 1990));
  usage(m, 2000, { output: 17 });
  assert.equal(m.snapshot().tps, 17);
});
test('each response gets its own window; time spent between responses is excluded', () => {
  const m = new UsageMetrics('chat-a');
  sample(m);
  item(m, 2000, 90000, { type: 'CommandExecution' });
  item(m, 100000, 101990, { id: 'r2' });
  usage(m, 102000, { id: 'resp-b', output: 100 });
  const s = m.snapshot();
  assert.equal(s.count, 2);
  assert.equal(s.tps, 50);
  assert.equal(s.p50, 50);
  assert.equal(s.p95, 100);
  assert.equal(s.mean, 200000 / 3000);
});
test('tail processing inside the measured window stays explicit instead of claiming pure decode time', () => {
  const m = new UsageMetrics('chat-a');
  begin(m);
  item(m, 1000, 1990);
  item(m, 1990, 10000, { type: 'CommandExecution' });
  usage(m, 11000, { output: 100 });
  assert.equal(m.snapshot().tps, 10);
  assert.equal(m.snapshot().durationKind, 'output-item-to-usage');
});
test('pure tool response with no model start preserves actual tokens but omits speed', () => {
  const m = new UsageMetrics('chat-a');
  begin(m);
  item(m, 1000, 2000, { type: 'CommandExecution' });
  usage(m, 2100, { output: 111, reasoning: 0 });
  const s = m.snapshot();
  assert.equal(s.count, 0);
  assert.equal(s.tps, null);
  assert.equal(s.last.outputTokens, 111);
  assert.equal(s.last.reason, 'missing_start');
});
test('duplicate usage and mirrored token_count never double count or erase next pending response', () => {
  const m = new UsageMetrics('chat-a');
  sample(m);
  item(m, 3000, 3990, { id: 'r2' });
  usage(m, 2000);
  m.consume(record('event_msg', { type: 'token_count', info: { last_token_usage: { output_tokens: 100 } } }, 2050));
  usage(m, 4000, { id: 'resp-b', output: 200 });
  assert.equal(m.snapshot().count, 2);
  assert.equal(m.snapshot().tps, 200);
});
test('models are separate; switching back restores only that model history', () => {
  const m = new UsageMetrics('chat-a');
  sample(m);
  sample(m, { turn: 'turn-b', model: 'model-b', start: 3000, end: 4000, id: 'b', output: 20 });
  assert.equal(m.snapshot().p50, 20);
  sample(m, { turn: 'turn-c', start: 5000, end: 6000, id: 'c', output: 80 });
  assert.equal(m.snapshot().count, 2);
  assert.equal(m.snapshot().p50, 80);
  assert.equal(m.snapshot().p95, 100);
  begin(m, 'turn-a', 'incorrect-old-model', 100);
  assert.equal(m.snapshot().model, 'model-a');
});
test('missing model, response ID, invalid counts, short duration are not estimated', () => {
  for (const modify of [
    m => { m.model = 'unknown'; },
    m => {},
  ]) {
    const m = new UsageMetrics('chat-a');
    begin(m); item(m, 1000, 1990); modify(m);
    usage(m, 2000, { output: null });
    assert.equal(m.snapshot().count, 0);
  }
  for (const output of [NaN, Infinity, -1, 0, '200', 1.5]) {
    const m = new UsageMetrics('chat-a');
    begin(m); item(m, 1000, 1990); usage(m, 2000, { output });
    assert.equal(m.snapshot().count, 0);
  }
  const m = new UsageMetrics('chat-a');
  begin(m); item(m, 1000, 1005); usage(m, 1006);
  assert.equal(m.snapshot().last.reason, 'invalid_time');
  const n = new UsageMetrics('chat-a');
  begin(n); item(n, 1000, 1990); usage(n, 2000, { id: null });
  assert.equal(n.snapshot().last.reason, 'missing_response');
});
test('missing or backward timestamps cannot use wall clock / text as fallback', () => {
  for (const fields of [
    { started_at_ms: null, completed_at_ms: base + 1990 },
    { started_at_ms: base + 1990, completed_at_ms: base + 1000 },
    { started_at_ms: base + 1000, completed_at_ms: base + 5000 },
  ]) {
    const m = new UsageMetrics('chat-a');
    begin(m);
    m.consume(record('event_msg', { type: 'item_completed', turn_id: 'turn-a', item: { id: 'r', type: 'Reasoning' }, ...fields }, 2000));
    usage(m, 2100);
    assert.equal(m.snapshot().count, 0);
    assert.equal(m.snapshot().tps, null);
  }
  const m = new UsageMetrics('chat-a');
  sample(m);
  item(m, 1500, 3000, { id: 'overlap' });
  usage(m, 3100, { id: 'b' });
  assert.equal(m.snapshot().count, 1);
  assert.equal(m.snapshot().last.reason, 'invalid_time');
});
test('cross-turn model items and another thread usage do not become a valid sample', () => {
  const m = new UsageMetrics('chat-a');
  begin(m); item(m, 1000, 1990, { turn: 'other-turn' }); usage(m, 2000);
  assert.equal(m.snapshot().count, 0);
  item(m, 3000, 3990); usage(m, 4000, { id: 'other-thread', thread: 'chat-b' });
  assert.equal(m.snapshot().count, 0);
  usage(m, 4000, { id: 'valid' });
  assert.equal(m.snapshot().count, 1);
});
for (const kind of ['turn_aborted', 'context_compacted', 'error']) {
  test(`ambiguous ${kind} window never enters percentiles`, () => {
    const m = new UsageMetrics('chat-a');
    begin(m); item(m, 1000, 1990);
    m.consume(record('event_msg', { type: kind, turn_id: 'turn-a' }, 2000));
    item(m, 2100, 2990);
    usage(m, 3000);
    assert.equal(m.snapshot().count, 0);
    assert.equal(m.snapshot().tps, null);
  });
}
test('model changes within one response are excluded', () => {
  const m = new UsageMetrics('chat-a');
  begin(m); item(m, 1000, 1990);
  begin(m, 'turn-a', 'model-b', 2000); usage(m, 2100);
  assert.equal(m.snapshot().count, 0);
  assert.equal(m.snapshot().last.reason, 'model_changed');
});
test('native ContextCompaction item invalidates a pending model window', () => {
  const m = new UsageMetrics('chat-a');
  begin(m); item(m, 1000, 1990);
  item(m, 2000, 4000, { type: 'ContextCompaction' });
  usage(m, 4100);
  assert.equal(m.snapshot().count, 0);
  assert.equal(m.snapshot().last.reason, 'compacted');
});
test('valid response history is capped at 500; means are weighted by duration', () => {
  const m = new UsageMetrics('chat-a');
  for (let i = 0; i < 600; i++) sample(m, { start: i * 2000 + 1, end: i * 2000 + 1001, id: `response-${i}`, output: i + 1 });
  const s = m.snapshot();
  assert.equal(s.count, 500);
  assert.equal(s.p50, 350);
  assert.equal(s.p95, 575);
  assert.equal(s.history.length, 12);
  assert.equal(s.history.at(-1), 600);
});
test('live estimates update on output and freeze without output; never enter actual percentiles', () => {
  const m = new UsageMetrics('chat-a'); sample(m);
  const t = unitTracker(); t.update(context, m.snapshot());
  t.ingest(event('item/started', { item: { id: 'live', type: 'agentMessage' } }), 0, base + 3000);
  assert.equal(t.snapshot(context, 0).flowing, false);
  t.ingest(event('item/agentMessage/delta', { itemId: 'live', delta: 'x'.repeat(40) }), 100, base + 3100);
  assert.equal(t.snapshot(context, 100).tps, null);
  t.ingest(event('item/agentMessage/delta', { itemId: 'live', delta: 'x'.repeat(120) }), 1100, base + 4100);
  const live = t.snapshot(context, 1100);
  assert.equal(live.tps, 120); // 首块没有对应的生成时长，只作为窗口基线。
  assert.equal(live.estimatedTokens, 160);
  assert.equal(live.estimated, true);
  assert.equal(live.partial, false);
  assert.equal(live.settled, false);
  assert.equal(live.count, 1);
  assert.equal(live.p50, 100);
  assert.equal(live.p95, 100);
  assert.equal(live.flowing, true);
  const paused = t.snapshot(context, 50000);
  assert.equal(paused.flowing, false);
  assert.equal(paused.tps, live.tps);
  assert.equal(paused.pulse, live.pulse);
  assert.equal(paused.streaming, true);
  assert.equal(live.liveAvailable, false);
});
test('host, thread and independent window trackers remain isolated', () => {
  const t = unitTracker();
  t.ingest(event('item/reasoning/textDelta', { itemId: 'r', delta: 'x'.repeat(40) }), 0, base);
  t.ingest(event('item/reasoning/textDelta', { itemId: 'r', delta: 'x'.repeat(160) }), 1000, base + 1000);
  assert.equal(t.snapshot(context).tps, 160);
  assert.equal(t.snapshot(context).count, 0);
  assert.equal(t.snapshot({ ...context, hostId: 'remote' }).tps, null);
  assert.equal(t.snapshot({ ...context, threadId: 'other' }).tps, null);
  const otherWindow = unitTracker();
  assert.equal(otherWindow.snapshot(context).tps, null);
  assert.equal(t.snapshot(null).phase, 'unavailable');
});
test('late null and populated stats replies are rejected after selecting a different chat or host', () => {
  const b = { ...context, threadId: 'chat-b' };
  const remote = { ...context, hostId: 'remote' };
  assert.equal(acceptsStats(null, context, b), false);
  assert.equal(acceptsStats({ ...context }, context, b), false);
  assert.equal(acceptsStats(null, context, remote), false);
  assert.equal(acceptsStats(context, remote, remote), false);
  assert.equal(acceptsStats(null, null, context), false);
  assert.equal(acceptsStats(null, context, context), true);
  assert.equal(acceptsStats({ ...b }, b, b), true);
  assert.equal(acceptsStats(null, null, null), true);
});
test('reasoning summary/content are alternatives, and full completed snapshots do not add tokens', () => {
  const t = unitTracker();
  const delta = (method, text, now) => t.ingest(event(method, { itemId: 'r', delta: text }), now, base + now);
  delta('item/reasoning/textDelta', 'x'.repeat(400), 0);
  delta('item/reasoning/summaryTextDelta', 'x'.repeat(80), 1000);
  delta('item/reasoning/textDelta', 'x'.repeat(400), 1100);
  delta('item/reasoning/summaryTextDelta', 'x'.repeat(80), 2000);
  assert.equal(t.snapshot(context, 2000).estimatedTokens, 160);
  assert.equal(t.snapshot(context, 2000).tps, 80);
  assert.equal(t.snapshot(context).partial, true);
  const completed = { id: 'r', type: 'reasoning' };
  Object.defineProperty(completed, 'summary', { get() { throw new Error('must not read completed body'); } });
  t.ingest(event('item/completed', { item: completed }));
  assert.equal(t.snapshot(context).estimatedTokens, 160);
  assert.equal(t.snapshot(context).streaming, false);
  assert.equal(t.snapshot(context).count, 0);
});
test('late and matching usage remain separate from the observed streaming rate', () => {
  const m = new UsageMetrics('chat-a'); sample(m);
  const t = unitTracker(); t.update(context, m.snapshot());
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: 'a'.repeat(80) }), 0, base + 3000);
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: 'a'.repeat(120) }), 1000, base + 4000);
  t.update(context, m.snapshot());
  assert.equal(t.snapshot(context).estimated, true);
  assert.equal(t.snapshot(context).tps, 120);
  item(m, 3000, 4990, { id: 'm', type: 'AgentMessage' });
  usage(m, 5000, { id: 'new', output: 120 });
  t.update(context, m.snapshot());
  assert.equal(t.snapshot(context).estimated, true);
  assert.equal(t.snapshot(context).tps, 120);
  assert.equal(t.snapshot(context).actual.tps, 60);
  assert.equal(t.snapshot(context).p50, 60);
  assert.equal(t.snapshot(context).p95, 100);
});
test('tool execution and usage boundaries stop the bar; next response gets a fresh live window', () => {
  const t = unitTracker();
  const delta = (id, chars, now) => t.ingest(event('item/agentMessage/delta', { itemId: id, delta: 'x'.repeat(chars) }), now, base + now);
  delta('m1', 80, 0); delta('m1', 80, 1000);
  t.ingest(event('item/completed', { item: { id: 'm1', type: 'agentMessage' } }));
  t.ingest(event('thread/tokenUsage/updated', { tokenUsage: { total: { outputTokens: 60 } } }));
  delta('m2', 40, 20000);
  assert.equal(t.snapshot(context).estimatedTokens, 40);
  assert.equal(t.snapshot(context).tps, 80); // 新段预热时保留前一输出窗，不跳为假 0。
  // 重复/迟到 usage 不截断活动中的 m2。
  t.ingest(event('thread/tokenUsage/updated', { tokenUsage: { total: { outputTokens: 60 } } }));
  delta('m2', 40, 21000);
  assert.equal(t.snapshot(context).tps, 40);
  t.ingest(event('item/started', { item: { id: 'tool', type: 'mcpToolCall' } }));
  assert.equal(t.snapshot(context).streaming, false);
  assert.equal(t.snapshot(context).flowing, false);
  delta('m3', 40, 40000);
  assert.equal(t.snapshot(context).estimatedTokens, 40);
});
test('tool output, empty deltas and thought item starts do not animate or invent live usage', () => {
  const t = unitTracker();
  t.ingest(event('item/started', { item: { id: 'r', type: 'reasoning' } }));
  t.ingest(event('item/reasoning/textDelta', { itemId: 'r', delta: '' }));
  t.ingest(event('item/commandExecution/outputDelta', { itemId: 'tool', delta: 'x'.repeat(10000) }));
  assert.equal(t.snapshot(context).tps, null);
  assert.equal(t.snapshot(context).streaming, false);
  assert.equal(t.snapshot(context).flowing, false);
  assert.equal(t.snapshot(context).phase, 'thinking');
});
test('native lifecycle turn.id ends activity; late deltas and duplicate starts do not reopen it', () => {
  const t = unitTracker();
  t.ingest(event('turn/started', { turnId: undefined, turn: { id: 'turn-a', status: 'inProgress' } }));
  t.ingest(event('item/reasoning/textDelta', { itemId: 'r', delta: '1234' }));
  t.ingest(event('turn/started', {}));
  assert.equal(t.snapshot(context).phase, 'streaming');
  t.ingest(event('turn/completed', { turnId: undefined, turn: { id: 'turn-a', status: 'completed' } }));
  t.ingest(event('item/reasoning/textDelta', { itemId: 'r', delta: '1234' }));
  assert.equal(t.snapshot(context).phase, 'complete');
  assert.equal(t.snapshot(context).streaming, false);
  t.ingest(event('turn/started', { turnId: 'turn-b' }));
  t.ingest(event('item/started', { turnId: 'turn-b', item: { id: 'tool', type: 'mcpToolCall' } }));
  assert.equal(t.snapshot(context).phase, 'tool');
  t.ingest(event('turn/completed', { turnId: undefined, turn: { id: 'turn-b', status: 'interrupted' } }));
  assert.equal(t.snapshot(context).phase, 'interrupted');
});
test('restored log metrics survive page reconstruction; stale log cannot override native streaming', () => {
  const m = new UsageMetrics('chat-a'); sample(m);
  const t = unitTracker(); t.update(context, m.snapshot());
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: '1234' }));
  t.update(context, m.snapshot());
  assert.equal(t.snapshot(context).phase, 'streaming');
  const t2 = unitTracker(); t2.update(context, m.snapshot());
  assert.equal(t2.snapshot(context).p95, 100);
  m.consume(record('event_msg', { type: 'task_complete', turn_id: 'turn-a' }, 2100));
  t.update(context, m.snapshot());
  assert.equal(t.snapshot(context).phase, 'complete');
});
test('new native turn does not show the previous turn model before fresh metadata arrives', () => {
  const m = new UsageMetrics('chat-a'); sample(m);
  const t = unitTracker(); t.update(context, m.snapshot());
  t.ingest(event('turn/started', { turnId: 'turn-b' }));
  assert.equal(t.snapshot(context).tps, null);
  assert.equal(t.snapshot(context).model, 'unknown');
  sample(m, { turn: 'turn-b', model: 'model-b', id: 'b', start: 3000, end: 4000, output: 20 });
  t.update(context, m.snapshot());
  assert.equal(t.snapshot(context).model, 'model-b');
  assert.equal(t.snapshot(context).tps, null);
  assert.equal(t.snapshot(context).actual.tps, 20);
});
test('completed historical turn stays complete when late native deltas arrive', () => {
  const m = new UsageMetrics('chat-a'); sample(m);
  m.consume(record('event_msg', { type: 'task_complete', turn_id: 'turn-a' }, 2100));
  const t = unitTracker(); t.update(context, m.snapshot());
  t.ingest(event('item/agentMessage/delta', { itemId: 'late', delta: 'late text' }));
  assert.equal(t.snapshot(context).phase, 'complete');
});

test('without a tokenizer live speed is unavailable, never a character estimate', () => {
  const t = new SpeedTracker();
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: '测'.repeat(200) }), 0, base);
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: '测'.repeat(200) }), 1000, base + 1000);
  const s = t.snapshot(context, 1000);
  assert.equal(s.estimatedTokens, null);
  assert.equal(s.tps, null);
  assert.equal(s.tokenizerAvailable, false);
});

test('tokenization uses joined stream contents and only runs after new output', () => {
  const received = [];
  const t = new SpeedTracker({ countTokens(text) { received.push(text); return text === 'hello' ? 1 : 2; } });
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: 'hel' }), 0, base);
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: 'lo' }), 1000, base + 1000);
  assert.equal(t.snapshot(context, 1000).estimatedTokens, 1);
  t.snapshot(context, 10000);
  assert.deepEqual(received, ['hel', 'hello']);
  t.ingest(event('turn/completed', {}));
  assert.equal(t.snapshot(context).estimatedTokens, 1);
  assert.equal(t.thread(context).live.items.size, 0);
});

test('tokenizer errors and excessive stream size fail closed and release text', () => {
  for (const countTokens of [() => { throw new Error('unavailable'); }, () => NaN, () => -1]) {
    const t = new SpeedTracker({ countTokens });
    t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: 'test' }), 0, base);
    assert.equal(t.snapshot(context).tps, null);
    assert.equal(t.snapshot(context).tokenizerAvailable, false);
    assert.equal(t.thread(context).live.items.size, 0);
  }
  const t = unitTracker();
  t.ingest(event('item/agentMessage/delta', { itemId: 'm', delta: 'x'.repeat(262145) }), 0, base);
  assert.equal(t.snapshot(context).estimatedTokens, null);
  assert.equal(t.snapshot(context).tokenizerAvailable, false);
  assert.equal(t.thread(context).live.items.size, 0);
});
