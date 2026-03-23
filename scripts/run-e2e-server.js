const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data-e2e-test');
const host = '127.0.0.1';
const port = 33211;

async function prepareDataDir() {
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(path.join(dataDir, 'profiles'), { recursive: true });

  const config = {
    configVersion: 1,
    onboardingCompleted: false,
    uiLanguage: 'vi',
    locale: 'vi-VN',
    timezoneId: 'Asia/Saigon',
    defaultRuntime: 'auto',
    headless: false,
    windowTitleSuffixEnabled: true,
    profilesDir: path.join(dataDir, 'profiles'),
    api: { host, port },
    sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
    runtimes: {
      e2e: {
        label: 'E2E Runtime',
        executablePath: process.execPath,
      },
    },
  };

  await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

async function main() {
  await prepareDataDir();

  const child = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_ENV: 'development',
      PRO5_SERVER_AUTOSTART: 'true',
    },
    stdio: 'inherit',
  });

  const shutdown = () => {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', (code, signal) => {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
