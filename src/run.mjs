#!/usr/bin/env node
/* 本机 CDP 注入；页面事件提供流式估算，选中聊天日志提供真实用量及完成态均速。 */
import { readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionIndex } from './stats.mjs';
import { createTokenizerScript } from './tokenizer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (key, fallback) => {
  const i = process.argv.indexOf(key);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('--port', process.env.CODEX_FORK_PORT || 9222));
const INTERVAL = Number(arg('--interval', 900));
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535 || !Number.isFinite(INTERVAL) || INTERVAL < 200) {
  throw new Error('端口或刷新间隔无效');
}
// 端口短暂不可达不等于宿主退出：仅当连续多次探测失败且超过宽限期才结束。
const EXIT_GRACE = Number(arg('--exit-grace', 20_000));
const STARTUP_GRACE = Number(arg('--startup-grace', 45_000));
if (![EXIT_GRACE, STARTUP_GRACE].every(ms => Number.isFinite(ms) && ms >= 1000)) {
  throw new Error('宽限时间无效');
}
const FAILURE_LIMIT = 3;
const tokenizer = createTokenizerScript();
const inject = tokenizer.script + '\n' + ['binding.js', 'speed.js', 'inject.js'].map(file => readFileSync(join(here, file), 'utf8')).join('\n');
const sessions = new SessionIndex(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log(new Date().toISOString(), ...args);
const connections = new Map();
let stopping = false;
let seenMainPage = false;
let lastMainPageAt = performance.now();
let lastReachableAt = performance.now();
let failures = 0;
let lastWarnAt = 0;

async function listTargets() {
  let lastError;
  for (const host of ['127.0.0.1', '[::1]']) {
    try {
      const response = await fetch(`http://${host}:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { reachable: true, targets: await response.json() };
    } catch (error) { lastError = error; }
  }
  return { reachable: false, error: lastError };
}

async function attach(page, connection) {
  if (stopping) return;
  const url = new URL(page.webSocketDebuggerUrl);
  if (url.protocol !== 'ws:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) return;
  const ws = new WebSocket(url);
  let id = 0, closed = false, scriptId;
  const pending = new Map();
  const rejectPending = () => {
    closed = true;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('CDP 连接已断开'));
    }
    pending.clear();
  };
  ws.addEventListener('close', rejectPending);
  ws.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed || ws.readyState !== WebSocket.OPEN) return reject(new Error('CDP 未连接'));
    const requestId = ++id;
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`CDP 超时: ${method}`));
    }, 5000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  };
  connection.stop = async () => {
    if (scriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }).catch(() => {});
    await evaluate('window.__codexFooter?.destroy()').catch(() => {});
    ws.close();
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP 握手超时')), 5000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP 连接失败')); }, { once: true });
    });
    if (stopping) return;
    await send('Page.enable');
    scriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: inject })).identifier;
    if (stopping) return;
    await evaluate(inject);
    log('已附着 Codex Runstrip', page.id, tokenizer.available ? '本机 BPE 分词可用' : '本机分词器不可用');
    while (!closed && !stopping) {
      const state = await evaluate(`({alive:!!document.getElementById('__codex_footer__'),selection:window.__codexFooter?.selection()})`);
      if (!state?.alive) await evaluate(inject);
      const stats = sessions.read(state?.selection);
      const payload = JSON.stringify(stats);
      await evaluate(`window.__codexFooter?.update(${payload},${JSON.stringify(state?.selection ?? null)})`);
      await sleep(INTERVAL);
    }
  } finally {
    // 连接异常也移除本 CDP 会话的预加载脚本，避免重连时不断累积。
    if (!closed && scriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }).catch(() => {});
    if (!closed && stopping) await evaluate('window.__codexFooter?.destroy()').catch(() => {});
    ws.close();
    rejectPending();
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([...connections.values()].map(connection => connection.stop?.()));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
log(`注入器启动，端口 ${PORT}`);
while (!stopping) {
  let pages = [], reachable = false;
  try {
    const probe = await listTargets();
    reachable = probe.reachable;
    if (reachable) {
      failures = 0;
      lastReachableAt = performance.now();
      pages = probe.targets.filter(target =>
        target.type === 'page' && target.url?.startsWith('app://-/index.html') && !target.url.includes('avatar-overlay'));
    }
    if (stopping) break;
    if (pages.length) {
      seenMainPage = true;
      lastMainPageAt = performance.now();
    }
    for (const page of pages) {
      if (stopping) break;
      if (connections.has(page.id)) continue;
      const connection = {};
      connections.set(page.id, connection);
      connection.task = attach(page, connection)
        .catch(error => { if (!stopping) log('等待重新附着:', error.message); })
        .finally(() => connections.delete(page.id));
    }
  } catch { reachable = false; }
  if (!reachable) failures++;
  // 启动阶段允许主页面稍后出现；正常连接后，只有持续不可达且多次失败才视为宿主退出。
  const now = performance.now();
  const silentFor = Math.min(now - lastReachableAt, now - lastMainPageAt);
  const grace = seenMainPage ? EXIT_GRACE : STARTUP_GRACE;
  if (failures >= FAILURE_LIMIT && silentFor > grace) {
    log(seenMainPage ? 'Codex 已退出，停止注入器' : '等待 Codex 超时，停止注入器');
    await shutdown();
    break;
  }
  if (!reachable && now - lastWarnAt > 15_000) {
    lastWarnAt = now;
    log('调试端口暂不可达，继续等待', `连续失败 ${failures} 次`);
  }
  await sleep(1500);
}
await Promise.allSettled([...connections.values()].map(connection => connection.task));
const pidfile = process.env.RUNSTRIP_PIDFILE;
if (pidfile) {
  try {
    if (readFileSync(pidfile, 'utf8').trim() === String(process.pid)) unlinkSync(pidfile);
  } catch {}
  try {
    if (JSON.parse(readFileSync(`${pidfile}.json`, 'utf8')).pid === process.pid) unlinkSync(`${pidfile}.json`);
  } catch {}
}
// CDP/HTTP 的底层连接不再有产品工作，避免网络库的保活句柄让进程残留。
process.exit(0);
