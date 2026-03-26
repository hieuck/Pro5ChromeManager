import { describe, it, expect, vi } from 'vitest';
import net from 'net';
import { findFreePort } from '../../core/network/portScanner';
import { InstanceManager } from './InstanceManager';
import { profileManager } from '../profiles/ProfileManager';
import { Profile, ProxyConfig } from '../../../shared/contracts';
import { runtimeManager } from '../runtimes/RuntimeManager';

async function bindServer(server: net.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Server did not expose a TCP address'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

// ─── P5: Instance Port Uniqueness ─────────────────────────────────────────────
// Validates: Requirements 10.1 — all running instances must have unique ports

describe('P5 — Port uniqueness (portScanner)', () => {
  it('findFreePort returns a port in range 40000–49999', async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThanOrEqual(40000);
    expect(port).toBeLessThanOrEqual(49999);
  });

  it('findFreePort does not return an already-bound port', async () => {
    const server = net.createServer();
    const boundPort = await bindServer(server, 0);
    const rangeEnd = boundPort + 20;

    try {
      const found = await findFreePort(boundPort, rangeEnd);
      expect(found).not.toBe(boundPort);
      expect(found).toBeGreaterThanOrEqual(boundPort);
      expect(found).toBeLessThanOrEqual(rangeEnd);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('multiple sequential calls return different ports when previous is still bound', async () => {
    const port1 = await findFreePort(40100, 40120);

    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(port1, '127.0.0.1', resolve));

    try {
      const port2 = await findFreePort(40100, 40120);
      expect(port2).not.toBe(port1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('throws when no free port exists in range', async () => {
    const servers: net.Server[] = [];
    const range = [41000, 41001, 41002];

    for (const p of range) {
      const s = net.createServer();
      await new Promise<void>((resolve) => {
        s.once('error', () => resolve()); // port may already be in use — skip
        s.listen(p, '127.0.0.1', resolve);
      });
      servers.push(s);
    }

    try {
      await expect(findFreePort(41000, 41002)).rejects.toThrow('No free port found');
    } finally {
      await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
    }
  });
});

// ─── InstanceManager — sessionCheck no_runtime ────────────────────────────────

describe('InstanceManager — sessionCheck returns error when no runtime', () => {
  it('returns { result: "error", reason: "no_runtime" } when runtime unavailable', async () => {
    const mockProfile: Profile = {
      id: 'test-profile',
      schemaVersion: 1,
      name: 'Test',
      notes: '',
      tags: [],
      group: null,
      owner: null,
      runtime: 'auto',
      proxy: null,
      extensionIds: [],
      bookmarks: [],
      fingerprint: {
        userAgent: 'Mozilla/5.0',
        platform: 'Win32',
        vendor: 'Google Inc.',
        language: 'en-US',
        languages: ['en-US'],
        hardwareConcurrency: 4,
        deviceMemory: 4,
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        timezone: 'Asia/Ho_Chi_Minh',
        canvas: { noise: 0.001, seed: 12345 },
        webgl: { renderer: 'ANGLE', vendor: 'Google Inc.', noise: 0.001 },
        audio: { noise: 0.0001 },
        fonts: ['Arial'],
        webrtcPolicy: 'disable_non_proxied_udp',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: null,
      totalSessions: 0,
    };

    vi.spyOn(profileManager, 'getProfile').mockReturnValue(mockProfile);
    vi.spyOn(runtimeManager, 'resolveRuntime').mockRejectedValue(new Error('No available runtime found'));

    const manager = new InstanceManager();
    const result = await manager.sessionCheck('test-profile', 'https://example.com');

    expect(result.result).toBe('error');
    expect(result.reason).toBe('no_runtime');

    vi.restoreAllMocks();
  });
});

// ─── InstanceManager — launchInstance duplicate guard ─────────────────────────

describe('InstanceManager — launchInstance throws when already running', () => {
  it('throws if profile already has a running instance', async () => {
    const manager = new InstanceManager();

    const fakeInstance = {
      profileId: 'dup-profile',
      profileName: 'Dup',
      runtime: '/usr/bin/chrome',
      pid: 99999,
      remoteDebuggingPort: 40000,
      userDataDir: '/tmp/dup',
      launchMode: 'native' as const,
      status: 'running' as const,
      startedAt: new Date().toISOString(),
      lastHealthCheckAt: null,
    };

    // Inject fake running entry via type assertion
    (manager as unknown as { running: Map<string, unknown> }).running.set('dup-profile', {
      instance: fakeInstance,
      process: { kill: () => undefined, on: () => undefined, once: () => undefined, pid: 99999 },
      proxyCleanup: null,
    });

    await expect(manager.launchInstance('dup-profile')).rejects.toThrow('already running');
  });
});
