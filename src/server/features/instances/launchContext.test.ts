import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, ProxyConfig } from '../../../shared/contracts';

const mocks = vi.hoisted(() => ({
  buildProxyConfig: vi.fn(),
  configGet: vi.fn(),
  findFreePort: vi.fn(),
  prepareExtension: vi.fn(),
  resolveAppPath: vi.fn(),
  resolveEnabledExtensionPaths: vi.fn(),
  resolveRuntime: vi.fn(),
}));

vi.mock('../runtimes/RuntimeManager', () => ({
  runtimeManager: {
    resolveRuntime: mocks.resolveRuntime,
  },
}));

vi.mock('../proxies/ProxyManager', () => ({
  proxyManager: {
    buildProxyConfig: mocks.buildProxyConfig,
  },
}));

vi.mock('../profiles/FingerprintEngine', () => ({
  fingerprintEngine: {
    prepareExtension: mocks.prepareExtension,
  },
}));

vi.mock('../extensions/ExtensionManager', () => ({
  extensionManager: {
    resolveEnabledExtensionPaths: mocks.resolveEnabledExtensionPaths,
  },
}));

vi.mock('../config/ConfigManager', () => ({
  configManager: {
    get: mocks.configGet,
  },
}));

vi.mock('../../core/network/portScanner', () => ({
  findFreePort: mocks.findFreePort,
}));

vi.mock('../../core/fs/dataPaths', () => ({
  resolveAppPath: mocks.resolveAppPath,
}));

describe('buildLaunchContext', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.buildProxyConfig.mockReset();
    mocks.configGet.mockReset();
    mocks.findFreePort.mockReset();
    mocks.prepareExtension.mockReset();
    mocks.resolveAppPath.mockReset();
    mocks.resolveEnabledExtensionPaths.mockReset();
    mocks.resolveRuntime.mockReset();

    mocks.resolveRuntime.mockResolvedValue('/runtimes/chrome.exe');
    mocks.prepareExtension.mockResolvedValue('/extensions/fingerprint');
    mocks.resolveEnabledExtensionPaths.mockResolvedValue(['/extensions/a', '/extensions/b']);
    mocks.findFreePort.mockResolvedValue(45555);
    mocks.resolveAppPath.mockImplementation((input: string) => path.join('E:/workspace/data-root', input));
    mocks.configGet.mockReturnValue({
      profilesDir: 'profiles',
      headless: false,
    });
  });

  function createProfile(proxy: ProxyConfig | null): Profile {
    return {
      id: 'profile-1',
      schemaVersion: 1,
      name: 'Profile One',
      notes: '',
      tags: [],
      group: 'team-a',
      owner: 'owner-a',
      runtime: 'chrome',
      proxy,
      extensionIds: ['ext-1', 'ext-2'],
      bookmarks: [],
      fingerprint: {
        userAgent: 'Mozilla/5.0',
        platform: 'Win32',
        vendor: 'Google Inc.',
        language: 'vi-VN',
        languages: ['vi-VN', 'en-US'],
        hardwareConcurrency: 8,
        deviceMemory: 8,
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: 'Asia/Ho_Chi_Minh',
        canvas: { noise: 0.1, seed: 1 },
        webgl: { renderer: 'Renderer', vendor: 'Vendor', noise: 0.2 },
        audio: { noise: 0.3 },
        fonts: ['Arial'],
        webrtcPolicy: 'proxy_only',
      },
      createdAt: '2026-03-27T00:00:00.000Z',
      updatedAt: '2026-03-27T00:00:00.000Z',
      lastUsedAt: null,
      totalSessions: 0,
    };
  }

  it('builds a launch context with proxy configuration, managed extensions, and override headless mode', async () => {
    const { buildLaunchContext } = await import('./launchContext');
    const proxyCleanup = vi.fn();
    mocks.buildProxyConfig.mockResolvedValue({
      flag: '--proxy-server=socks5://127.0.0.1:9000',
      cleanup: proxyCleanup,
    });

    const context = await buildLaunchContext(createProfile({
      id: 'proxy-1',
      type: 'socks5',
      host: '127.0.0.1',
      port: 9000,
    }), 'E:/runtime-data', true);

    expect(mocks.resolveRuntime).toHaveBeenCalledWith('chrome');
    expect(mocks.buildProxyConfig).toHaveBeenCalledWith(expect.objectContaining({ id: 'proxy-1' }));
    expect(mocks.prepareExtension).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({ webrtcPolicy: 'proxy_only' }),
      'E:/runtime-data',
      {
        profileId: 'profile-1',
        profileName: 'Profile One',
        profileGroup: 'team-a',
        profileOwner: 'owner-a',
      },
    );
    expect(mocks.resolveEnabledExtensionPaths).toHaveBeenCalledWith(['ext-1', 'ext-2']);
    expect(context).toEqual({
      executablePath: '/runtimes/chrome.exe',
      proxyCleanup,
      remoteDebuggingPort: 45555,
      userDataDir: path.join('E:/workspace/data-root', 'profiles', 'profile-1'),
      headless: true,
      flags: expect.arrayContaining([
        `--user-data-dir=${path.join('E:/workspace/data-root', 'profiles', 'profile-1')}`,
        '--remote-debugging-port=45555',
        '--proxy-server=socks5://127.0.0.1:9000',
        '--webrtc-ip-handling-policy=proxy_only',
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions-except=/extensions/fingerprint,/extensions/a,/extensions/b',
        '--load-extension=/extensions/fingerprint,/extensions/a,/extensions/b',
      ]),
    });
  });

  it('falls back to config headless mode and default WebRTC policy when proxy is not configured', async () => {
    const { buildLaunchContext } = await import('./launchContext');
    mocks.configGet.mockReturnValue({
      profilesDir: 'profiles',
      headless: true,
    });

    const profileWithoutWebRtcPolicy = {
      ...createProfile(null),
      fingerprint: {
        ...createProfile(null).fingerprint,
        webrtcPolicy: undefined,
      },
    } as unknown as Profile;

    const context = await buildLaunchContext(profileWithoutWebRtcPolicy, 'E:/runtime-data');

    expect(mocks.buildProxyConfig).not.toHaveBeenCalled();
    expect(context.proxyCleanup).toBeNull();
    expect(context.headless).toBe(true);
    expect(context.flags).toContain('--webrtc-ip-handling-policy=disable_non_proxied_udp');
    expect(context.flags.some((flag) => flag.startsWith('--proxy-server='))).toBe(false);
  });
});
