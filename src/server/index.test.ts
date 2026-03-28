import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const app = { kind: 'app' };
  return {
    app,
    bootState: {
      ready: false,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastError: null as string | null,
    },
    express: vi.fn(() => app),
    loggerError: vi.fn(),
    registerApiRoutes: vi.fn(),
    registerCoreMiddleware: vi.fn(),
    registerErrorHandler: vi.fn(),
    registerHealthEndpoints: vi.fn(),
    registerLogsEndpoint: vi.fn(),
    registerProcessHandlers: vi.fn(),
    registerUiRoutes: vi.fn(),
    startServer: vi.fn().mockResolvedValue(undefined),
    stopServer: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('express', () => ({
  default: mocks.express,
}));

vi.mock('./core/server', () => ({
  bootState: mocks.bootState,
  registerApiRoutes: mocks.registerApiRoutes,
  registerCoreMiddleware: mocks.registerCoreMiddleware,
  registerErrorHandler: mocks.registerErrorHandler,
  registerHealthEndpoints: mocks.registerHealthEndpoints,
  registerLogsEndpoint: mocks.registerLogsEndpoint,
  registerProcessHandlers: mocks.registerProcessHandlers,
  registerUiRoutes: mocks.registerUiRoutes,
  startServer: mocks.startServer,
  stopServer: mocks.stopServer,
}));

vi.mock('./core/logging/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

describe('server entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.bootState.ready = false;
    mocks.bootState.lastError = null;
    mocks.express.mockClear();
    mocks.loggerError.mockClear();
    mocks.registerApiRoutes.mockClear();
    mocks.registerCoreMiddleware.mockClear();
    mocks.registerErrorHandler.mockClear();
    mocks.registerHealthEndpoints.mockClear();
    mocks.registerLogsEndpoint.mockClear();
    mocks.registerProcessHandlers.mockClear();
    mocks.registerUiRoutes.mockClear();
    mocks.startServer.mockReset();
    mocks.startServer.mockResolvedValue(undefined);
    mocks.stopServer.mockReset();
    mocks.stopServer.mockResolvedValue(undefined);
    delete process.env['PRO5_SERVER_AUTOSTART'];
    delete process.env['NODE_ENV'];
  });

  it('wires middleware immediately and keeps autostart disabled when requested', async () => {
    process.env['PRO5_SERVER_AUTOSTART'] = 'false';
    const { app, start, stop } = await import('./index');

    expect(app).toBe(mocks.app);
    expect(mocks.registerCoreMiddleware).toHaveBeenCalledWith(mocks.app);
    expect(mocks.registerHealthEndpoints).toHaveBeenCalledWith(mocks.app);
    expect(mocks.registerApiRoutes).toHaveBeenCalledWith(mocks.app);
    expect(mocks.registerLogsEndpoint).toHaveBeenCalledWith(mocks.app);
    expect(mocks.registerUiRoutes).toHaveBeenCalledWith(mocks.app);
    expect(mocks.registerErrorHandler).toHaveBeenCalledWith(mocks.app);
    expect(mocks.registerProcessHandlers).not.toHaveBeenCalled();
    expect(mocks.startServer).not.toHaveBeenCalled();

    await start();
    expect(mocks.startServer).toHaveBeenCalledWith(mocks.app);

    await stop('tests');
    expect(mocks.stopServer).toHaveBeenCalledWith('tests');
  });

  it('registers process handlers and exits when autostart startup fails', async () => {
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => undefined) as never);
    const failure = new Error('boot failed');
    mocks.startServer.mockRejectedValueOnce(failure);

    const { registerProcessHandlers } = await import('./index');
    await Promise.resolve();
    await Promise.resolve();

    expect(registerProcessHandlers).toBe(mocks.registerProcessHandlers);
    expect(mocks.registerProcessHandlers).toHaveBeenCalledOnce();
    expect(mocks.bootState.ready).toBe(false);
    expect(mocks.bootState.lastError).toBe('boot failed');
    expect(mocks.loggerError).toHaveBeenCalledWith('Failed to start server', { error: 'boot failed' });
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
