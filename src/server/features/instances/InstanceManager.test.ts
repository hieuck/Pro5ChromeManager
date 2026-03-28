import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'child_process';
import type { Instance, ManagedCookie, Profile } from '../../../shared/contracts';

const mocks = vi.hoisted(() => {
  type FakeChildProcess = EventEmitter & {
    pid?: number;
  };

  const createChildProcess = (pid?: number): FakeChildProcess => {
    const child = new EventEmitter() as FakeChildProcess;
    child.pid = pid;
    return child;
  };

  return {
    activityAppend: vi.fn(),
    buildLaunchContext: vi.fn(),
    cdpGetPageWebSocketUrl: vi.fn(),
    cdpPing: vi.fn(),
    cdpSendCommandSequence: vi.fn(),
    cdpToCookie: vi.fn((cookie: ManagedCookie) => ({ name: cookie.name })),
    configGet: vi.fn(() => ({
      sessionCheck: { timeoutMs: 45_000 },
    })),
    cookieList: vi.fn(),
    createChildProcess,
    dataPath: vi.fn((...segments: string[]) => ['E:/data', ...segments].join('/')),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    persistRunningEntries: vi.fn(),
    processKill: vi.fn(),
    processSpawn: vi.fn(),
    processWaitForExit: vi.fn(),
    profileGet: vi.fn(),
    profileUpdateLastUsed: vi.fn(),
    reconcilePersistedInstances: vi.fn(),
    recordProfileLaunch: vi.fn(),
    runSessionCheck: vi.fn(),
    waitForCDP: vi.fn(),
    wsBroadcast: vi.fn(),
  };
});

vi.mock('../../core/fs/dataPaths', () => ({
  dataPath: mocks.dataPath,
}));

vi.mock('../../core/browser/cdpWaiter', () => ({
  waitForCDP: mocks.waitForCDP,
}));

