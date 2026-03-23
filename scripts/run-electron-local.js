const { spawn } = require('child_process');
const path = require('path');
const electronBinary = require('electron');

const electronEntry = path.resolve(__dirname, '../dist/electron-main/main.js');

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
  await runTaskkill('electron.exe');
}

async function main() {
  await clearConflictingAppProcesses();

  const child = spawn(electronBinary, [electronEntry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

