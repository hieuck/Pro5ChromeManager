import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { dataPath } from '../fs/dataPaths';
import { resolveLogDir } from './logger';

const originalNodeEnv = process.env['NODE_ENV'];
const originalDataDir = process.env['DATA_DIR'];

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env['NODE_ENV'];
  } else {
    process.env['NODE_ENV'] = originalNodeEnv;
  }

  if (originalDataDir === undefined) {
    delete process.env['DATA_DIR'];
  } else {
    process.env['DATA_DIR'] = originalDataDir;
  }
});

describe('resolveLogDir', () => {
  it('isolates test logs in a temp directory when DATA_DIR is not set', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['DATA_DIR'];

    expect(resolveLogDir()).toBe(
      path.join(os.tmpdir(), 'pro5-test-logs', `pid-${process.pid}`),
    );
  });

  it('keeps configured data directories for test runs that provide DATA_DIR', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATA_DIR'] = path.join(os.tmpdir(), 'pro5-explicit-data');

    expect(resolveLogDir()).toBe(dataPath('logs'));
  });

  it('keeps normal runtime log paths outside test mode', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['DATA_DIR'];

    expect(resolveLogDir()).toBe(dataPath('logs'));
  });
});