vi.mock('../../core/logging/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}));

vi.mock('../../core/realtime/wsServer', () => ({
  wsServer: {
    broadcast: mocks.wsBroadcast,
  },
}));

vi.mock('../profiles/ProfileManager', () => ({
  profileManager: {
    getProfile: mocks.profileGet,
    updateLastUsed: mocks.profileUpdateLastUsed,
  },
}));

vi.mock('../profiles/CookieManager', () => ({
  cookieManager: {
    listCookies: mocks.cookieList,
  },
}));

vi.mock('../config/ConfigManager', () => ({
  configManager: {
    get: mocks.configGet,
  },
}));

vi.mock('../../core/telemetry/UsageMetricsManager', () => ({
  usageMetricsManager: {
    recordProfileLaunch: mocks.recordProfileLaunch,
  },
}));

vi.mock('./activityLogger', () => ({
  activityLogger: {
    append: mocks.activityAppend,
  },
}));

vi.mock('./cdpClient', () => ({
  cdpClient: {
    getPageWebSocketUrl: mocks.cdpGetPageWebSocketUrl,
    ping: mocks.cdpPing,
    sendCommandSequence: mocks.cdpSendCommandSequence,
    toCDPCookie: mocks.cdpToCookie,
  },
}));

vi.mock('./processManager', () => ({
  processManager: {
    kill: mocks.processKill,
    spawn: mocks.processSpawn,
    waitForExit: mocks.processWaitForExit,
  },
}));

vi.mock('./launchContext', () => ({
  buildLaunchContext: mocks.buildLaunchContext,
}));

vi.mock('./persistence', () => ({
  persistRunningEntries: mocks.persistRunningEntries,
  reconcilePersistedInstances: mocks.reconcilePersistedInstances,
}));

vi.mock('./sessionCheck', () => ({
  runSessionCheck: mocks.runSessionCheck,
}));

describe('InstanceManager', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.activityAppend.mockReset();
    mocks.activityAppend.mockResolvedValue(undefined);
    mocks.buildLaunchContext.mockReset();
    mocks.cdpGetPageWebSocketUrl.mockReset();
    mocks.cdpGetPageWebSocketUrl.mockResolvedValue(null);
    mocks.cdpPing.mockReset();
    mocks.cdpPing.mockResolvedValue(true);
    mocks.cdpSendCommandSequence.mockReset();
    mocks.cdpSendCommandSequence.mockResolvedValue(undefined);
    mocks.cdpToCookie.mockReset();
    mocks.cdpToCookie.mockImplementation((cookie: ManagedCookie) => ({ name: cookie.name }));
    mocks.configGet.mockReset();
    mocks.configGet.mockReturnValue({
      sessionCheck: { timeoutMs: 45_000 },
    });
    mocks.cookieList.mockReset();
    mocks.cookieList.mockResolvedValue([]);
    mocks.dataPath.mockClear();
    mocks.loggerInfo.mockClear();
    mocks.loggerWarn.mockClear();
    mocks.persistRunningEntries.mockReset();
    mocks.persistRunningEntries.mockResolvedValue(undefined);
    mocks.processKill.mockReset();
    mocks.processSpawn.mockReset();
    mocks.processWaitForExit.mockReset();
    mocks.processWaitForExit.mockResolvedValue(undefined);
    mocks.profileGet.mockReset();
    mocks.profileUpdateLastUsed.mockReset();
    mocks.profileUpdateLastUsed.mockResolvedValue(undefined);
    mocks.reconcilePersistedInstances.mockReset();
    mocks.reconcilePersistedInstances.mockResolvedValue(undefined);
    mocks.recordProfileLaunch.mockReset();
    mocks.recordProfileLaunch.mockResolvedValue(undefined);
    mocks.runSessionCheck.mockReset();
    mocks.runSessionCheck.mockResolvedValue({ result: 'logged_in' });
    mocks.waitForCDP.mockReset();
    mocks.waitForCDP.mockResolvedValue(undefined);
    mocks.wsBroadcast.mockClear();
  });

  it('initializes persisted state reconciliation and starts the health loop', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');

    await manager.initialize();

    expect(mocks.reconcilePersistedInstances).toHaveBeenCalledWith('E:/state/instances.json');
    expect(mocks.loggerInfo).toHaveBeenCalledWith('InstanceManager initialized');
    manager.stopHealthCheckLoop();
  });

  it('launches a profile, applies cookies, persists state, and records process exits', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');
    const child = mocks.createChildProcess(4321);
    const proxyCleanup = vi.fn();

    mocks.profileGet.mockReturnValue({ id: 'profile-1', name: 'Primary' } as Profile);
    mocks.buildLaunchContext.mockResolvedValue({
      executablePath: 'chrome.exe',
      flags: ['--flag'],
      headless: false,
      proxyCleanup,
      remoteDebuggingPort: 9222,
      userDataDir: 'E:/profiles/profile-1',
    });
    mocks.processSpawn.mockReturnValue(child as unknown as ChildProcess);
    mocks.cookieList.mockResolvedValue([
      {
        name: 'session',
        value: 'token',
        domain: '.example.com',
        path: '/',
        expires: null,
        httpOnly: true,
        secure: true,
        sameSite: null,
      },
    ] satisfies ManagedCookie[]);
    mocks.cdpGetPageWebSocketUrl.mockResolvedValue('ws://page-target');

    const instance = await manager.launchInstance('profile-1');

    expect(instance).toMatchObject({
      pid: 4321,
      profileId: 'profile-1',
      profileName: 'Primary',
      remoteDebuggingPort: 9222,
      runtime: 'chrome.exe',
      status: 'running',
    } satisfies Partial<Instance>);
    expect(mocks.waitForCDP).toHaveBeenCalledWith(9222, 30_000);
    expect(mocks.cdpSendCommandSequence).toHaveBeenCalledWith('ws://page-target', [
      { method: 'Network.enable' },
      {
        method: 'Network.setCookies',
        params: {
          cookies: [{ name: 'session' }],
        },
      },
    ]);
    expect(mocks.persistRunningEntries).toHaveBeenCalledWith('E:/state/instances.json', expect.any(Map));
    expect(mocks.profileUpdateLastUsed).toHaveBeenCalledWith('profile-1');
    expect(mocks.recordProfileLaunch).toHaveBeenCalledOnce();
    expect(mocks.wsBroadcast).toHaveBeenCalledWith({
      type: 'instance:started',
      payload: { profileId: 'profile-1', status: 'running', port: 9222 },
    });

    child.emit('exit');
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.activityAppend).toHaveBeenCalledWith(
      'profile-1',
      instance.startedAt,
      expect.any(String),
    );
    expect(mocks.wsBroadcast).toHaveBeenCalledWith({
      type: 'instance:stopped',
      payload: { profileId: 'profile-1', status: 'stopped' },
    });
    expect(manager.getStatus('profile-1')).toBe('not_running');
  });

  it('fails fast when the browser process does not return a pid', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');
    const proxyCleanup = vi.fn();

    mocks.profileGet.mockReturnValue({ id: 'profile-1', name: 'Primary' } as Profile);
    mocks.buildLaunchContext.mockResolvedValue({
      executablePath: 'chrome.exe',
      flags: ['--flag'],
      headless: false,
      proxyCleanup,
      remoteDebuggingPort: 9222,
      userDataDir: 'E:/profiles/profile-1',
    });
    mocks.processSpawn.mockReturnValue(mocks.createChildProcess(undefined) as unknown as ChildProcess);

    await expect(manager.launchInstance('profile-1')).rejects.toThrow('Failed to spawn browser process (no PID)');
    expect(proxyCleanup).toHaveBeenCalledOnce();
  });

  it('kills the child process and cleans proxy state when CDP never becomes ready', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');
    const child = mocks.createChildProcess(4321);
    const proxyCleanup = vi.fn();

    mocks.profileGet.mockReturnValue({ id: 'profile-1', name: 'Primary' } as Profile);
    mocks.buildLaunchContext.mockResolvedValue({
      executablePath: 'chrome.exe',
      flags: ['--flag'],
      headless: false,
      proxyCleanup,
      remoteDebuggingPort: 9222,
      userDataDir: 'E:/profiles/profile-1',
    });
    mocks.processSpawn.mockReturnValue(child as unknown as ChildProcess);
    mocks.waitForCDP.mockRejectedValueOnce(new Error('timeout'));

    await expect(manager.launchInstance('profile-1')).rejects.toThrow('Browser did not become ready: timeout');
    expect(mocks.processKill).toHaveBeenCalledWith(child, 'SIGKILL');
    expect(proxyCleanup).toHaveBeenCalledOnce();
  });

  it('stops a running instance and records the stop activity', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');
    const child = mocks.createChildProcess(5000) as unknown as ChildProcess;
    const proxyCleanup = vi.fn();

    (manager as unknown as {
      running: Map<string, { instance: Instance; process: ChildProcess; proxyCleanup: (() => void) | null }>;
    }).running.set('profile-1', {
      instance: {
        profileId: 'profile-1',
        profileName: 'Primary',
        runtime: 'chrome.exe',
        pid: 5000,
        remoteDebuggingPort: 9222,
        userDataDir: 'E:/profiles/profile-1',
        launchMode: 'native',
        status: 'running',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastHealthCheckAt: null,
      },
      process: child,
      proxyCleanup,
    });

    await manager.stopInstance('profile-1');

    expect(mocks.processKill).toHaveBeenCalledWith(child, 'SIGTERM');
    expect(mocks.processWaitForExit).toHaveBeenCalledWith(child, 3_000);
    expect(proxyCleanup).toHaveBeenCalledOnce();
    expect(mocks.activityAppend).toHaveBeenCalledWith(
      'profile-1',
      '2026-01-01T00:00:00.000Z',
      expect.any(String),
    );
    expect(mocks.wsBroadcast).toHaveBeenCalledWith({
      type: 'instance:stopped',
      payload: { profileId: 'profile-1', status: 'stopped' },
    });
  });

  it('delegates session checks through a temporary launch context and returns user-facing errors', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');
    const child = mocks.createChildProcess(9090);
    const proxyCleanup = vi.fn();

    mocks.profileGet.mockReturnValue({ id: 'profile-1', name: 'Primary' } as Profile);
    mocks.buildLaunchContext.mockResolvedValue({
      executablePath: 'chrome.exe',
      flags: ['--headless'],
      headless: true,
      proxyCleanup,
      remoteDebuggingPort: 9444,
      userDataDir: 'E:/profiles/profile-1',
    });
    mocks.processSpawn.mockReturnValue(child as unknown as ChildProcess);
    mocks.runSessionCheck.mockResolvedValue({ result: 'logged_out' });

    await expect(manager.sessionCheck('profile-1', 'https://example.com')).resolves.toEqual({ result: 'logged_out' });
    expect(mocks.runSessionCheck).toHaveBeenCalledWith({
      child,
      port: 9444,
      proxyCleanup,
      targetUrl: 'https://example.com',
      timeoutMs: 45_000,
    });

    mocks.profileGet.mockReturnValue(undefined);
    await expect(manager.sessionCheck('missing', 'https://example.com')).resolves.toEqual({
      result: 'error',
      reason: 'profile_not_found',
    });
  });

  it('updates health status transitions and persists only when a status changed', async () => {
    const { InstanceManager } = await import('./InstanceManager');
    const manager = new InstanceManager('E:/state/instances.json', 'E:/state');

    (manager as unknown as {
      runHealthChecks: () => Promise<void>;
      running: Map<string, { instance: Instance; process: ChildProcess; proxyCleanup: (() => void) | null }>;
    }).running.set('profile-1', {
      instance: {
        profileId: 'profile-1',
        profileName: 'Primary',
        runtime: 'chrome.exe',
        pid: 1234,
        remoteDebuggingPort: 9222,
        userDataDir: 'E:/profiles/profile-1',
        launchMode: 'native',
        status: 'running',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastHealthCheckAt: null,
      },
      process: mocks.createChildProcess(1234) as unknown as ChildProcess,
      proxyCleanup: null,
    });
    (manager as unknown as {
      running: Map<string, { instance: Instance; process: ChildProcess; proxyCleanup: (() => void) | null }>;
    }).running.set('profile-2', {
      instance: {
        profileId: 'profile-2',
        profileName: 'Secondary',
        runtime: 'chrome.exe',
        pid: 5678,
        remoteDebuggingPort: 9333,
        userDataDir: 'E:/profiles/profile-2',
        launchMode: 'native',
        status: 'unreachable',
        startedAt: '2026-01-01T00:00:00.000Z',
        lastHealthCheckAt: null,
      },
      process: mocks.createChildProcess(5678) as unknown as ChildProcess,
      proxyCleanup: null,
    });
    mocks.cdpPing.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await (manager as unknown as { runHealthChecks: () => Promise<void> }).runHealthChecks();

    expect(manager.getStatus('profile-1')).toBe('unreachable');
    expect(manager.getStatus('profile-2')).toBe('running');
    expect(mocks.wsBroadcast).toHaveBeenCalledWith({
      type: 'instance:status-changed',
      payload: { profileId: 'profile-1', status: 'unreachable', port: 9222 },
    });
    expect(mocks.wsBroadcast).toHaveBeenCalledWith({
      type: 'instance:status-changed',
      payload: { profileId: 'profile-2', status: 'running', port: 9333 },
    });
    expect(mocks.persistRunningEntries).toHaveBeenCalledWith('E:/state/instances.json', expect.any(Map));
  });
});
