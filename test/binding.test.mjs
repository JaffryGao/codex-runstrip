import { test } from 'node:test';
import assert from 'node:assert/strict';
import binding from '../src/binding.js';
import speed from '../src/speed.js';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const scope = (threadId = A, hostId = 'local') => ({ hostId, threadId });
const element = (attributes = {}, inactive = false) => ({
  getAttribute: name => attributes[name] ?? null,
  closest: () => inactive ? {} : null,
});
const row = (id = A, hostId = 'local') => element({
  'data-app-action-sidebar-thread-id': `local:${id}`,
  'data-app-action-sidebar-thread-host-id': hostId,
  'data-app-action-sidebar-thread-kind': 'local',
});
const marker = (id = A, hostId = 'local', inactive = false) => {
  const node = element({ 'data-above-composer-conversation-id': id }, inactive);
  if (hostId) node.__reactFiber$test = { memoizedProps: {}, return: { memoizedProps: { conversationId: id, hostId } } };
  return node;
};
const page = ({ markers = [], rows = [], composer = true } = {}) => ({
  querySelectorAll: selector => ({
    '[data-above-composer-conversation-id]': markers,
    '[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-selected="true"]': rows,
    '[data-codex-composer-root]': composer ? [element()] : [],
  }[selector] || []),
});

test('new chat binds its real ID while the sidebar still holds client-new-thread alias', () => {
  const result = binding.resolve(page({ markers: [marker()], rows: [row('client-new-thread:temporary')] }));
  assert.deepEqual(result.selection, scope());
  assert.equal(result.source, 'composer-owner');
});

test('compact chat without a sidebar resolves its page owner including remote host', () => {
  assert.deepEqual(binding.resolve(page({ markers: [marker(A, 'remote')] })).selection, scope(A, 'remote'));
});

test('draft and pending IDs never bind to old sidebar chat or arbitrary native events', () => {
  const known = [scope(B)];
  for (const markers of [[], [marker('client-new-thread:temporary')]]) {
    const result = binding.resolve(page({ markers, rows: [row(B)] }), known);
    assert.equal(result.selection, null);
    assert.equal(result.reason, 'pending-chat');
  }
  assert.equal(binding.resolve(page({ rows: [row('client-new-thread:temporary')], composer: false })).selection, null);
});

test('events arriving before page ID remain available and only exact-ID events supply the host', () => {
  const tracker = new speed.SpeedTracker();
  tracker.snapshot(scope());
  assert.deepEqual(tracker.contexts(), []);
  tracker.ingest({ type: 'mcp-notification', hostId: 'remote', method: 'turn/started', params: { threadId: A, turnId: 'turn-a' } });
  tracker.ingest({ type: 'mcp-notification', hostId: 'local', method: 'turn/started', params: { threadId: B, turnId: 'turn-b' } });
  assert.equal(binding.resolve(page(), tracker.contexts()).selection, null);
  assert.deepEqual(binding.resolve(page({ markers: [marker(A, null)] }), tracker.contexts()).selection, scope(A, 'remote'));
  assert.equal(binding.resolve(page({ markers: [marker(A, null)] }), [scope(B)]).selection, null);
});

test('cached inactive pages and stale sidebar cannot override the active composer', () => {
  const document = page({ markers: [marker(A, 'local', true), marker(B, 'remote')], rows: [row(A)] });
  assert.deepEqual(binding.resolve(document, [scope(A)]).selection, scope(B, 'remote'));
});

test('multiple active chats or uncertain hosts are unavailable instead of guessed', () => {
  assert.equal(binding.resolve(page({ markers: [marker(A), marker(B)] })).selection, null);
  const result = binding.resolve(page({ markers: [marker(A, null)] }), [scope(A), scope(A, 'remote')]);
  assert.equal(result.selection, null);
  assert.equal(result.reason, 'ambiguous-host');
});

test('React alternate may supply the current ID, but contradictory hosts are rejected', () => {
  const node = marker(A);
  node.__reactFiber$test.alternate = { memoizedProps: { conversationId: B, hostId: 'remote' } };
  node.getAttribute = () => B;
  assert.deepEqual(binding.resolve(page({ markers: [node] })).selection, scope(B, 'remote'));
  node.__reactFiber$test.return.memoizedProps.conversationId = B;
  assert.equal(binding.resolve(page({ markers: [node] })).selection, null);
});

test('page host wins over an identically named thread on another host', () => {
  assert.deepEqual(binding.resolve(page({ markers: [marker(A, 'remote')], rows: [row(A)] }), [scope(A)]).selection, scope(A, 'remote'));
});

test('legacy sidebar fallback requires a real ID and no pending active composer', () => {
  assert.deepEqual(binding.resolve(page({ rows: [row(A)], composer: false })).selection, scope(A));
  assert.equal(binding.resolve(page({ rows: [row(A), row(B)], composer: false })).selection, null);
});
