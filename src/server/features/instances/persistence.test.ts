import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Instance } from '../../../shared/contracts';
import { logger } from '../../core/logging/logger';
import { processManager } from './processManager';
import { persistInstances, persistRunningEntries, reconcilePersistedInstances } from './persistence';

describe('instance persistence', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro5-persistence-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('persists instances into a newly created directory tree', async () => {
    const instancesPath = path.join(tempDir, 'state', 'instances.json');
    const instances: Instance[] = [
      {
        profileId: 'profile-1',
        profileName: 'Profile 1',
        runtime: 'chrome.exe',
        pid: 1_111,
        remoteDebuggingPort: 41_111,
        userDataDir: 'E:/profiles/1',
        launchMode: 'native',
        status: 'running',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastHealthCheckAt: null,
      },
    ];

    await persistInstances(instancesPath, instances);

    await expect(fs.readFile(instancesPath, 'utf-8')).resolves.toBe(JSON.stringify(instances, null, 2));
  });

  it('persists running entries by flattening the in-memory map', async () => {
    const instancesPath = path.join(tempDir, 'instances.json');
    const running = new Map([
      ['profile-1', {
        instance: {
          profileId: 'profile-1',
          profileName: 'Profile 1',
          runtime: 'chrome.exe',
          pid: 1_111,
          remoteDebuggingPort: 41_111,
          userDataDir: 'E:/profiles/1',
          launchMode: 'native' as const,
          status: 'running' as const,
          startedAt: '2026-01-01T00:00:00.000Z',
          lastHealthCheckAt: null,
        },
        process: {} as never,
        proxyCleanup: null,
      }],
    ]);

    await persistRunningEntries(instancesPath, running);

    const persisted = JSON.parse(await fs.readFile(instancesPath, 'utf-8')) as Instance[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.profileId).toBe('profile-1');
  });

  it('reconciles persisted running instances into stale ones when the process no longer exists', async () => {
    const instancesPath = path.join(tempDir, 'instances.json');
    const initial: Instance[] = [
      {
        profileId: 'profile-1',
        profileName: 'Profile 1',
        runtime: 'chrome.exe',
        pid: 1_111,
        remoteDebuggingPort: 41_111,
        userDataDir: 'E:/profiles/1',
        launchMode: 'native',
        status: 'running',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastHealthCheckAt: null,
      },
      {
        profileId: 'profile-2',
        profileName: 'Profile 2',
        runtime: 'chrome.exe',
        pid: 2_222,
        remoteDebuggingPort: 42_222,
        userDataDir: 'E:/profiles/2',
        launchMode: 'native',
        status: 'stopped',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastHealthCheckAt: null,
      },
    ];
    await fs.writeFile(instancesPath, JSON.stringify(initial, null, 2), 'utf-8');
    vi.spyOn(processManager, 'exists').mockImplementation((pid) => pid !== 1_111);

    await reconcilePersistedInstances(instancesPath);

    const reconciled = JSON.parse(await fs.readFile(instancesPath, 'utf-8')) as Instance[];
    expect(reconciled[0]?.status).toBe('stale');
    expect(reconciled[1]?.status).toBe('stopped');
  });

  it('ignores missing persistence files', async () => {
    const instancesPath = path.join(tempDir, 'missing', 'instances.json');

    await expect(reconcilePersistedInstances(instancesPath)).resolves.toBeUndefined();
  });

  it('warns when loading persisted state fails for reasons other than ENOENT', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));

    await reconcilePersistedInstances(path.join(tempDir, 'instances.json'));

    expect(warnSpy).toHaveBeenCalledWith('InstanceManager: failed to load instances.json', {
      error: 'denied',
    });
  });
});
