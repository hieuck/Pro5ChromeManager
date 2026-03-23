const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const appDir = path.resolve(process.cwd(), 'dist', 'electron', 'win-unpacked');
const exePath = path.join(appDir, 'Pro5 Chrome Manager.exe');
const readyUrl = 'http://127.0.0.1:3210/readyz';
const appUrl = 'http://127.0.0.1:3210/ui/';
const timeoutMs = 45000;
const requestTimeoutMs = 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runTaskkill(imageName) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/im', imageName, '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.on('exit', () => resolve());
    killer.on('error', () => resolve());
  });
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

async function fetchOk(url, options) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  return res;
}

async function fetchJson(url, options) {
  const res = await fetchOk(url, options);
  return res.json();
}

async function clearConflictingAppProcesses() {
  await runTaskkill('Pro5 Chrome Manager.exe');
  await runTaskkill('electron.exe');
}

async function readSmokeLogTail(dataDir) {
  try {
    const logPath = path.join(dataDir, 'logs', 'electron-main.log');
    const content = await fs.readFile(logPath, 'utf-8');
    return content.split(/\r?\n/).filter(Boolean).slice(-8);
  } catch {
    return [];
  }
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-packaged-smoke-'));
  await clearConflictingAppProcesses();

  const child = spawn(exePath, [], {
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATA_DIR: dataDir,
    },
    windowsHide: true,
  });
  let childExit = null;

  child.once('exit', (code, signal) => {
    childExit = { code, signal };
  });

  const deadline = Date.now() + timeoutMs;
  let lastError = 'Packaged app smoke did not start probing yet';

  try {
    while (Date.now() < deadline) {
      try {
        if (childExit) {
          const logTail = await readSmokeLogTail(dataDir);
          throw new Error(
            `Packaged app exited before smoke completed (code=${String(childExit.code)}, signal=${String(childExit.signal)}). ` +
            `Recent main log: ${logTail.join(' | ') || 'none'}`,
          );
        }

        const ready = await fetchJson(readyUrl);
        if (ready.status !== 'ready') {
          throw new Error(`Backend status is ${String(ready.status)}`);
        }
        if (ready.dataDir !== dataDir) {
          throw new Error(`Ready endpoint is serving a different app dataDir: ${String(ready.dataDir)}`);
        }

        const uiRes = await fetchOk(appUrl);
        const html = await uiRes.text();
        if (!html.toLowerCase().includes('<!doctype html>') || !html.includes('<div id="root"></div>')) {
          throw new Error('Packaged UI shell response is not the expected HTML document');
        }

        const supportPayload = await fetchJson('http://127.0.0.1:3210/api/support/status');
        if (!supportPayload.success) {
          throw new Error('Packaged app support status did not load successfully');
        }

        console.log(JSON.stringify({
          executable: exePath,
          pid: child.pid,
          readyUrl,
          appUrl,
          backendStatus: ready.status,
          dataDir,
          warnings: supportPayload.data?.warnings ?? [],
        }, null, 2));
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await sleep(750);
      }
    }

    const logTail = await readSmokeLogTail(dataDir);
    throw new Error(
      `Packaged app did not become ready within ${timeoutMs}ms. Last error: ${lastError}. ` +
      `Recent main log: ${logTail.join(' | ') || 'none'}`,
    );
  } finally {
    await killTree(child);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
