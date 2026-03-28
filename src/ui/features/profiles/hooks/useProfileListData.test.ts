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

vi.mock('../../../api/client', () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock('../../../shared/hooks/useWebSocket', () => ({
  useWebSocket: (handler: (event: { type: string }) => void) => {
    mocks.capturedWsHandler = handler;
  },
}));

describe('useProfileListData', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiGet.mockReset();
    mocks.capturedWsHandler = null;
    mocks.stateCursor = 0;
    mocks.stateSetters = [];
  });

  it('loads profile workspace data and refreshes profile and instance state from websocket events', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'profile-1', name: 'Alpha', tags: [], extensionIds: [], status: 'stopped', totalSessions: 0, schemaVersion: 1 }],
      })
      .mockResolvedValueOnce({ success: true, data: [{ id: 'proxy-1', type: 'http', host: '1.1.1.1', port: 8080 }] })
      .mockResolvedValueOnce({ success: true, data: [{ profileId: 'profile-1', status: 'running' }] })
      .mockResolvedValueOnce({ success: true, data: { onboardingCompleted: false } })
      .mockResolvedValueOnce({ success: true, data: [{ key: 'chrome', available: true }] })
      .mockResolvedValueOnce({ success: true, data: [{ id: 'ext-1', name: 'uBlock', version: null, enabled: true }] })
      .mockResolvedValueOnce({ success: true, data: [{ key: 'privacy', label: 'Privacy', extensionIds: ['ext-1'], extensionCount: 1 }] })
      .mockResolvedValueOnce({ success: true, data: [{ profileId: 'profile-1', status: 'stopped' }] })
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'profile-1', name: 'Alpha', tags: [], extensionIds: [], status: 'stopped', totalSessions: 0, schemaVersion: 1 }],
      });

    const { useProfileListData } = await import('./useProfileListData');
    const hook = useProfileListData();

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(7);
    });
    await vi.waitFor(() => {
      expect(mocks.stateSetters[0]).toHaveBeenCalledWith([
        { id: 'profile-1', name: 'Alpha', tags: [], extensionIds: [], status: 'stopped', totalSessions: 0, schemaVersion: 1 },
      ]);
    });

    expect(hook.loading).toBe(false);
    expect(hook.onboardingCompleted).toBe(true);
    expect(mocks.apiGet.mock.calls.map(([path]) => path)).toEqual([
      '/api/profiles',
      '/api/proxies',
      '/api/instances',
      '/api/config',
      '/api/runtimes',
      '/api/extensions',
      '/api/extensions/bundles',
    ]);
    expect(mocks.stateSetters[1]).toHaveBeenCalledWith([{ id: 'proxy-1', type: 'http', host: '1.1.1.1', port: 8080 }]);
    expect(mocks.stateSetters[2]).toHaveBeenCalledWith([{ key: 'chrome', available: true }]);
    expect(mocks.stateSetters[3]).toHaveBeenCalledWith([{ id: 'ext-1', name: 'uBlock', version: null, enabled: true }]);
    expect(mocks.stateSetters[4]).toHaveBeenCalledWith([{ key: 'privacy', label: 'Privacy', extensionIds: ['ext-1'], extensionCount: 1 }]);
    expect(mocks.stateSetters[5]).toHaveBeenCalledWith({
      'profile-1': {
        profileId: 'profile-1',
        status: 'running',
      },
    });
    expect(mocks.stateSetters[6]).toHaveBeenNthCalledWith(1, true);
    expect(mocks.stateSetters[6]).toHaveBeenNthCalledWith(2, false);
    expect(mocks.stateSetters[7]).toHaveBeenCalledWith(false);

    mocks.capturedWsHandler?.({ type: 'instance:started' });

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(9);
    });
    expect(mocks.stateSetters[5]).toHaveBeenLastCalledWith({
      'profile-1': {
        profileId: 'profile-1',
        status: 'stopped',
      },
    });
  });

  it('ignores websocket events that are unrelated to instance state and returns an empty runtime list on failure', async () => {
    mocks.apiGet
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: { onboardingCompleted: true } })
      .mockResolvedValueOnce({ success: false, error: 'Runtime load failed' })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: false, error: 'Runtime load failed' });

    const { useProfileListData } = await import('./useProfileListData');
    const hook = useProfileListData();

    await vi.waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledTimes(7);
    });

    mocks.capturedWsHandler?.({ type: 'profile:updated' });
    expect(mocks.apiGet).toHaveBeenCalledTimes(7);

    await expect(hook.fetchRuntimes()).resolves.toEqual([]);
    expect(mocks.stateSetters[2]).not.toHaveBeenCalled();
  });
});
