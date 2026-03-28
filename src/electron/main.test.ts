import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerMainProcessMock = vi.hoisted(() => vi.fn());

vi.mock('./mainProcess', () => ({
  registerMainProcess: registerMainProcessMock,
}));

describe('electron main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    registerMainProcessMock.mockReset();
  });

  it('registers the main process bootstrap on import', async () => {
    await import('./main');

    expect(registerMainProcessMock).toHaveBeenCalledOnce();
  });
});
