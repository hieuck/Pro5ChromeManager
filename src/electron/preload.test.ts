import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS, PRELOAD_FALLBACK_VERSION, PRELOAD_GLOBAL_KEY } from './constants';

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mocks.invoke,
  },
}));

describe('electron preload', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.exposeInMainWorld.mockReset();
    mocks.invoke.mockReset();
    delete process.env['npm_package_version'];
  });

  it('exposes the renderer bridge with update install support', async () => {
    await import('./preload');

    expect(mocks.exposeInMainWorld).toHaveBeenCalledOnce();
    const [key, value] = mocks.exposeInMainWorld.mock.calls[0] ?? [];

    expect(key).toBe(PRELOAD_GLOBAL_KEY);
    expect(value.version).toBe(PRELOAD_FALLBACK_VERSION);

    await value.installUpdate();
    expect(mocks.invoke).toHaveBeenCalledWith(IPC_CHANNELS.installUpdate);
  });
});
