const { spawn } = require('child_process');
const path = require('path');
const electronBinary = require('electron');

const electronEntry = path.resolve(__dirname, '../dist/electron-main/main.js');
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

