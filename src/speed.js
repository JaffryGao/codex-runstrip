/* 流式片段只在内存中分词；结算后释放，历史统计只保留实际用量和时间。 */
((root) => {
  const CAP = 500;
  const finite = Number.isFinite;
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const percentile = (values, p) => {
    const sorted = values.filter(finite).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
  };
  const summary = samples => {
    const values = samples.map(s => s.tps);
    const tokens = samples.reduce((sum, s) => sum + s.outputTokens, 0);
    const ms = samples.reduce((sum, s) => sum + s.durationMs, 0);
    return {
      count: values.length, mean: ms > 0 ? tokens * 1000 / ms : null,
      p50: percentile(values, .5), p95: percentile(values, .95), history: values.slice(-12),
    };
  };
  const boundedAdd = (set, key, limit) => {
    set.add(key);
    if (set.size > limit) set.delete(set.values().next().value);
  };
  const isReasoning = type => /^(reasoning)$/i.test(type);
  const isOutput = type => /^(agentMessage|reasoning)$/i.test(type);
  const isTool = type => /^(commandExecution|mcpToolCall|webSearch|fileChange|collabAgentToolCall|dynamicToolCall|imageView|subAgentActivity)$/i.test(type);
  const sameSelection = (a, b) => (a?.threadId ?? null) === (b?.threadId ?? null)
    && (a?.hostId ?? null) === (b?.hostId ?? null);
  const acceptsStats = (value, requested, selected) => sameSelection(requested, selected)
    && (!value || sameSelection(value, requested));

  class UsageMetrics {
    constructor(threadId) {
      this.threadId = threadId;
      this.turnId = null;
      this.model = 'unknown';
      this.phase = 'idle';
      this.floor = -Infinity;
      this.window = null;
      this.seen = new Set();
      this.closed = new Set();
      this.buckets = new Map();
    }
    resetWindow(reason = null) {
      this.window = { turnId: this.turnId, model: this.model, start: null, end: null, reason };
    }
    begin(turnId, time) {
      if (!turnId || this.closed.has(turnId) || this.turnId === turnId) return;
      if (this.turnId) boundedAdd(this.closed, this.turnId, 128);
      this.turnId = turnId;
      this.model = 'unknown';
      this.phase = 'waiting';
      if (finite(time)) this.floor = Math.max(this.floor, time);
      this.resetWindow();
    }
    bucket(model) {
      if (!this.buckets.has(model)) {
        if (this.buckets.size >= 8) this.buckets.delete(this.buckets.keys().next().value);
        this.buckets.set(model, { samples: [], last: null, omitted: 0 });
      }
      return this.buckets.get(model);
    }
    consume(record) {
      if (!record || typeof record !== 'object' || typeof record.type !== 'string') {
        this.resetWindow('unreadable_record');
        return;
      }
      const p = record.payload || {};
      const time = Date.parse(record.timestamp);
      if (p.thread_id && p.thread_id !== this.threadId) return;
      if (record.type === 'turn_context') {
        if (typeof p.turn_id !== 'string' || !p.turn_id) return;
        this.begin(p.turn_id, time);
        if (p.turn_id !== this.turnId || this.closed.has(p.turn_id)) return;
        if (typeof p.model === 'string' && p.model) {
          if (this.window && this.window.start !== null && this.model !== p.model) this.window.reason = 'model_changed';
          this.model = p.model;
          if (this.window) this.window.model = p.model;
        }
        return;
      }
      if (record.type === 'token_usage_record') {
        if (typeof p.response_id === 'string' && this.seen.has(p.response_id)) return;
        if (typeof p.response_id === 'string') boundedAdd(this.seen, p.response_id, 8192);
        const w = this.window;
        const model = p.turn_id === this.turnId ? this.model : 'unknown';
        const output = p.usage?.output_tokens;
        let reason = w?.reason || null;
        if (typeof p.response_id !== 'string' || !p.response_id) reason = 'missing_response';
        else if (!p.turn_id || p.turn_id !== w?.turnId || this.closed.has(p.turn_id)) reason = 'turn_mismatch';
        else if (model === 'unknown') reason = 'missing_model';
        else if (!count(output) || output === 0) reason = 'missing_usage';
        else if (!w || !finite(w.start) || !finite(w.end)) reason = reason || 'missing_start';
        else if (!finite(time) || time < w.end || time - w.start < 100) reason = 'invalid_time';
        const durationMs = !reason ? time - w.start : null;
        const sample = {
          id: p.response_id || null, turnId: p.turn_id || null, model,
          outputTokens: count(output) ? output : null,
          reasoningOutputTokens: count(p.usage?.reasoning_output_tokens) ? p.usage.reasoning_output_tokens : null,
          startedAt: finite(w?.start) ? w.start : null, endedAt: finite(time) ? time : null,
          durationMs, tps: durationMs ? output * 1000 / durationMs : null, reason,
        };
        const bucket = this.bucket(model);
        bucket.last = sample;
        if (!reason) {
          bucket.samples.push(sample);
          if (bucket.samples.length > CAP) bucket.samples.shift();
        } else bucket.omitted++;
        // token_count.last 是同一结算的镜像，只有 token_usage_record 关闭窗口。
        if (finite(time)) this.floor = Math.max(this.floor, time);
        this.resetWindow();
        return;
      }
      if (record.type === 'compacted') {
        this.resetWindow('compacted');
        return;
      }
      if (record.type !== 'event_msg') return;
      if (p.type === 'task_started') {
        this.begin(p.turn_id, time);
      } else if (p.type === 'item_completed' && /^(contextCompaction)$/i.test(p.item?.type)) {
        if (p.turn_id === this.turnId) this.resetWindow('compacted');
      } else if (p.type === 'item_completed' && isOutput(p.item?.type)) {
        if (p.turn_id !== this.turnId || this.closed.has(p.turn_id)) return;
        const w = this.window;
        if (!w) return;
        const start = p.started_at_ms, end = p.completed_at_ms;
        if (!finite(start) || !finite(end) || start < this.floor || end < start || !finite(time) || end > time) {
          w.reason = 'invalid_time';
          return;
        }
        w.start = w.start === null ? start : Math.min(w.start, start);
        w.end = w.end === null ? end : Math.max(w.end, end);
        this.phase = isReasoning(p.item.type) ? 'thinking' : 'streaming';
      } else if (['turn_aborted', 'task_complete'].includes(p.type)) {
        if (p.turn_id && p.turn_id !== this.turnId) return;
        boundedAdd(this.closed, this.turnId, 128);
        this.phase = p.type === 'turn_aborted' ? 'interrupted' : 'complete';
        this.resetWindow(p.type === 'turn_aborted' ? 'interrupted' : 'turn_mismatch');
      } else if (['context_compacted', 'error', 'stream_error'].includes(p.type)) {
        this.resetWindow(p.type === 'context_compacted' ? 'compacted' : 'interrupted');
      }
    }
    snapshot() {
      const bucket = this.buckets.get(this.model);
      const last = bucket?.last || null;
      return {
        ...summary(bucket?.samples || []), model: this.model, turnId: this.turnId, phase: this.phase,
        tps: last?.tps ?? null, last, omitted: bucket?.omitted || 0,
        source: 'usage.output_tokens', durationKind: 'output-item-to-usage',
        association: 'ordered-event-window', modelScope: 'configured-model', liveAvailable: false,
      };
    }
  }

  class StreamMetrics {
    constructor() {
      this.tokens = 0;
      this.tps = null;
      this.samples = [];
      this.p50 = null;
      this.p95 = null;
      this.unavailable = false;
      this.resetWindow();
    }
    resetWindow() { this.points = []; this.anchor = null; }
    observe(tokens, at) {
      const last = this.points.at(-1);
      if (last && at <= last.at) return;
      // 长时间无输出或工具边界后的首块仅作基线，不把等待时间混入生成速度。
      if (last && at - last.at > 2000) this.resetWindow();
      const point = { tokens, at };
      if (!this.points.length) {
        this.points.push(point);
        this.anchor = point;
        return;
      }
      this.points.push(point);
      const cutoff = at - 2000;
      while (this.points.length > 2 && this.points[1].at <= cutoff) this.points.shift();
      const first = this.points[0], next = this.points[1];
      const start = Math.max(first.at, cutoff);
      const baseline = first.tokens + (next.tokens - first.tokens) * (start - first.at) / (next.at - first.at);
      if (at - start >= 1000) this.tps = Math.max(0, tokens - baseline) * 1000 / (at - start);
      const duration = at - this.anchor.at;
      if (duration >= 1000) {
        const delta = tokens - this.anchor.tokens;
        if (delta > 0) {
          this.samples.push(delta * 1000 / duration);
          if (this.samples.length > CAP) this.samples.shift();
          this.p50 = percentile(this.samples, .5);
          this.p95 = percentile(this.samples, .95);
        }
        this.anchor = point;
      }
    }
    snapshot() {
      return { tokens: this.tokens, tps: this.tps, count: this.samples.length,
        p50: this.p50, p95: this.p95, windowMs: 2000, sampleMs: 1000 };
    }
  }

  class SpeedTracker {
    constructor({ countTokens = null } = {}) {
      this.threads = new Map();
      this.countTokens = countTokens;
    }
    contexts() {
      return [...this.threads].filter(([, state]) => state.native || state.metrics).map(([key]) => {
        const [hostId, threadId] = JSON.parse(key);
        return { hostId, threadId };
      });
    }
    measure(live) {
      if (!live?.dirty) return;
      live.dirty = false;
      try {
        if (!this.countTokens || live.unavailable || live.meter.unavailable) throw new Error('tokenizer unavailable');
        let total = 0;
        for (const item of live.items.values()) {
          if (item.dirty) {
            item.tokens = this.countTokens(item.text || item.summary || item.content);
            if (!count(item.tokens)) throw new Error('invalid token count');
            item.dirty = false;
          }
          total += item.tokens;
        }
        live.meter.tokens += total - (live.tokens || 0);
        live.tokens = total;
        live.meter.observe(total, live.lastAt);
        live.measuredAt = live.lastAt;
      } catch {
        live.tokens = null;
        live.tps = null;
        live.unavailable = true;
        live.items.clear();
        live.meter.unavailable = true;
        live.meter.tokens = null;
        live.meter.tps = null;
        live.meter.samples = [];
        live.meter.p50 = live.meter.p95 = null;
        live.meter.resetWindow();
      }
    }
    finishLive(state) {
      if (!state.live) return;
      this.measure(state.live);
      state.live.active = false;
      state.live.closed = true;
      state.live.items.clear();
    }
    thread({ hostId = 'local', threadId }) {
      const key = JSON.stringify([hostId, threadId]);
      if (!this.threads.has(key)) {
        if (this.threads.size >= 32) this.threads.delete(this.threads.keys().next().value);
        this.threads.set(key, {
          turnId: null, phase: 'idle', kind: null, native: false,
          completed: new Set(), items: new Map(), metrics: null, live: null, meter: null, usageKey: null,
        });
      }
      return this.threads.get(key);
    }
    update(context, metrics) {
      if (!context?.threadId) return;
      const state = this.thread(context);
      // 原生事件已确定轮次时，日志轮询不得把结束态倒退到上一轮。
      if (state.native && metrics && metrics.turnId !== state.turnId) return;
      state.metrics = metrics;
      if (!metrics) return;
      if (!state.native) {
        if (state.turnId !== metrics.turnId) { state.live = null; state.meter = null; }
        state.turnId = metrics.turnId;
        state.phase = metrics.phase;
        state.native = false;
      } else if (metrics.turnId === state.turnId && ['complete', 'interrupted'].includes(metrics.phase)) {
        state.phase = metrics.phase;
      }
      if (metrics.turnId === state.turnId && ['complete', 'interrupted'].includes(metrics.phase)) {
        boundedAdd(state.completed, state.turnId, 128);
        this.finishLive(state);
      }
      // 服务端用量保留在详情；不替换可观测流的数值、时间窗口或分位数。
    }
    ingest(message, now = performance.now(), epoch = Date.now()) {
      if (message?.type !== 'mcp-notification') return;
      const { method, params: p = {}, hostId = 'local' } = message;
      const turnId = p.turnId ?? p.turn?.id;
      if (typeof p.threadId !== 'string' || typeof turnId !== 'string') return;
      const state = this.thread({ hostId, threadId: p.threadId });
      if (state.completed.has(turnId)) return;
      if (method === 'turn/completed' || method === 'turn/aborted') {
        boundedAdd(state.completed, turnId, 128);
        if (!state.turnId || state.turnId === turnId) {
          state.turnId = turnId;
          state.native = true;
          state.phase = method === 'turn/aborted' || ['interrupted', 'failed'].includes(p.turn?.status) ? 'interrupted' : 'complete';
          this.finishLive(state);
        }
        return;
      }
      const delta = /^(item\/agentMessage\/delta|item\/reasoning\/(summaryTextDelta|textDelta))$/.test(method);
      if (!['turn/started', 'item/started', 'item/completed', 'thread/tokenUsage/updated'].includes(method) && !delta) return;
      if (delta && (typeof p.delta !== 'string' || !p.delta.length || !finite(now) || !finite(epoch))) return;
      if (turnId !== state.turnId) {
        if (state.turnId) boundedAdd(state.completed, state.turnId, 128);
        state.turnId = turnId;
        state.items.clear();
        state.live = null;
        state.meter = null;
        state.usageKey = null;
        state.phase = 'waiting';
      }
      state.native = true;
      if (method === 'turn/started') return;
      if (method === 'thread/tokenUsage/updated') {
        const key = JSON.stringify(p.tokenUsage?.total || null);
        if (key === 'null' || key === state.usageKey) return;
        state.usageKey = key;
        // usage 通知没有响应 ID；仅在输出项已结束时作为分段边界。
        if (state.live && !state.live.active) this.finishLive(state);
        return;
      }
      const id = p.item?.id || p.itemId;
      if (typeof id !== 'string') return;
      if (method === 'item/started') {
        if (state.items.has(id)) return;
        if (state.items.size >= 256) state.items.delete(state.items.keys().next().value);
        state.items.set(id, { type: p.item.type, done: false });
        state.kind = isReasoning(p.item.type) ? 'reasoning' : 'text';
        state.phase = isReasoning(p.item.type) ? 'thinking' : isTool(p.item.type) ? 'tool' : 'waiting';
        if (isTool(p.item.type)) this.finishLive(state);
      } else if (delta) {
        if (state.items.get(id)?.done) return;
        const partial = !state.items.has(id);
        if (partial) {
          if (state.items.size >= 256) state.items.delete(state.items.keys().next().value);
          state.items.set(id, { type: method.includes('/reasoning/') ? 'reasoning' : 'agentMessage', done: false });
        }
        if (!state.live || state.live.closed) {
          state.meter ||= new StreamMetrics();
          state.meter.resetWindow();
          state.live = { firstAt: now, firstEpoch: epoch, lastAt: now, characters: 0, tokens: null,
            tps: null, pulse: 0, items: new Map(), partial, active: true, closed: false, dirty: false, unavailable: false,
            meter: state.meter, measuredAt: -Infinity };
        }
        const live = state.live;
        if (!live.items.has(id)) live.items.set(id, { text: '', summary: '', content: '', tokens: 0, dirty: false });
        const output = live.items.get(id);
        const channel = method.includes('summaryTextDelta') ? 'summary' : method.includes('/reasoning/') ? 'content' : 'text';
        if (channel === 'content' && output.summary) return;
        if (channel === 'summary' && output.content) live.meter.resetWindow();
        live.characters += p.delta.length;
        if (live.characters > 262144) {
          live.unavailable = true;
          live.items.clear();
        } else if (!live.unavailable) {
          output[channel] += p.delta;
          if (channel === 'summary') output.content = '';
          output.dirty = true;
        }
        // 连续片段重新分词，避免把分块边界错误地算成额外 Token。
        live.dirty = true;
        live.lastAt = now;
        live.active = true;
        live.pulse++;
        // 首块单独计数作基线；后续最多每 100ms 分词一次，不按刷新帧数取分位数。
        if (!live.meter.points.length || now - live.measuredAt >= 100) this.measure(live);
        state.kind = method.includes('/reasoning/') ? 'reasoning' : 'text';
        state.phase = 'streaming';
      } else if (method === 'item/completed') {
        const item = state.items.get(id);
        if (item?.done) return;
        if (item) item.done = true;
        else state.items.set(id, { type: p.item?.type, done: true });
        if (state.live) state.live.active = [...state.live.items.keys()].some(key => !state.items.get(key)?.done);
        state.phase = isReasoning(p.item?.type) ? 'thinking' : 'waiting';
      }
    }
    snapshot(context, now = performance.now()) {
      const empty = { ...summary([]), tps: null, model: 'unknown', last: null, omitted: 0, liveAvailable: false,
        streaming: false, flowing: false, settled: true, estimated: false, estimatedTokens: null, pulse: 0, partial: false,
        finished: false, stream: null, actual: null };
      if (!context?.threadId) return { ...empty, phase: 'unavailable' };
      const s = this.thread(context);
      const metrics = s.metrics?.turnId === s.turnId ? s.metrics : null;
      const live = s.live;
      this.measure(live);
      return {
        ...empty, ...metrics, phase: s.phase, turnId: s.turnId, kind: s.kind,
        tps: s.meter?.tps ?? null,
        settled: ['complete', 'interrupted'].includes(s.phase), estimated: !!s.meter, estimatedTokens: live?.tokens ?? null,
        finished: ['complete', 'interrupted'].includes(s.phase), stream: s.meter?.snapshot() ?? null, actual: metrics,
        streaming: !!live?.active, flowing: !!live?.active && now - live.lastAt < 1000,
        pulse: live?.pulse ?? 0, partial: live?.partial ?? false,
        source: s.meter ? 'local-bpe/o200k_base' : null,
        tokenizerAvailable: !!this.countTokens && !live?.unavailable,
        durationKind: s.meter ? 'rolling-output-2s' : null,
        percentileSource: 'current-turn-output-windows',
      };
    }
  }
  const api = { SpeedTracker, UsageMetrics, percentile, sameSelection, acceptsStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.__RunstripSpeed = api;
})(globalThis);
