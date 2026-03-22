const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`Dev package verification failed: ${message}`);
  process.exit(1);
}

const appDir = path.resolve(process.cwd(), 'dist', 'electron', 'win-unpacked');
const exePath = path.join(appDir, 'Pro5 Chrome Manager.exe');
const asarPath = path.join(appDir, 'resources', 'app.asar');
const iconPath = path.join(appDir, 'resources', 'resources', 'icon.ico');

if (!fs.existsSync(appDir)) fail(`missing app directory: ${appDir}`);
if (!fs.existsSync(exePath)) fail(`missing executable: ${exePath}`);
if (!fs.existsSync(asarPath)) fail(`missing app.asar: ${asarPath}`);
if (!fs.existsSync(iconPath)) fail(`missing packaged icon: ${iconPath}`);

const exeStat = fs.statSync(exePath);
const asarStat = fs.statSync(asarPath);

if (exeStat.size <= 0) fail('executable has zero size');
if (asarStat.size <= 0) fail('app.asar has zero size');

console.log('Dev package verification passed');
console.log(JSON.stringify({
  appDir,
  executable: exePath,
  executableSize: exeStat.size,
  asarSize: asarStat.size,
  icon: iconPath,
}, null, 2));
