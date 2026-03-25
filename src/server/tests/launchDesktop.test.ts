import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';

const { getBuildState, shouldBuild } = require('../../../scripts/launch-desktop') as {
  getBuildState: (projectRoot: string) => {
    missingOutputs: string[];
    sourceLatestMtimeMs: number;
    buildLatestMtimeMs: number;
  };
  shouldBuild: (state: {
    missingOutputs: string[];
    sourceLatestMtimeMs: number;
    buildLatestMtimeMs: number;
  }) => boolean;
};

const tempDirs: string[] = [];

function makeTempProject(): string {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pro5-launcher-'));
  tempDirs.push(projectRoot);
  return projectRoot;
}

function writeFile(projectRoot: string, relativePath: string, content: string, mtimeMs: number): void {
  const fullPath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  fs.utimesSync(fullPath, new Date(mtimeMs), new Date(mtimeMs));
}

afterEach(() => {
  for (const projectRoot of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe('launch desktop build detection', () => {
  test('requests a build when required outputs are missing', () => {
    const projectRoot = makeTempProject();
    writeFile(projectRoot, 'src/ui/app.tsx', 'console.log("hello");', 2_000);
    writeFile(projectRoot, 'package.json', '{}', 2_000);
    writeFile(projectRoot, 'tsconfig.json', '{}', 2_000);
    writeFile(projectRoot, 'tsconfig.electron.json', '{}', 2_000);
    writeFile(projectRoot, 'vite.config.mjs', 'export default {};', 2_000);

    const state = getBuildState(projectRoot);

    expect(state.missingOutputs.length).toBeGreaterThan(0);
    expect(shouldBuild(state)).toBe(true);
  });

  test('skips build when outputs exist and are newer than sources', () => {
    const projectRoot = makeTempProject();
    writeFile(projectRoot, 'src/ui/app.tsx', 'console.log("hello");', 2_000);
    writeFile(projectRoot, 'package.json', '{}', 2_000);
    writeFile(projectRoot, 'tsconfig.json', '{}', 2_000);
    writeFile(projectRoot, 'tsconfig.electron.json', '{}', 2_000);
    writeFile(projectRoot, 'vite.config.mjs', 'export default {};', 2_000);
    writeFile(projectRoot, 'dist/server/index.js', '// built', 3_000);
    writeFile(projectRoot, 'dist/ui/index.html', '<html></html>', 3_000);
    writeFile(projectRoot, 'dist/electron-main/main.js', '// built', 3_000);

    const state = getBuildState(projectRoot);

    expect(state.missingOutputs).toEqual([]);
    expect(shouldBuild(state)).toBe(false);
  });

  test('requests a build when sources are newer than outputs', () => {
    const projectRoot = makeTempProject();
    writeFile(projectRoot, 'src/ui/app.tsx', 'console.log("hello");', 4_000);
    writeFile(projectRoot, 'package.json', '{}', 4_000);
    writeFile(projectRoot, 'tsconfig.json', '{}', 4_000);
    writeFile(projectRoot, 'tsconfig.electron.json', '{}', 4_000);
    writeFile(projectRoot, 'vite.config.mjs', 'export default {};', 4_000);
    writeFile(projectRoot, 'dist/server/index.js', '// built', 3_000);
    writeFile(projectRoot, 'dist/ui/index.html', '<html></html>', 3_000);
    writeFile(projectRoot, 'dist/electron-main/main.js', '// built', 3_000);

    const state = getBuildState(projectRoot);

    expect(state.missingOutputs).toEqual([]);
    expect(shouldBuild(state)).toBe(true);
  });
});
