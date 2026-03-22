import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  buildManifest,
  verifyArtifacts,
  writeArtifacts,
} = require('../../../scripts/release-artifacts.js') as {
  buildManifest: (dir: string, packageJson: { name: string; version: string }) => { artifacts: Array<{ name: string }> };
  verifyArtifacts: (dir: string) => number;
  writeArtifacts: (dir: string, manifest: unknown) => void;
};

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pro5-release-artifacts-'));
}

function seedArtifacts(dir: string) {
  fs.writeFileSync(path.join(dir, 'Pro5 Setup 1.0.0.exe'), 'installer\n');
  fs.writeFileSync(path.join(dir, 'latest.yml'), 'metadata\n');
  fs.writeFileSync(path.join(dir, 'latest.yml.blockmap'), 'blockmap\n');
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('release-artifacts', () => {
  it('writes manifest and checksums for packaged artifacts', () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    seedArtifacts(dir);

    const manifest = buildManifest(dir, { name: 'anti-detect-browser-manager', version: '1.0.0' });
    writeArtifacts(dir, manifest);

    const manifestFile = JSON.parse(fs.readFileSync(path.join(dir, 'RELEASE_MANIFEST.json'), 'utf8'));
    const checksumFile = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8');

    expect(manifestFile.artifacts).toHaveLength(3);
    expect(manifestFile.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual([
      'latest.yml',
      'latest.yml.blockmap',
      'Pro5 Setup 1.0.0.exe',
    ].sort((a, b) => a.localeCompare(b)));
    expect(checksumFile).toContain('latest.yml');
    expect(checksumFile).toContain('Pro5 Setup 1.0.0.exe');
  });

  it('verifies generated release metadata against packaged artifacts', () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    seedArtifacts(dir);

    const manifest = buildManifest(dir, { name: 'anti-detect-browser-manager', version: '1.0.0' });
    writeArtifacts(dir, manifest);

    expect(verifyArtifacts(dir)).toBe(3);
  });

  it('fails verification when an artifact changes after checksum generation', () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    seedArtifacts(dir);

    const manifest = buildManifest(dir, { name: 'anti-detect-browser-manager', version: '1.0.0' });
    writeArtifacts(dir, manifest);
    fs.writeFileSync(path.join(dir, 'latest.yml'), 'tampered\n');

    expect(() => verifyArtifacts(dir)).toThrow(/mismatch/i);
  });
});
