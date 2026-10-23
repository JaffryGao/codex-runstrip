import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { ensureInjector, findInjectors } from '../src/injector-process.mjs';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function app(root, name) {
  const resources = join(root, `${name}.app/Contents/Resources`);
  await mkdir(join(resources, 'node/bin'), { recursive: true });
  await symlink(process.execPath, join(resources, 'node/bin/node'));
  await writeFile(join(resources, '../Info.plist'),
    '<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.codex.runstrip</string></dict></plist>');
  await writeFile(join(resources, 'run.mjs'),
    'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000);');
  await writeFile(join(resources, 'inject.js'), '// version one');
  return resources;
}
function running(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function stop(pid) {
  try { process.kill(pid, 'SIGKILL'); } catch {}
  for (let i = 0; i < 20 && running(pid); i++) await delay(25);
}
async function waitExited(pid) {
  for (let i = 0; i < 40 && running(pid); i++) await delay(25);
  assert.equal(running(pid), false);
}

test('reuses the same build, but restarts when its code changes in place', { skip: process.platform !== 'darwin' }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runstrip-process-')));
  const pids = [];
  try {
    const resources = await app(root, 'Full With Spaces');
    const port = await freePort();
    const options = { resources, node: join(resources, 'node/bin/node'), port, pidfile: join(root, 'injector.pid'), log: join(root, 'launcher.log') };
    const first = await ensureInjector(options);
    pids.push(first.pid);
    const second = await ensureInjector(options);
    assert.equal(second.action, 'reused');
    assert.equal(second.pid, first.pid);
    await writeFile(join(resources, 'inject.js'), '// version two');
    const third = await ensureInjector(options);
    pids.push(third.pid);
    assert.equal(third.action, 'started');
    assert.notEqual(third.pid, first.pid);
    await waitExited(first.pid);
    assert.equal(findInjectors(port).length, 1);
  } finally {
    await Promise.all(pids.map(stop));
    await rm(root, { recursive: true, force: true });
  }
});

test('takes over legacy duplicates only on the matching port, ignoring an unrelated PID file', { skip: process.platform !== 'darwin' }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runstrip-legacy-')));
  const pids = [];
  try {
    const old = await app(root, 'Old');
    const resources = await app(root, 'New');
    const port = await freePort(), otherPort = await freePort();
    for (const p of [port, port, otherPort]) {
      const child = spawn(process.execPath, [join(old, 'run.mjs'), '--port', String(p)], { stdio: 'ignore' });
      await once(child, 'spawn');
      pids.push(child.pid);
    }
    const options = { resources, node: process.execPath, port, pidfile: join(root, 'injector.pid'), log: join(root, 'launcher.log') };
    await writeFile(options.pidfile, String(process.pid));
    const result = await ensureInjector(options);
    const oldPids = [...pids];
    pids.push(result.pid);
    assert.equal(result.action, 'started');
    assert.deepEqual(result.replaced.sort(), oldPids.slice(0, 2).sort());
    await waitExited(oldPids[0]);
    await waitExited(oldPids[1]);
    assert.equal(running(oldPids[2]), true);
    assert.equal(running(process.pid), true);
    assert.equal(findInjectors(port).length, 1);
  } finally {
    await Promise.all(pids.map(stop));
    await rm(root, { recursive: true, force: true });
  }
});

test('removes a verified legacy injector that ignores graceful shutdown', { skip: process.platform !== 'darwin' }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runstrip-stubborn-')));
  const pids = [];
  try {
    const old = await app(root, 'Stubborn Old');
    const resources = await app(root, 'Current');
    const port = await freePort();
    await writeFile(join(old, 'run.mjs'), 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);console.log("ready");');
    const child = spawn(process.execPath, [join(old, 'run.mjs'), '--port', String(port)]);
    pids.push(child.pid);
    await once(child.stdout, 'data');
    const result = await ensureInjector({
      resources, node: process.execPath, port,
      pidfile: join(root, 'injector.pid'), log: join(root, 'launcher.log'),
    });
    pids.push(result.pid);
    assert.deepEqual(result.forced, [child.pid]);
    await waitExited(child.pid);
    assert.equal(findInjectors(port).length, 1);
  } finally {
    await Promise.all(pids.map(stop));
    await rm(root, { recursive: true, force: true });
  }
});

