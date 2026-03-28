const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const http = require('http');
const archiver = require('archiver');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { resolveExistingServerEntry } = require('./build-paths');

const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data-e2e-test');
const host = '127.0.0.1';
const port = 33211;

async function prepareDataDir() {
  const e2eExecutablePath = chromium.executablePath();

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
        executablePath: e2eExecutablePath,
      },
    },
  };

  await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

async function prepareMockStorePackage() {
  const fixturePath = path.join(repoRoot, 'src', 'e2e', 'fixtures', 'sample-extension');
  const zipPath = path.join(repoRoot, 'src', 'e2e', 'fixtures', 'sample-extension-store.zip');
  const crxPath = path.join(repoRoot, 'src', 'e2e', 'fixtures', 'sample-extension-store.crx');

  await fs.rm(zipPath, { force: true });
  await fs.rm(crxPath, { force: true });

  await zipDirectory(fixturePath, zipPath);

  const zipBytes = await fs.readFile(zipPath);
  const header = Buffer.alloc(16);
  header.write('Cr24', 0, 'ascii');
  header.writeUInt32LE(3, 4);
  header.writeUInt32LE(0, 8);
  header.writeUInt32LE(0, 12);
  await fs.writeFile(crxPath, Buffer.concat([header, zipBytes]));
  await fs.rm(zipPath, { force: true });
  return crxPath;
}

async function zipDirectory(sourceDir, outputZipPath) {
  await new Promise((resolve, reject) => {
    const output = fsSync.createWriteStream(outputZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

async function main() {
  await prepareDataDir();
  const mockStorePath = await prepareMockStorePackage();
  const mockStoreServer = http.createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith('/mock-store/download')) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    const payload = await fs.readFile(mockStorePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-chrome-extension');
    res.end(payload);
  });

  await new Promise((resolve) => {
    mockStoreServer.listen(0, host, resolve);
  });
  const mockStoreAddress = mockStoreServer.address();
  if (!mockStoreAddress || typeof mockStoreAddress === 'string') {
    throw new Error('Failed to bind mock extension store server');
  }
  const mockStoreBaseUrl = `http://${host}:${mockStoreAddress.port}`;
  const serverEntry = resolveExistingServerEntry(repoRoot);

  const child = spawn(process.execPath, [serverEntry.relativePath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      NODE_ENV: 'development',
      PRO5_SERVER_AUTOSTART: 'true',
      PRO5_EXTENSION_STORE_DOWNLOAD_URL_TEMPLATE: `${mockStoreBaseUrl}/mock-store/download?id={id}`,
    },
    stdio: 'inherit',
  });

  const shutdown = () => {
    fs.rm(mockStorePath, { force: true }).catch(() => undefined);
    mockStoreServer.close();
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', (code, signal) => {
    fs.rm(mockStorePath, { force: true }).catch(() => undefined);
    mockStoreServer.close();
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
