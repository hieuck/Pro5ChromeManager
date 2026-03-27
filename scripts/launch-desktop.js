const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { SERVER_ENTRY_CANDIDATES, resolveExistingServerEntry } = require('./build-paths');

const REQUIRED_BUILD_OUTPUTS = [
  ...SERVER_ENTRY_CANDIDATES,
  path.join('dist', 'ui', 'index.html'),
  path.join('dist', 'electron-main', 'main.js'),
];

const SOURCE_PATHS = [
  'src',
  'package.json',
  'tsconfig.json',
  'tsconfig.electron.json',
  'vite.config.mjs',
];

function getLatestMtimeMs(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }

  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latest = 0;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    latest = Math.max(latest, getLatestMtimeMs(path.join(targetPath, entry.name)));
  }

  return latest;
}

function getBuildState(projectRoot) {
  const { relativePath: serverEntry } = resolveExistingServerEntry(projectRoot);
  const requiredOutputs = REQUIRED_BUILD_OUTPUTS.filter((relativePath) => (
    !SERVER_ENTRY_CANDIDATES.includes(relativePath)
  ));
  requiredOutputs.unshift(serverEntry);

  const missingOutputs = requiredOutputs.filter((relativePath) => (
    !fs.existsSync(path.join(projectRoot, relativePath))
  ));

  const sourceLatestMtimeMs = SOURCE_PATHS.reduce((latest, relativePath) => (
    Math.max(latest, getLatestMtimeMs(path.join(projectRoot, relativePath)))
  ), 0);

  const buildLatestMtimeMs = requiredOutputs.reduce((latest, relativePath) => (
    Math.max(latest, getLatestMtimeMs(path.join(projectRoot, relativePath)))
  ), 0);

  return {
    missingOutputs,
    sourceLatestMtimeMs,
    buildLatestMtimeMs,
  };
}

function shouldBuild(state) {
  if (state.missingOutputs.length > 0) {
    return true;
  }

  return state.sourceLatestMtimeMs > state.buildLatestMtimeMs;
}

function runCommand(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const needsShell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      windowsHide: false,
      env,
      shell: needsShell,
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const nodeModulesPath = path.join(projectRoot, 'node_modules');
  const checkOnly = process.argv.includes('--check');

  if (!fs.existsSync(nodeModulesPath)) {
    console.error('Thieu dependencies. Hay chay "npm install" truoc khi mo app bang 1 click launcher nay.');
    process.exit(1);
  }

  const state = getBuildState(projectRoot);
  if (shouldBuild(state)) {
    const reason = state.missingOutputs.length > 0
      ? `missing build outputs: ${state.missingOutputs.join(', ')}`
      : 'source files changed after the last build';

    console.log(`[launcher] Building desktop app because ${reason}.`);
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await runCommand(npmCommand, ['run', 'build'], projectRoot);
  } else {
    console.log('[launcher] Build is fresh. Launching app directly.');
  }

  if (checkOnly) {
    console.log('[launcher] Check complete. Desktop app is launchable.');
    return;
  }

  await runCommand(process.execPath, [path.join(projectRoot, 'scripts', 'run-electron-local.js')], projectRoot, {
    ...process.env,
    NODE_ENV: 'development',
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  getBuildState,
  getLatestMtimeMs,
  shouldBuild,
};