test('the injector exits when Codex closes and removes only its own PID state', { skip: process.platform !== 'darwin' }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runstrip-lifetime-')));
  let requests = 0, child;
  const server = createServer((_req, res) => {
    requests++;
    res.setHeader('Content-Type', 'application/json');
    // A main target exists; non-loopback CDP is rejected without opening a connection.
    res.end(JSON.stringify([{ id: 'test', type: 'page', url: 'app://-/index.html',
      webSocketDebuggerUrl: 'ws://192.0.2.1/devtools/page/test' }]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, pidfile = join(root, 'injector.pid');
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL('../src/run.mjs', import.meta.url)), '--port', String(port), '--exit-grace', '3000'], {
      env: { ...process.env, CODEX_HOME: root, RUNSTRIP_PIDFILE: pidfile }, stdio: 'ignore',
    });
    await once(child, 'spawn');
    const exited = once(child, 'exit');
    await writeFile(pidfile, String(child.pid));
    await writeFile(`${pidfile}.json`, JSON.stringify({ pid: child.pid }));
    for (let i = 0; i < 60 && !requests; i++) await delay(50);
    assert.ok(requests > 0, 'injector never observed the main target');
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    const deadline = delay(8000, 'timeout', { ref: false });
    const result = await Promise.race([exited, deadline]);
    assert.notEqual(result, 'timeout', 'injector remained alive after Codex closed');
    assert.equal(result[0], 0);
    await assert.rejects(readFile(pidfile), { code: 'ENOENT' });
    await assert.rejects(readFile(`${pidfile}.json`), { code: 'ENOENT' });
  } finally {
    server.closeAllConnections();
    server.close();
    if (child && running(child.pid)) await stop(child.pid);
    await rm(root, { recursive: true, force: true });
  }
});

test('the injector survives a temporarily unreachable debug port', { skip: process.platform !== 'darwin' }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'runstrip-transient-')));
  let server, child, requests = 0;
  const targets = () => JSON.stringify([{ id: 'test', type: 'page', url: 'app://-/index.html',
    webSocketDebuggerUrl: 'ws://192.0.2.1/devtools/page/test' }]);
  const listen = async port => {
    server = createServer((_req, res) => {
      requests++;
      res.setHeader('Content-Type', 'application/json');
      res.end(targets());
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  };
  const close = async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  };
  await listen(0);
  const port = server.address().port;
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL('../src/run.mjs', import.meta.url)),
      '--port', String(port), '--exit-grace', '6000'], {
      env: { ...process.env, CODEX_HOME: root }, stdio: 'ignore',
    });
    await once(child, 'spawn');
    for (let i = 0; i < 60 && !requests; i++) await delay(50);
    assert.ok(requests > 0, 'injector never observed the main target');
    await close();
    await delay(4000);
    assert.equal(running(child.pid), true, 'injector exited during a brief port outage');
    await listen(port);
    await delay(3000);
    assert.equal(running(child.pid), true, 'injector did not remain alive after recovery');
    const recovered = requests;
    await delay(2000);
    assert.ok(requests > recovered, 'injector stopped polling after recovery');
    await close();
    const deadline = delay(20_000, 'timeout', { ref: false });
    const result = await Promise.race([once(child, 'exit'), deadline]);
    assert.notEqual(result, 'timeout', 'injector remained alive after Codex closed');
  } finally {
    if (child && running(child.pid)) await stop(child.pid);
    if (server?.listening) await close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
