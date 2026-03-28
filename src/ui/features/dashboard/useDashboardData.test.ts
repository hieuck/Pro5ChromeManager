import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  capturedWsHandler: null as null | ((event: { type: string }) => void),
  stateCursor: 0,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useEffect: (effect: () => void | Promise<void>) => {
    void effect();
  },
  useState: <T>(initial: T) => {
    const setter = vi.fn();
    mocks.stateSetters[mocks.stateCursor] = setter;
    mocks.stateCursor += 1;
    return [initial, setter] as const;
  },
}));

vi.mock('../../api/client', () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock('../../shared/hooks/useWebSocket', () => ({
  useWebSocket: (handler: (event: { type: string }) => void) => {
    mocks.capturedWsHandler = handler;
  },
}));

describe('useDashboardData', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiGet.mockReset();
    mocks.capturedWsHandler = null;
    mocks.stateCursor = 0;
    mocks.stateSetters = [];

    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({ success: true, data: [{ id: 'proxy-1' }] })
      .mockResolvedValueOnce({ success: true, data: [{ profileId: 'profile-1', status: 'running' }] })
      .mockResolvedValueOnce({ success: true, data: { diagnosticsReady: true } })
      .mockResolvedValueOnce({ success: true, data: { count: 1, incidents: [{ id: 'incident-1' }] } })
      .mockResolvedValueOnce({ success: true, data: { count: 1, entries: [{ id: 'feedback-1' }] } })
      .mockResolvedValueOnce({ success: true, data: [{ filename: 'backup-1.zip' }, { filename: 'backup-2.zip' }, { filename: 'backup-3.zip' }, { filename: 'backup-4.zip' }] })
      .mockResolvedValueOnce({ success: true, data: [{ key: 'chrome', available: true }] })
      .mockResolvedValueOnce({ success: true, data: [{ message: 'log-1', timestamp: undefined }, { message: 'log-2', timestamp: '2026-03-27T12:00:00.000Z' }] })
      .mockResolvedValueOnce({ success: true, data: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({ success: true, data: [{ id: 'proxy-1' }] })
      .mockResolvedValueOnce({ success: true, data: [{ profileId: 'profile-1', status: 'running' }] })
      .mockResolvedValueOnce({ success: true, data: { diagnosticsReady: true } })
      .mockResolvedValueOnce({ success: true, data: { count: 1, incidents: [{ id: 'incident-1' }] } })
      .mockResolvedValueOnce({ success: true, data: { count: 1, entries: [{ id: 'feedback-1' }] } })
      .mockResolvedValueOnce({ success: true, data: [{ filename: 'backup-1.zip' }] })
      .mockResolvedValueOnce({ success: true, data: [{ key: 'chrome', available: true }] })
      .mockResolvedValueOnce({ success: true, data: [{ message: 'log-3', timestamp: '2026-03-27T12:30:00.000Z' }] });
  });

  it('loads dashboard data, normalizes payloads, and refreshes on websocket events', async () => {
    const { useDashboardData } = await import('./useDashboardData');
    const hook = useDashboardData();

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(9);
    });
    await vi.waitFor(() => {
      expect(mocks.stateSetters[0]).toHaveBeenCalledWith([{ id: 'profile-1' }]);
    });

    expect(hook.loading).toBe(false);
    expect(mocks.apiGet.mock.calls.map(([path]) => path)).toEqual([
      '/api/profiles',
      '/api/proxies',
      '/api/instances',
      '/api/support/status',
      '/api/support/incidents?limit=5',
      '/api/support/feedback?limit=3',
      '/api/backups',
      '/api/runtimes',
      '/api/logs',
    ]);
    expect(mocks.stateSetters[1]).toHaveBeenCalledWith([{ id: 'proxy-1' }]);
    expect(mocks.stateSetters[2]).toHaveBeenCalledWith({
      'profile-1': {
        profileId: 'profile-1',
        status: 'running',
      },
    });
    expect(mocks.stateSetters[3]).toHaveBeenCalledWith({ diagnosticsReady: true });
    expect(mocks.stateSetters[4]).toHaveBeenCalledWith([{ id: 'incident-1' }]);
    expect(mocks.stateSetters[5]).toHaveBeenCalledWith([{ id: 'feedback-1' }]);
    expect(mocks.stateSetters[6]).toHaveBeenCalledWith([
      { filename: 'backup-1.zip' },
      { filename: 'backup-2.zip' },
      { filename: 'backup-3.zip' },
    ]);
    expect(mocks.stateSetters[7]).toHaveBeenCalledWith([{ key: 'chrome', available: true }]);
    expect(mocks.stateSetters[8]).toHaveBeenCalledWith([
      { message: 'log-1', timestamp: '' },
      { message: 'log-2', timestamp: '2026-03-27T12:00:00.000Z' },
    ]);
    expect(mocks.stateSetters[9]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[9]).toHaveBeenNthCalledWith(2, false);

    mocks.capturedWsHandler?.({ type: 'instance:started' });

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(18);
    });
  });

  it('ignores websocket events that are unrelated to instance status changes', async () => {
    const { useDashboardData } = await import('./useDashboardData');
    useDashboardData();

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(9);
    });

    mocks.capturedWsHandler?.({ type: 'other:event' });

    expect(mocks.apiGet).toHaveBeenCalledTimes(9);
  });
});
