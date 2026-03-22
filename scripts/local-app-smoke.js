const { spawn } = require('child_process');
const path = require('path');
const electronBinary = require('electron');

const electronEntry = path.resolve(__dirname, '../dist/electron-main/main.js');
const appUrl = 'http://127.0.0.1:3210/ui/';
const readyUrl = 'http://127.0.0.1:3210/readyz';
const timeoutMs = 20000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  return res;
}

function killTree(child) {
  if (!child.pid) return Promise.resolve();

  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    killer.on('exit', () => resolve());
    killer.on('error', () => {
      child.kill('SIGTERM');
      resolve();
    });
  });
}

async function main() {
  const child = spawn(electronBinary, [electronEntry], {
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
    windowsHide: true,
  });

  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      try {
        const readyRes = await fetchOk(readyUrl);
        const ready = await readyRes.json();
        if (ready.status !== 'ready') {
          throw new Error(`Backend status is ${String(ready.status)}`);
        }

        const uiRes = await fetchOk(appUrl);
        const html = await uiRes.text();
        if (!html.toLowerCase().includes('<!doctype html>') || !html.includes('<div id="root"></div>')) {
          throw new Error('UI shell response is not the expected HTML document');
        }

        console.log(JSON.stringify({
          readyUrl,
          appUrl,
          pid: child.pid,
          backendStatus: ready.status,
        }, null, 2));
        return;
      } catch {
        await sleep(500);
      }
    }

    throw new Error(`Local app did not become ready within ${timeoutMs}ms`);
  } finally {
    await killTree(child);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
