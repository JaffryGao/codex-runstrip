#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

const execFileAsync = promisify(execFile);
const RELEASE_API = 'https://api.github.com/repos/JaffryGao/codex-runstrip/releases/latest';
const RELEASE_PAGE = 'https://github.com/JaffryGao/codex-runstrip/releases/tag/';

export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const numbers = match[1].split('.').map(Number);
  if (numbers.some(n => !Number.isSafeInteger(n))) return null;
  return { numbers, prerelease: match[2]?.split('.') ?? null };
}

function comparePrerelease(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] === b[i]) continue;
    const an = /^\d+$/.test(a[i]), bn = /^\d+$/.test(b[i]);
    if (an && bn) return Number(a[i]) < Number(b[i]) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  const length = Math.max(left.numbers.length, right.numbers.length);
  for (let i = 0; i < length; i++) {
    const x = left.numbers[i] ?? 0;
    const y = right.numbers[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

export function packageAssetName(edition, arch, version) {
  if (edition !== 'lite') return null;
  const architecture = arch === 'arm64' ? 'arm64'
    : arch === 'x86_64' || arch === 'x64' ? 'x86_64' : null;
  return architecture ? `Codex-Runstrip-macos-${architecture}.zip` : null;
}

export async function checkForUpdate({
  currentVersion,
  edition,
  arch,
  fetchRelease = globalThis.fetch,
  showPrompt = async () => false,
  openRelease = async () => {},
}) {
  try {
    if (!parseVersion(currentVersion) || !packageAssetName(edition, arch, currentVersion)) return false;
    const response = await fetchRelease(RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Codex-Runstrip',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response?.ok) return false;

    const release = await response.json();
    const latestVersion = release?.tag_name;
    if (release?.draft || release?.prerelease) return false;
    if (compareVersions(latestVersion, currentVersion) !== 1) return false;
    const assetName = packageAssetName(edition, arch, latestVersion);
    if (!Array.isArray(release.assets) || !release.assets.some(asset => asset?.name === assetName)) return false;

    const shouldOpen = await showPrompt({ currentVersion, latestVersion, edition });
    if (!shouldOpen) return false;
    await openRelease(`${RELEASE_PAGE}${encodeURIComponent(latestVersion)}`);
    return true;
  } catch {
    return false;
  }
}

async function showUpdatePrompt({ currentVersion, latestVersion, edition }) {
  const editionName = 'Codex Runstrip';
  const script = `
on run argv
  set currentVersion to item 1 of argv
  set latestVersion to item 2 of argv
  set editionName to item 3 of argv
  set promptText to editionName & " 当前版本为 " & currentVersion & "，GitHub 上有新版本 " & latestVersion & "。" & return & return & "是否前往 Release 页面查看对应版本？"
  try
    set answer to display dialog promptText buttons {"稍后", "查看 Release"} default button "查看 Release" with title "Codex Runstrip 更新"
    return button returned of answer is "查看 Release"
  on error number -128
    return false
  end try
end run`;
  const { stdout } = await execFileAsync('/usr/bin/osascript', [
    '-e', script, currentVersion, latestVersion, editionName,
  ]);
  return stdout.trim() === 'true';
}

async function openRelease(url) {
  await execFileAsync('/usr/bin/open', [url], { timeout: 10_000 });
}

let entrypoint;
try { entrypoint = pathToFileURL(realpathSync(process.argv[1])).href; } catch {}
if (import.meta.url === entrypoint) {
  const [currentVersion, edition, arch] = process.argv.slice(2);
  await new Promise(resolve => setTimeout(resolve, 6000));
  await checkForUpdate({
    currentVersion,
    edition,
    arch,
    showPrompt: showUpdatePrompt,
    openRelease,
  });
}
