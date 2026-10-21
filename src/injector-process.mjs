/* 只管理已确认属于 Runstrip、且连接同一调试端口的注入进程。 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

function ps(pid, field = 'command') {
  try {
    return execFileSync('/bin/ps', ['-p', String(pid), '-o', `${field}=`], { encoding: 'utf8' }).trim();
  } catch { return ''; }
}

export function findInjectors(port) {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  const found = [];
  for (const row of rows.split('\n')) {
    const match = row.trim().match(/^(\d+)\s+(.+)$/);
    if (!match || !match[2].includes(`/Contents/Resources/run.mjs --port ${port}`)) continue;
    const pid = Number(match[1]), command = match[2];
    const executable = ps(pid, 'comm');
    if (basename(executable) !== 'node' || !command.startsWith(`${executable} `)) continue;
    const args = command.slice(executable.length + 1);
    const script = args.match(/^(.+\/Contents\/Resources\/run\.mjs) --port (\d+)(?:\s|$)/);
    if (!script || Number(script[2]) !== port) continue;
    try {
      const resources = realpathSync(dirname(script[1]));
      const identifier = execFileSync('/usr/libexec/PlistBuddy',
        ['-c', 'Print :CFBundleIdentifier', join(resources, '../Info.plist')], { encoding: 'utf8' }).trim();
      if (identifier === 'local.codex.runstrip') found.push({ pid, command, resources });
    } catch { /* 不管理无法确认来源的进程。 */ }
  }
  return found;
}

export function fingerprint(resources) {
  const hash = createHash('sha256').update(process.versions.node);
  for (const file of ['run.mjs', 'inject.js', 'binding.js', 'speed.js', 'stats.mjs', 'tokenizer.mjs']) {
    hash.update(file);
    try { hash.update(readFileSync(join(resources, file))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('missing');
    }
  }
  return hash.digest('hex');
}

export async function ensureInjector({ resources, node, port, pidfile, log }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('调试端口无效');
  resources = realpathSync(resources);
  const digest = fingerprint(resources);
  const running = findInjectors(port);
  let previous;
  try { previous = JSON.parse(readFileSync(`${pidfile}.json`, 'utf8')); } catch {}
  if (running.length === 1 && previous?.pid === running[0].pid
      && previous.fingerprint === digest && running[0].resources === resources) {
    writeFileSync(pidfile, String(running[0].pid));
    return { action: 'reused', pid: running[0].pid };
  }
  // 等待旧进程移除自己的 CDP 预加载和浮层后才启动新版，避免旧版迟到清理新浮层。
  for (const injector of running) {
    if (ps(injector.pid) !== injector.command) continue;
    try { process.kill(injector.pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const deadline = Date.now() + 6000;
  const forced = [];
  while (running.some(process => ps(process.pid) === process.command)) {
    if (Date.now() > deadline) {
      for (const injector of running) {
        if (ps(injector.pid) !== injector.command) continue;
        try { process.kill(injector.pid, 'SIGKILL'); forced.push(injector.pid); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      break;
    }
    await delay(100);
  }
  if (forced.length) await delay(100);
  if (running.some(injector => ps(injector.pid) === injector.command)) {
    throw new Error('旧注入器未能退出，本次未启动重复进程');
  }
  const fd = openSync(log, 'a');
  try {
    const child = spawn(node, [join(resources, 'run.mjs'), '--port', String(port)], {
      detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, RUNSTRIP_PIDFILE: pidfile },
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    writeFileSync(pidfile, String(child.pid));
    writeFileSync(`${pidfile}.json`, JSON.stringify({
      pid: child.pid, resources, fingerprint: digest,
    }));
    return { action: 'started', pid: child.pid, replaced: running.map(process => process.pid), forced };
  } finally { closeSync(fd); }
}

let entrypoint;
try { entrypoint = pathToFileURL(realpathSync(process.argv[1])).href; } catch {}
if (import.meta.url === entrypoint) {
  const [resources, node, port, pidfile, log] = process.argv.slice(2);
  try {
    const result = await ensureInjector({ resources, node, port: Number(port), pidfile, log });
    console.log(new Date().toISOString(), result.action === 'reused' ? '复用当前版本注入器' : '启动当前版本注入器', JSON.stringify(result));
  } catch (error) {
    console.error(new Date().toISOString(), '注入器启动失败', error.message);
    process.exitCode = 1;
  }
}
