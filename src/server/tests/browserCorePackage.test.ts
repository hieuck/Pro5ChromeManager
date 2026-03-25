import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';

const {
  packageBrowserCore,
} = require('../../../scripts/package-browser-core.js') as {
  packageBrowserCore: (args: {
    input: string;
    output: string;
    key: string;
    label: string;
    version: string;
    executable: string;
    channel: string;
    platform: string;
  }) => {
    packagePath: string;
    manifest: {
      key: string;
      label: string;
      version: string;
      executableRelativePath: string;
      channel: string;
      platform: string;
    };
    sizeBytes: number;
    sha256: string;
  };
};

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro5-browser-core-package-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('package-browser-core', () => {
  it('packages a runtime directory into an importable browser core archive', () => {
    const inputDir = makeTempDir();
    const outputDir = makeTempDir();
    fs.mkdirSync(path.join(inputDir, 'chrome-win'), { recursive: true });
    fs.writeFileSync(path.join(inputDir, 'chrome-win', 'chrome.exe'), 'stub-binary\n');
    fs.writeFileSync(path.join(inputDir, 'chrome-win', 'icudtl.dat'), 'icu-data\n');

    const result = packageBrowserCore({
      input: inputDir,
      output: outputDir,
      key: 'pro5-chromium',
      label: 'Pro5 Chromium',
      version: '127.0.0-preview',
      executable: 'chrome-win/chrome.exe',
      channel: 'preview',
      platform: 'win32',
    });

    expect(result.packagePath).toBe(path.join(outputDir, 'pro5-chromium-127.0.0-preview-win32.zip'));
    expect(result.manifest.executableRelativePath).toBe('chrome-win/chrome.exe');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(result.packagePath)).toBe(true);

    const extractDir = makeTempDir();
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${result.packagePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe' },
    );

    const manifest = JSON.parse(fs.readFileSync(path.join(extractDir, 'browser-core.json'), 'utf8')) as {
      key: string;
      executableRelativePath: string;
    };
    expect(manifest.key).toBe('pro5-chromium');
    expect(manifest.executableRelativePath).toBe('chrome-win/chrome.exe');
    expect(fs.existsSync(path.join(extractDir, 'runtime', 'chrome-win', 'chrome.exe'))).toBe(true);
    expect(fs.existsSync(path.join(extractDir, 'runtime', 'chrome-win', 'icudtl.dat'))).toBe(true);
  });
});
