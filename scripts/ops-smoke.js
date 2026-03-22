const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

async function waitForServer(baseUrl, timeoutMs) {
  const startedAt = Date.now();
  let lastError = 'Server did not respond yet.';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const healthRes = await fetch(`${baseUrl}/health`);
      if (!healthRes.ok) {
        lastError = `/health returned ${healthRes.status}`;
      } else {
        const readyRes = await fetch(`${baseUrl}/readyz`);
        if (!readyRes.ok) {
          lastError = `/readyz returned ${readyRes.status}`;
        } else {
          const readyJson = await readyRes.json();
          if (readyJson.status === 'ready') {
            return readyJson;
          }
          lastError = readyJson.error || 'Server is not ready yet.';
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Smoke check timed out: ${lastError}`);
}

async function main() {
  const smokeDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pro5-smoke-'));
  const port = 33210;
  const host = '127.0.0.1';
  const configPath = path.join(smokeDir, 'config.json');

  const config = {
    configVersion: 1,
    onboardingCompleted: false,
    uiLanguage: 'en',
    locale: 'en-US',
    timezoneId: 'UTC',
    defaultRuntime: 'auto',
    headless: false,
    windowTitleSuffixEnabled: true,
    profilesDir: path.join(smokeDir, 'profiles'),
    api: { host, port },
    sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
    runtimes: {
      smoke: {
        label: 'Smoke Runtime',
        executablePath: process.execPath,
      },
    },
  };

  await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  const child = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      DATA_DIR: smokeDir,
      NODE_ENV: 'development',
      PRO5_OFFLINE_SECRET: process.env.PRO5_OFFLINE_SECRET || 'smoke-test-offline-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  try {
    const readiness = await waitForServer(`http://${host}:${port}`, 20000);
    console.log('Smoke check passed');
    console.log(JSON.stringify(readiness, null, 2));
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    await fsp.rm(smokeDir, { recursive: true, force: true });
  }

  if (child.exitCode && child.exitCode !== 0) {
    throw new Error(`Smoke server exited unexpectedly.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
