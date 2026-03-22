const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const electronBinary = require('electron');

const electronEntry = path.resolve(__dirname, '../dist/electron-main/main.js');
const appUrl = 'http://127.0.0.1:3210/ui/';
const readyUrl = 'http://127.0.0.1:3210/readyz';
const timeoutMs = 20000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOk(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}`);
  }
  return res;
}

async function fetchJson(url, options) {
  const res = await fetchOk(url, options);
  return res.json();
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

async function clearConflictingAppProcesses() {
  await runTaskkill('Pro5 Chrome Manager.exe');
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-local-smoke-'));
  await clearConflictingAppProcesses();
  const child = spawn(electronBinary, [electronEntry], {
    stdio: 'ignore',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATA_DIR: dataDir,
    },
    windowsHide: true,
  });

  const deadline = Date.now() + timeoutMs;
  let lastError = 'Local app smoke did not start probing yet';

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

        const configPayload = await fetchJson('http://127.0.0.1:3210/api/config');
        if (!configPayload.success || configPayload.data.onboardingCompleted !== false) {
          throw new Error('First-run config did not start with onboardingCompleted=false');
        }

        const profilesPayload = await fetchJson('http://127.0.0.1:3210/api/profiles');
        if (!profilesPayload.success || profilesPayload.data.length !== 0) {
          throw new Error('First-run app did not start with an empty profile list');
        }

        const supportPayload = await fetchJson('http://127.0.0.1:3210/api/support/status');
        if (!supportPayload.success || supportPayload.data.profileCount !== 0) {
          throw new Error('Support status did not report an empty first-run profile state');
        }

        const createRes = await fetch('http://127.0.0.1:3210/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Smoke Profile',
            runtime: 'auto',
          }),
        });
        if (createRes.status !== 201) {
          throw new Error(`Creating the first profile failed with status ${createRes.status}`);
        }
        const createdPayload = await createRes.json();
        if (!createdPayload.success || !createdPayload.data?.id) {
          throw new Error('Creating the first profile did not return a profile id');
        }

        const profilesAfterPayload = await fetchJson('http://127.0.0.1:3210/api/profiles');
        if (!profilesAfterPayload.success || profilesAfterPayload.data.length !== 1) {
          throw new Error('Profile list did not contain the first created profile');
        }

        const supportAfterPayload = await fetchJson('http://127.0.0.1:3210/api/support/status');
        if (!supportAfterPayload.success) {
          throw new Error('Failed to load support status after creating the first profile');
        }
        if (supportAfterPayload.data.profileCount !== 1) {
          throw new Error('Support status did not update profileCount after first profile creation');
        }
        if (supportAfterPayload.data.usageMetrics.profileCreates < 1) {
          throw new Error('Support status did not record profile creation usage metrics');
        }

        const runtimesPayload = await fetchJson('http://127.0.0.1:3210/api/runtimes');
        if (!runtimesPayload.success) {
          throw new Error('Failed to load runtime list during local smoke');
        }

        const availableRuntime = Array.isArray(runtimesPayload.data)
          ? runtimesPayload.data.find((runtime) => runtime.available)
          : null;

        let launchVerified = false;
        let skippedLaunchReason = null;

        if (availableRuntime) {
          const startRes = await fetch(`http://127.0.0.1:3210/api/profiles/${createdPayload.data.id}/start`, {
            method: 'POST',
          });

          if (startRes.status !== 201) {
            const startBody = await startRes.text();
            throw new Error(`Starting the first profile failed with status ${startRes.status}: ${startBody}`);
          }

          const instancesPayload = await fetchJson('http://127.0.0.1:3210/api/instances');
          if (!instancesPayload.success || !Array.isArray(instancesPayload.data)) {
            throw new Error('Failed to load instances after starting the first profile');
          }

          const runningInstance = instancesPayload.data.find((instance) => instance.profileId === createdPayload.data.id);
          if (!runningInstance || runningInstance.status !== 'running') {
            throw new Error('The first profile did not reach running state after launch');
          }

          const stopRes = await fetch(`http://127.0.0.1:3210/api/profiles/${createdPayload.data.id}/stop`, {
            method: 'POST',
          });
          if (!stopRes.ok) {
            throw new Error(`Stopping the first profile failed with status ${stopRes.status}`);
          }

          launchVerified = true;
        } else {
          skippedLaunchReason = 'No available runtime detected on this machine';
        }

        console.log(JSON.stringify({
          readyUrl,
          appUrl,
          pid: child.pid,
          backendStatus: ready.status,
          dataDir,
          firstProfileId: createdPayload.data.id,
          launchVerified,
          skippedLaunchReason,
        }, null, 2));
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await sleep(500);
      }
    }

    throw new Error(`Local app did not become ready within ${timeoutMs}ms. Last error: ${lastError}`);
  } finally {
    await killTree(child);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
