const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.join(repoRoot, '.browser-fork');
const reportPath = path.join(workspaceRoot, 'doctor-report.json');

async function safeExec(file, args) {
  try {
    const result = await execFileAsync(file, args, { windowsHide: true });
    return {
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

async function detectVisualStudio() {
  const programFiles = process.env['ProgramFiles(x86)'] || process.env['ProgramFiles'] || 'C:\\Program Files (x86)';
  const vswherePath = path.join(programFiles, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const stat = await fs.stat(vswherePath).catch(() => null);
  if (!stat) {
    return { ok: false, detail: 'vswhere.exe not found' };
  }

  const query = await safeExec(vswherePath, [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property',
    'installationPath',
  ]);

  return {
    ok: query.ok && Boolean(query.stdout),
    detail: query.ok ? (query.stdout || 'Visual Studio found but VC tools missing') : query.stderr,
  };
}

async function detectDiskSpace() {
  const currentDrive = path.parse(repoRoot).root.replace(/\\$/, '');
  const result = await safeExec('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${currentDrive}'" | Select-Object -ExpandProperty FreeSpace`,
  ]);

  if (!result.ok || !result.stdout) {
    return { ok: false, detail: result.stderr || 'Unable to detect free space' };
  }

  const freeBytes = Number(result.stdout);
  const freeGb = Number.isFinite(freeBytes) ? (freeBytes / (1024 ** 3)) : 0;
  return {
    ok: freeGb >= 120,
    detail: `${freeGb.toFixed(1)} GB free on ${currentDrive}`,
  };
}

async function main() {
  await fs.mkdir(workspaceRoot, { recursive: true });

  const checks = [
    {
      key: 'os',
      ok: process.platform === 'win32',
      detail: `${os.platform()} ${os.release()} ${os.arch()}`,
    },
    {
      key: 'node',
      ...(await (async () => {
        const major = Number(process.versions.node.split('.')[0] || '0');
        return {
          ok: major >= 18,
          detail: `Node ${process.versions.node}`,
        };
      })()),
    },
    {
      key: 'git',
      ...(await (async () => {
        const result = await safeExec('git', ['--version']);
        return {
          ok: result.ok,
          detail: result.ok ? result.stdout : result.stderr,
        };
      })()),
    },
    {
      key: 'python',
      ...(await (async () => {
        const result = await safeExec('python', ['--version']);
        return {
          ok: result.ok,
          detail: result.ok ? result.stdout : result.stderr,
        };
      })()),
    },
    {
      key: 'visualStudio',
      ...(await detectVisualStudio()),
    },
    {
      key: 'disk',
      ...(await detectDiskSpace()),
    },
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    ready: checks.every((check) => check.ok),
    checks,
    recommendation: checks.every((check) => check.ok)
      ? 'Machine is ready for Chromium fork bootstrap.'
      : 'Fix the failed checks before syncing Chromium.',
  };

  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf-8');

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
