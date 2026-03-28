import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUrl: vi.fn(),
  kill: vi.fn(),
  recordSessionCheck: vi.fn().mockResolvedValue(undefined),
  waitForCDP: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../core/browser/cdpWaiter', () => ({
  waitForCDP: mocks.waitForCDP,
}));

vi.mock('../../core/telemetry/UsageMetricsManager', () => ({
  usageMetricsManager: {
    recordSessionCheck: mocks.recordSessionCheck,
  },
}));

vi.mock('./processManager', () => ({
  processManager: {
    kill: mocks.kill,
    spawn: vi.fn(),
  },
}));

vi.mock('./cdpClient', () => ({
  cdpClient: {
    getCurrentUrl: mocks.getCurrentUrl,
  },
}));

describe('session check', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getCurrentUrl.mockReset();
    mocks.kill.mockReset();
    mocks.recordSessionCheck.mockReset();
    mocks.recordSessionCheck.mockResolvedValue(undefined);
    mocks.waitForCDP.mockReset();
    mocks.waitForCDP.mockResolvedValue(undefined);
  });

  it('returns spawn_failed immediately when the child has no pid', async () => {
    const proxyCleanup = vi.fn();
    const { runSessionCheck } = await import('./sessionCheck');

    await expect(runSessionCheck({
      child: { pid: undefined } as never,
      port: 9222,
      timeoutMs: 5_000,
      targetUrl: 'https://example.com',
      proxyCleanup,
    })).resolves.toEqual({ result: 'error', reason: 'spawn_failed' });

    expect(proxyCleanup).toHaveBeenCalledOnce();
    expect(mocks.waitForCDP).not.toHaveBeenCalled();
    expect(mocks.kill).not.toHaveBeenCalled();
  });

  it('classifies a matching final url as logged_in and tears the child down', async () => {
    vi.useFakeTimers();
    mocks.getCurrentUrl.mockResolvedValue('https://example.com/dashboard');
    const proxyCleanup = vi.fn();
    const { runSessionCheck } = await import('./sessionCheck');
    const child = { pid: 321 } as never;

    try {
      await expect(runSessionCheck({
        child,
        port: 9222,
        timeoutMs: 5_000,
        targetUrl: 'https://example.com/home',
        proxyCleanup,
      })).resolves.toEqual({ result: 'logged_in' });

      expect(mocks.recordSessionCheck).toHaveBeenCalledWith('logged_in');
      expect(mocks.kill).toHaveBeenCalledWith(child, 'SIGTERM');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mocks.kill).toHaveBeenCalledWith(child, 'SIGKILL');
      expect(proxyCleanup).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('classifies login redirects as logged_out', async () => {
    vi.useFakeTimers();
    mocks.getCurrentUrl.mockResolvedValue('https://example.com/auth/login');
    const { runSessionCheck } = await import('./sessionCheck');
    const child = { pid: 654 } as never;

    try {
      await expect(runSessionCheck({
        child,
        port: 9222,
        timeoutMs: 5_000,
        targetUrl: 'https://example.com/home',
        proxyCleanup: null,
      })).resolves.toEqual({ result: 'logged_out' });

      expect(mocks.recordSessionCheck).toHaveBeenCalledWith('logged_out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('records errors when CDP bootstrapping fails', async () => {
    vi.useFakeTimers();
    mocks.waitForCDP.mockRejectedValueOnce(new Error('timeout'));
    const proxyCleanup = vi.fn();
    const { runSessionCheck } = await import('./sessionCheck');
    const child = { pid: 999 } as never;

    try {
      await expect(runSessionCheck({
        child,
        port: 9222,
        timeoutMs: 5_000,
        targetUrl: 'https://example.com/home',
        proxyCleanup,
      })).resolves.toEqual({ result: 'error', reason: 'timeout' });

      expect(mocks.recordSessionCheck).toHaveBeenCalledWith('error');
      expect(mocks.kill).toHaveBeenCalledWith(child, 'SIGTERM');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mocks.kill).toHaveBeenCalledWith(child, 'SIGKILL');
      expect(proxyCleanup).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
