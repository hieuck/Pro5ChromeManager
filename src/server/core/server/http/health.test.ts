import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bootState: {
    lastError: null as string | null,
    ready: true,
    startedAt: '2026-01-01T00:00:00.000Z',
  },
  configGet: vi.fn(() => ({
    api: {
      host: '127.0.0.1',
      port: 3210,
    },
  })),
  dataPath: vi.fn(() => 'E:/data'),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
  loggerGenerateCorrelationId: vi.fn(() => 'corr-123'),
  loggerInfo: vi.fn(),
  extensionList: vi.fn(() => [{ id: 'ext-1' }]),
  profileList: vi.fn(() => [{ id: 'profile-1' }]),
  proxyList: vi.fn(() => [{ id: 'proxy-1' }]),
  runtimeList: vi.fn(() => [{ key: 'chrome', available: true }]),
}));

vi.mock('../../logging/LoggerService', () => ({
  loggerService: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    generateCorrelationId: mocks.loggerGenerateCorrelationId,
    info: mocks.loggerInfo,
  },
}));

vi.mock('../../fs/dataPaths', () => ({
  dataPath: mocks.dataPath,
}));

vi.mock('../../http', async () => {
  const actual = await vi.importActual<typeof import('../../http')>('../../http');
  return actual;
});

vi.mock('../bootState', () => ({
  bootState: mocks.bootState,
}));

vi.mock('../../../features/config/ConfigManager', () => ({
  configManager: {
    get: mocks.configGet,
  },
}));

vi.mock('../../../features/runtimes/RuntimeManager', () => ({
  runtimeManager: {
    listRuntimes: mocks.runtimeList,
  },
}));

vi.mock('../../../features/profiles/ProfileManager', () => ({
  profileManager: {
    listProfiles: mocks.profileList,
  },
}));

vi.mock('../../../features/proxies/ProxyManager', () => ({
  proxyManager: {
    listProxies: mocks.proxyList,
  },
}));

vi.mock('../../../features/extensions/ExtensionManager', () => ({
  extensionManager: {
    listExtensions: mocks.extensionList,
  },
}));

function createResponse() {
  const response = {
    json: vi.fn(),
    locals: {} as Record<string, unknown>,
    status: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('registerHealthEndpoints', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.bootState.lastError = null;
    mocks.bootState.ready = true;
    mocks.configGet.mockReset();
    mocks.configGet.mockReturnValue({
      api: { host: '127.0.0.1', port: 3210 },
    });
    mocks.dataPath.mockClear();
    mocks.extensionList.mockReset();
    mocks.extensionList.mockReturnValue([{ id: 'ext-1' }]);
    mocks.loggerDebug.mockClear();
    mocks.loggerError.mockClear();
    mocks.loggerGenerateCorrelationId.mockClear();
    mocks.loggerInfo.mockClear();
    mocks.profileList.mockReset();
    mocks.profileList.mockReturnValue([{ id: 'profile-1' }]);
    mocks.proxyList.mockReset();
    mocks.proxyList.mockReturnValue([{ id: 'proxy-1' }]);
    mocks.runtimeList.mockReset();
    mocks.runtimeList.mockReturnValue([{ key: 'chrome', available: true }]);
  });

  it('registers the basic health endpoint and returns service metadata', async () => {
    const { registerHealthEndpoints } = await import('./health');
    const routes = new Map<string, (req: unknown, res: ReturnType<typeof createResponse>) => unknown>();
    const app = {
      get: vi.fn((path: string, handler: (req: unknown, res: ReturnType<typeof createResponse>) => unknown) => {
        routes.set(path, handler);
      }),
    };

    registerHealthEndpoints(app as never);

    const response = createResponse();
    await routes.get('/health')?.({}, response);

    expect(mocks.loggerDebug).toHaveBeenCalledWith('Basic health check requested', { correlationId: 'corr-123' });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      service: 'pro5-chrome-manager',
      status: 'healthy',
      version: '1.0.0',
    }));
  });

  it('returns degraded readiness when startup warnings exist', async () => {
    const { registerHealthEndpoints } = await import('./health');
    const routes = new Map<string, (req: unknown, res: ReturnType<typeof createResponse>) => Promise<void>>();
    const app = {
      get: vi.fn((path: string, handler: (req: unknown, res: ReturnType<typeof createResponse>) => Promise<void>) => {
        routes.set(path, handler);
      }),
    };

    mocks.bootState.lastError = 'boot warning';
    mocks.runtimeList.mockReturnValue([{ key: 'chrome', available: false }]);
    registerHealthEndpoints(app as never);

    const response = createResponse();
    await routes.get('/readyz')?.({}, response);

    expect(mocks.loggerInfo).toHaveBeenCalledWith('Readiness check completed', expect.objectContaining({
      correlationId: 'corr-123',
      profileCount: 1,
      proxyCount: 1,
      status: 'degraded',
      statusCode: 503,
    }));
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      availableRuntimeCount: 0,
      bootReady: true,
      dataDir: 'E:/data',
      profileCount: 1,
      proxyCount: 1,
      runtimeCount: 1,
      status: 'degraded',
      warnings: [
        'Last startup error: boot warning',
        'No available browser runtime detected.',
      ],
    }));
  });

  it('surfaces readiness failures through the standard error envelope', async () => {
    const { registerHealthEndpoints } = await import('./health');
    const routes = new Map<string, (req: unknown, res: ReturnType<typeof createResponse>) => Promise<void>>();
    const app = {
      get: vi.fn((path: string, handler: (req: unknown, res: ReturnType<typeof createResponse>) => Promise<void>) => {
        routes.set(path, handler);
      }),
    };

    mocks.runtimeList.mockImplementation(() => {
      throw new Error('runtime lookup failed');
    });
    registerHealthEndpoints(app as never);

    const response = createResponse();
    await routes.get('/readyz')?.({}, response);

    expect(mocks.loggerError).toHaveBeenCalledWith('Readiness check failed', expect.any(Error), {
      correlationId: 'corr-123',
    });
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SERVICE_UNAVAILABLE',
      error: 'Service not ready',
      success: false,
    }));
  });

  it('collects metrics and returns them through the success envelope', async () => {
    const { registerHealthEndpoints } = await import('./health');
    const routes = new Map<string, (req: unknown, res: ReturnType<typeof createResponse>) => Promise<void>>();
    const app = {
      get: vi.fn((path: string, handler: (req: unknown, res: ReturnType<typeof createResponse>) => Promise<void>) => {
        routes.set(path, handler);
      }),
    };

    registerHealthEndpoints(app as never);

    const response = createResponse();
    await routes.get('/metrics')?.({}, response);

    expect(mocks.loggerDebug).toHaveBeenCalledWith('Metrics collected', {
      correlationId: 'corr-123',
      profileCount: 1,
      proxyCount: 1,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        application: expect.objectContaining({
          availableRuntimes: 1,
          extensions: 1,
          profiles: 1,
          proxies: 1,
          runtimes: 1,
        }),
      }),
      success: true,
    }));
  });
});
