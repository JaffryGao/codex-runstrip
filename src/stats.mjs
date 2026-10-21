import { openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import speed from './speed.js';

const TOOL_ITEMS = new Set([
  'CommandExecution', 'FileChange', 'McpToolCall', 'WebSearch', 'ImageView',
  'BrowserAction', 'ComputerUse', 'CollabAgentToolCall', 'SubAgent',
]);

export class RolloutReader {
  constructor(path, threadId) {
    this.path = path;
    this.threadId = threadId;
    this.reset();
  }
  reset() {
    this.offset = 0;
    this.remainder = '';
    this.decoder = new StringDecoder('utf8');
    this.fileIdentity = null;
    this.turns = new Set();
    this.steps = new Set();
    this.model = null;
    this.turnId = null;
    this.total = null;
    this.sessionId = null;
    this.metrics = new speed.UsageMetrics(this.threadId);
  }
  consume(record) {
    const p = record.payload || {};
    this.metrics.consume(record);
    if (record.type === 'session_meta') this.sessionId = p.id;
    if (record.type === 'turn_context') {
      this.model = p.model || this.model;
      this.turnId = p.turn_id || this.turnId;
    }
    if (record.type === 'token_usage_record') {
      this.total = p.thread_token_usage || this.total;
    }
    if (record.type !== 'event_msg') return;
    if (p.type === 'task_started' && p.turn_id) this.turns.add(p.turn_id);
    if (p.type === 'item_completed' && TOOL_ITEMS.has(p.item?.type) && p.item?.id) this.steps.add(p.item.id);
    if (p.type === 'token_count') {
      this.total = p.info?.total_token_usage || this.total;
    }
  }
  read() {
    const stat = statSync(this.path);
    const identity = `${stat.dev}:${stat.ino}`;
    if (this.fileIdentity !== identity || stat.size < this.offset) this.reset();
    this.fileIdentity = identity;
    if (stat.size > this.offset) {
      const fd = openSync(this.path, 'r');
      const buffer = Buffer.alloc(Math.min(256 * 1024, stat.size - this.offset));
      try {
        while (this.offset < stat.size) {
          const size = readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - this.offset), this.offset);
          if (!size) break;
          this.offset += size;
          const lines = (this.remainder + this.decoder.write(buffer.subarray(0, size))).split('\n');
          this.remainder = lines.pop();
          for (const line of lines) {
            if (!line) continue;
            let record;
            try { record = JSON.parse(line); } catch {
              this.metrics.resetWindow('unreadable_record');
              continue;
            }
            if (!record || typeof record !== 'object' || typeof record.type !== 'string') {
              this.metrics.resetWindow('unreadable_record');
              continue;
            }
            this.consume(record);
          }
        }
      } finally { closeSync(fd); }
    }
    if (this.sessionId && this.sessionId !== this.threadId) return null;
    if (!this.total && (this.sessionId !== this.threadId || !this.turns.size)) return null;
    const input = this.total ? this.total.input_tokens ?? 0 : null;
    const cached = this.total ? this.total.cached_input_tokens ?? 0 : null;
    const output = this.total ? this.total.output_tokens ?? 0 : null;
    return {
      hostId: 'local', threadId: this.threadId, turnId: this.turnId, model: this.model,
      turns: this.turns.size, steps: this.steps.size,
      input, cached, output, total_tokens: this.total ? input + output : null,
      cache_rate: input ? cached / input * 100 : null,
      speed: this.metrics.snapshot(),
    };
  }
}

export class SessionIndex {
  constructor(directory) {
    this.directory = directory;
    this.paths = new Map();
    this.readers = new Map();
    this.scannedAt = -Infinity;
  }
  scan() {
    const visit = directory => {
      let entries;
      try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile()) {
          const match = entry.name.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i);
          if (match) this.paths.set(match[1], path);
        }
      }
    };
    this.paths.clear();
    visit(this.directory);
    this.scannedAt = Date.now();
  }
  read(selection) {
    if (selection?.hostId !== 'local' || !selection?.threadId) return null;
    const id = selection.threadId;
    if (!this.paths.has(id) && Date.now() - this.scannedAt > 5000) this.scan();
    const path = this.paths.get(id);
    if (!path) return null;
    let reader = this.readers.get(id);
    if (!reader || reader.path !== path) {
      if (this.readers.size >= 8) this.readers.delete(this.readers.keys().next().value);
      reader = new RolloutReader(path, id);
      this.readers.set(id, reader);
    }
    try { return reader.read(); } catch {
      this.paths.delete(id);
      this.readers.delete(id);
      return null;
    }
  }
}
