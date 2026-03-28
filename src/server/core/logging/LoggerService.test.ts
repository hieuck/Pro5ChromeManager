import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getErrorDetails: vi.fn((input: unknown) => ({ normalized: String(input instanceof Error ? input.message : input) })),
  randomUUID: vi.fn(() => 'corr-123'),
}));

vi.mock('crypto', () => ({
  randomUUID: mocks.randomUUID,
}));

vi.mock('../errors', () => ({
  getErrorDetails: mocks.getErrorDetails,
}));

vi.mock('./logger', () => ({
  logger: {},
}));

describe('LoggerService', () => {
  const createLogger = () => ({
    debug: vi.fn(),
    error: vi.fn(),
    http: vi.fn(),
    info: vi.fn(),
    silly: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  });

  beforeEach(() => {
    vi.resetModules();
    mocks.getErrorDetails.mockClear();
    mocks.randomUUID.mockClear();
  });

  it('merges default context across log levels and generates correlation ids', async () => {
    const { LoggerService } = await import('./LoggerService');
    const instance = createLogger();
    const service = new LoggerService(instance as never);

    service.setDefaultContext({ requestId: 'req-1', tenant: 'team-a' });

    expect(service.generateCorrelationId()).toBe('corr-123');

    service.warn('warn message', { userId: 'user-1' });
    service.info('info message');
    service.http('http message', { route: '/health' });
    service.verbose('verbose message');
    service.debug('debug message');
    service.silly('silly message');
    service.security('security message', { ip: '127.0.0.1' });
    service.audit('audit message', { actor: 'admin' });
    service.performance('slow query', 125, { query: 'SELECT 1' });

    expect(instance.warn).toHaveBeenNthCalledWith(1, 'warn message', {
      requestId: 'req-1',
      tenant: 'team-a',
      userId: 'user-1',
    });
    expect(instance.info).toHaveBeenNthCalledWith(1, 'info message', {
      requestId: 'req-1',
      tenant: 'team-a',
    });
    expect(instance.http).toHaveBeenCalledWith('http message', {
      requestId: 'req-1',
      tenant: 'team-a',
      route: '/health',
    });
    expect(instance.verbose).toHaveBeenCalledWith('verbose message', {
      requestId: 'req-1',
      tenant: 'team-a',
    });
    expect(instance.debug).toHaveBeenCalledWith('debug message', {
      requestId: 'req-1',
      tenant: 'team-a',
    });
    expect(instance.silly).toHaveBeenCalledWith('silly message', {
      requestId: 'req-1',
      tenant: 'team-a',
    });
    expect(instance.warn).toHaveBeenNthCalledWith(2, 'SECURITY: security message', {
      requestId: 'req-1',
      tenant: 'team-a',
      ip: '127.0.0.1',
      security: true,
    });
    expect(instance.info).toHaveBeenNthCalledWith(2, 'AUDIT: audit message', {
      requestId: 'req-1',
      tenant: 'team-a',
      actor: 'admin',
      audit: true,
    });
    expect(instance.info).toHaveBeenNthCalledWith(3, 'PERFORMANCE: slow query', {
      requestId: 'req-1',
      tenant: 'team-a',
      query: 'SELECT 1',
      duration: 125,
      performance: true,
    });
  });

  it('normalizes errors and inherits context in child loggers', async () => {
    const { LoggerService } = await import('./LoggerService');
    const instance = createLogger();
    const service = new LoggerService(instance as never);
    service.setDefaultContext({ requestId: 'req-1' });
    const child = service.child({ sessionId: 'session-1' });
    child.error('failure', new Error('boom'), { operation: 'save' });

    expect(mocks.getErrorDetails).toHaveBeenCalledWith(expect.any(Error));
    expect(instance.error).toHaveBeenCalledWith('failure', {
      requestId: 'req-1',
      sessionId: 'session-1',
      operation: 'save',
      error: { normalized: 'boom' },
    });

    service.clearDefaultContext();
    service.info('cleared');
    expect(instance.info).toHaveBeenCalledWith('cleared', {});
  });

  it('records uncaught exceptions and unhandled rejections with process context', async () => {
    const { LoggerService } = await import('./LoggerService');
    const instance = createLogger();
    const service = new LoggerService(instance as never);
    const memoryUsageSpy = vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1,
      heapTotal: 2,
      heapUsed: 3,
      external: 4,
      arrayBuffers: 5,
    });
    const uptimeSpy = vi.spyOn(process, 'uptime').mockReturnValue(123);
    const promise = Promise.resolve('ok');

    service.logUncaughtException(new Error('fatal'), { requestId: 'req-1' });
    service.logUnhandledRejection('rejected', promise, { requestId: 'req-2' });

    expect(instance.error).toHaveBeenNthCalledWith(1, 'Uncaught Exception', {
      requestId: 'req-1',
      uncaught: true,
      process: {
        pid: process.pid,
        uptime: 123,
        memory: {
          rss: 1,
          heapTotal: 2,
          heapUsed: 3,
          external: 4,
          arrayBuffers: 5,
        },
      },
      error: { normalized: 'fatal' },
    });
    expect(instance.error).toHaveBeenNthCalledWith(2, 'Unhandled Promise Rejection', {
      requestId: 'req-2',
      unhandled: true,
      reason: { normalized: 'rejected' },
      promise: promise.toString(),
    });

    memoryUsageSpy.mockRestore();
    uptimeSpy.mockRestore();
  });
});
