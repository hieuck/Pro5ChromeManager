const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { SERVER_ENTRY_CANDIDATES, resolveExistingServerEntry } = require('./build-paths');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const built = args.has('--built');

function exists(...parts) {
  return fs.existsSync(path.join(rootDir, ...parts));
}

function existsAny(candidates) {
  return candidates.some((candidate) => exists(...candidate));
}

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

const checks = [
  {
    level: 'error',
    ok: exists('landing', 'index.html'),
    message: 'landing/index.html is missing.',
  },
  {
    level: 'error',
    ok: exists('landing', 'support.html'),
    message: 'landing/support.html is missing.',
  },
  {
    level: 'error',
    ok: exists('landing', 'privacy.html'),
    message: 'landing/privacy.html is missing.',
  },
  {
    level: 'error',
    ok: exists('landing', 'terms.html'),
    message: 'landing/terms.html is missing.',
  },
  {
    level: 'error',
    ok: exists('.github', 'ISSUE_TEMPLATE', 'support.yml'),
    message: '.github/ISSUE_TEMPLATE/support.yml is missing.',
  },
  {
    level: 'error',
    ok: existsAny([
      ['src', 'server', 'features', 'support', 'router.ts'],
      ['src', 'server', 'routes', 'support.ts'],
    ]),
    message: 'Support API routes are missing.',
  },
  {
    level: 'warning',
    ok: Boolean(env('CSC_LINK')),
    message: 'CSC_LINK is not configured; Windows installers will be unsigned.',
  },
];

if (built) {
  checks.push(
    {
      level: 'error',
      ok: existsAny(SERVER_ENTRY_CANDIDATES.map((candidate) => candidate.split(/[\\/]/))),
      message: 'Built server entrypoint is missing. Run npm run build first.',
    },
    {
      level: 'error',
      ok: exists('dist', 'electron-main', 'main.js'),
      message: 'dist/electron-main/main.js is missing. Run npm run build first.',
    },
    {
      level: 'error',
      ok: exists('dist', 'ui', 'index.html'),
      message: 'dist/ui/index.html is missing. Run npm run build first.',
    },
  );
}

const failures = [];
const warnings = [];

for (const check of checks) {
  if (check.ok) continue;
  if (check.level === 'error') failures.push(check.message);
  else warnings.push(check.message);
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const request = http.get(url, (response) => {
        const status = response.statusCode ?? 0;
        response.resume();
        resolve(status >= 200 && status < 400);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function runRuntimeHealthCheck() {
  const serverEntry = resolveExistingServerEntry(rootDir);
  const tempDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pro5-preflight-'));
  const host = '127.0.0.1';
  const port = 33219;

  const config = {
    configVersion: 1,
    onboardingCompleted: false,
    uiLanguage: 'en',
    locale: 'en-US',
    timezoneId: 'UTC',
    defaultRuntime: 'smoke',
    headless: true,
    windowTitleSuffixEnabled: true,
    profilesDir: path.join(tempDataDir, 'profiles'),
    api: { host, port },
    sessionCheck: { enabledByDefault: false, headless: true, timeoutMs: 30000 },
    runtimes: {
      smoke: {
        label: 'Smoke Runtime',
        executablePath: process.execPath,
      },
    },
  };

  await fsp.mkdir(path.join(tempDataDir, 'profiles'), { recursive: true });
  await fsp.writeFile(path.join(tempDataDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

  const child = spawn(process.execPath, [serverEntry.absolutePath], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PRO5_SERVER_AUTOSTART: 'true',
      DATA_DIR: tempDataDir,
    },
    stdio: 'ignore',
  });

  try {
    const healthReady = await waitForHttp(`http://${host}:${port}/health`, 15000);
    const readinessReady = await waitForHttp(`http://${host}:${port}/readyz`, 15000);
    if (!healthReady || !readinessReady) {
      throw new Error('Runtime health checks failed for /health or /readyz');
    }
  } finally {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await fsp.rm(tempDataDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('Release preflight report');
  console.log(`- strict mode: ${strict ? 'on' : 'off'}`);
  console.log(`- build artifact check: ${built ? 'on' : 'off'}`);

  if (strict && built && failures.length === 0) {
    try {
      await runRuntimeHealthCheck();
      console.log('- runtime check: ok');
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (warnings.length > 0) {
    console.log('- warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.error('- failures:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log('- status: ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
