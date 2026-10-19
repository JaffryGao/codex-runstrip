#!/usr/bin/env node
/**
 * Codex 底部状态条注入器（纯 Node，无外部依赖）
 * 连接 Codex 的 CDP 调试端口 → 注入浮层 → 每秒喂真实统计数据。
 * 断线自动重连；页面刷新自动重装；进程重启后自动重新附着。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', process.env.CODEX_FORK_PORT || 9222));
const INTERVAL = Number(arg('--interval', 900));
const inject = readFileSync(join(here, 'inject.js'), 'utf8');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------------- rollout 解析 ---------------- */

const SESSIONS = join(homedir(), '.codex/sessions');
const TOOL_ITEMS = new Set(['CommandExecution','FileChange','McpToolCall','WebSearch','ImageView','BrowserAction','ComputerUse','SubAgent']);
const SYSTEM_EST = 1400, TOOLS_EST = 6800;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

let latestPath = null;
function latestRollout() {
  const files = walk(SESSIONS);
  let best = null, bestT = 0;
  for (const f of files) {
    let t = 0;
    try { t = statSync(f).mtimeMs; } catch { continue; }
    if (t > bestT) { bestT = t; best = f; }
  }
  return best;
}

function readStats() {
  const path = latestRollout();
  if (!path) return null;
  if (path !== latestPath) { latestPath = path; log('切换会话', path.split('/').pop()); }

  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return null; }

  let turns = 0, steps = 0, window = 0;
  let thread = null, last = null;
  const firstOfTurn = new Map(), lastOfTurn = new Map();
  let fastDt = 0, fastOut = 0, prev = null;

  for (const line of text.split('\n')) {
    if (!line) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const p = d.payload || {};
    const t = d.type;
    const when = d.timestamp ? Date.parse(d.timestamp) : NaN;

    if (t === 'event_msg') {
      if (p.type === 'task_started') turns++;
      else if (p.type === 'item_completed') {
        const it = p.item || {};
        if (TOOL_ITEMS.has(it.type)) steps++;
      } else if (p.type === 'token_count') {
        const info = p.info || {};
        if (info.model_context_window) window = info.model_context_window;
        if (info.total_token_usage) thread = info.total_token_usage;
      }
    } else if (t === 'token_usage_record') {
      if (p.thread_token_usage) thread = p.thread_token_usage;
      const u = p.usage;
      if (!u) continue;
      last = u;
      if (p.turn_id && !Number.isNaN(when)) {
        if (!firstOfTurn.has(p.turn_id)) firstOfTurn.set(p.turn_id, when);
        lastOfTurn.set(p.turn_id, when);
        const cum = (p.turn_token_usage?.output_tokens) || 0;
        if (prev && prev.id === p.turn_id) {
          const dt = (when - prev.t) / 1000;
          const dout = cum - prev.cum;
          if (dt >= 0.05 && dt <= 8 && dout > 0) { fastDt += dt; fastOut += dout; }
        }
        prev = { id: p.turn_id, t: when, cum };
      }
    }
  }

  if (!thread) return null;
  const input = thread.input_tokens || 0;
  const cached = thread.cached_input_tokens || 0;
  const output = thread.output_tokens || 0;
  const used = last?.input_tokens ?? input;

  let curTurn = null, curT = 0;
  for (const [k, v] of lastOfTurn) if (v > curT) { curT = v; curTurn = k; }
  const modelSeconds = curTurn ? (curT - (firstOfTurn.get(curTurn) || curT)) / 1000 : 0;

  return {
    turns, steps,
    total_tokens: input + output,
    cache_rate: input ? (cached / input) * 100 : 0,
    context_used: used,
    context_window: window,
    context_pct: window ? (used / window) * 100 : 0,
    tps: fastDt ? fastOut / fastDt : 0,
    model_seconds: modelSeconds,
    input, cached, output,
    ctx_breakdown: {
      system: SYSTEM_EST,
      tools: TOOLS_EST,
      messages: Math.max(0, used - SYSTEM_EST - TOOLS_EST),
    },
  };
}

/* ---------------- CDP ---------------- */

async function listTargets() {
  let lastError;
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      const r = await fetch(`http://${host}:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function pickPage() {
  const list = await listTargets();
  return list.find(t => t.type === 'page' && t.url.includes('/index.html') && !t.url.includes('avatar-overlay'))
      || list.find(t => t.type === 'page' && t.url.includes('/index.html'))
      || null;
}

async function attach() {
  const page = await pickPage();
  if (!page) throw new Error('页面未就绪');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  let closed = false;

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WS 连接失败')), { once: true });
  });
  ws.addEventListener('close', () => { closed = true; });

  const send = (method, params = {}) => new Promise((res, rej) => {
    if (closed) return rej(new Error('closed'));
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };

  await send('Page.enable').catch(() => {});
  await send('Page.addScriptToEvaluateOnNewDocument', { source: inject }).catch(() => {});
  await evaluate(inject);
  log('已附着', page.url);

  let lastPayload = '';
  while (!closed) {
    const alive = await evaluate(`!!document.getElementById('__codex_footer__')`);
    if (!alive) await evaluate(inject);

    const s = readStats();
    if (s) {
      const json = JSON.stringify(s);
      if (json !== lastPayload) {
        lastPayload = json;
        await evaluate(`window.__codexFooter ? window.__codexFooter.update(${json}) : 'missing'`);
      }
    }
    await sleep(INTERVAL);
  }
  try { ws.close(); } catch {}
}

log(`注入器启动，端口 ${PORT}`);
for (;;) {
  try {
    await attach();
    log('连接断开，重连中…');
  } catch {
    // Codex 未运行或未开调试端口：静默等待
  }
  await sleep(1500);
}
