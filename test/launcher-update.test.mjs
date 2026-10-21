import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);

for (const stalePid of [false, true]) {
  test(`launcher starts update checking in background ${stalePid ? 'without trusting an unrelated PID' : 'after starting the injector'}`,
    { skip: process.platform !== 'darwin' }, async () => {
      const root = await mkdtemp(join(tmpdir(), 'runstrip-launcher-'));
      const server = createServer((_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end('[{"url":"app://-/index.html"}]');
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const port = server.address().port;
        const contents = join(root, 'Runstrip.app/Contents');
        const resources = join(contents, 'Resources');
        const macos = join(contents, 'MacOS');
        const home = join(root, 'home');
        const state = join(home, 'Library/Application Support/Codex fork');
        await mkdir(join(resources, 'node/bin'), { recursive: true });
        await mkdir(macos, { recursive: true });
        await mkdir(state, { recursive: true });
        await mkdir(join(root, 'ChatGPT.app'));
        await symlink(process.execPath, join(resources, 'node/bin/node'));
        const launcher = join(macos, 'Codex Runstrip');
        await copyFile(new URL('../src/launcher.sh', import.meta.url), launcher);
        await copyFile(new URL('../src/injector-process.mjs', import.meta.url), join(resources, 'injector-process.mjs'));
        await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.codex.runstrip</string>
<key>CFBundleShortVersionString</key><string>1.2.0</string>
<key>CodexRunstripEdition</key><string>lite</string>
<key>CodexRunstripArchitecture</key><string>arm64</string>
</dict></plist>`);
        await writeFile(join(resources, 'run.mjs'), `
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.INJECTOR_MARKER, 'started');
`);
        const marker = join(root, 'update.json');
        const done = join(root, 'update.done');
        await writeFile(join(resources, 'check-update.mjs'), `
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.UPDATE_MARKER, JSON.stringify(process.argv.slice(2)));
await new Promise(resolve => setTimeout(resolve, 1500));
writeFileSync(process.env.UPDATE_DONE, 'done');
`);
        if (stalePid) await writeFile(join(state, `injector-${port}.pid`), String(process.pid));
        await exec('/bin/bash', [launcher], {
          env: {
            ...process.env, HOME: home, CODEX_APP_PATH: join(root, 'ChatGPT.app'),
            CODEX_FORK_PORTS: String(port), UPDATE_MARKER: marker,
            UPDATE_DONE: done, INJECTOR_MARKER: join(root, 'injector.started'),
          },
          timeout: 5000,
        });
        // A deliberately slow update helper must outlive the launcher.
        await assert.rejects(readFile(done), { code: 'ENOENT' });
        let args;
        for (let i = 0; i < 60; i++) {
          try { args = JSON.parse(await readFile(marker, 'utf8')); break; } catch {}
          await delay(50);
        }
        assert.deepEqual(args, ['1.2.0', 'lite', 'arm64']);
        const log = await readFile(join(home, 'Library/Logs/Codex fork/launcher.log'), 'utf8');
        assert.ok(log.includes('启动当前版本注入器'), log);
        {
          for (let i = 0; i < 60; i++) {
            try { await readFile(join(root, 'injector.started')); break; } catch {}
            await delay(50);
          }
          assert.equal(await readFile(join(root, 'injector.started'), 'utf8'), 'started');
        }
        for (let i = 0; i < 60; i++) {
          try { await readFile(done); break; } catch {}
          await delay(50);
        }
        assert.equal(await readFile(done, 'utf8'), 'done');
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await rm(root, { recursive: true, force: true });
      }
    });
}
