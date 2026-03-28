import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectDefaultMetrics: vi.fn(),
  counterInc: vi.fn(),
  gaugeDec: vi.fn(),
  gaugeInc: vi.fn(),
  histogramObserve: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  metrics: vi.fn(),
}));

vi.mock('../logging/LoggerService', () => ({
  loggerService: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));

describe('createMetricsRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.collectDefaultMetrics.mockReset();
    mocks.counterInc.mockReset();
    mocks.gaugeDec.mockReset();
    mocks.gaugeInc.mockReset();
    mocks.histogramObserve.mockReset();
    mocks.loggerError.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.metrics.mockReset();
  });

  function createPrometheusModule() {
    return {
      Counter: class {
        inc = mocks.counterInc;
      },
      Gauge: class {
        inc = mocks.gaugeInc;
        dec = mocks.gaugeDec;
      },
      Histogram: class {
        observe = mocks.histogramObserve;
      },
      Registry: class {
        readonly contentType = 'text/plain; version=0.0.4';
        metrics = mocks.metrics;
      },
      collectDefaultMetrics: mocks.collectDefaultMetrics,
    };
  }

  it('tracks request duration and active connections when Prometheus support is configured', async () => {
    const startedAt = 1_000;
    const finishedAt = 2_500;
    const dateNowSpy = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(startedAt)
      .mockReturnValueOnce(finishedAt);

    const { createMetricsRuntime } = await import('./metrics');
    const runtime = createMetricsRuntime(createPrometheusModule());
    const request = {
      method: 'GET',
      path: '/fallback',
      route: { path: '/health' },
    };
    const response = new EventEmitter() as EventEmitter & { statusCode: number };
    response.statusCode = 204;
    const next = vi.fn();

    runtime.prometheusMiddleware(request as never, response as never, next);
    response.emit('finish');

    expect(mocks.collectDefaultMetrics).toHaveBeenCalledOnce();
    expect(mocks.gaugeInc).toHaveBeenCalledOnce();
    expect(mocks.gaugeDec).toHaveBeenCalledOnce();
    expect(mocks.histogramObserve).toHaveBeenCalledWith({
      method: 'GET',
      route: '/health',
      status_code: '204',
    }, 1.5);
    expect(next).toHaveBeenCalledOnce();

    dateNowSpy.mockRestore();
  });

  it('exposes the metrics endpoint and records application errors', async () => {
    mocks.metrics.mockResolvedValue('metric_output 1');

    const { createMetricsRuntime } = await import('./metrics');
    const runtime = createMetricsRuntime(createPrometheusModule());
    const routes = new Map<string, (request: unknown, response: ReturnType<typeof createResponse>) => Promise<void>>();
    const app = {
      get: vi.fn((routePath: string, handler: (request: unknown, response: ReturnType<typeof createResponse>) => Promise<void>) => {
        routes.set(routePath, handler);
      }),
    };

    runtime.setupMetricsEndpoint(app as never);
    runtime.trackError('network', 'high');

    const response = createResponse();
    await routes.get('/metrics/prometheus')?.({}, response);

    expect(mocks.counterInc).toHaveBeenCalledWith({ type: 'network', severity: 'high' });
    expect(response.set).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4');
    expect(response.end).toHaveBeenCalledWith('metric_output 1');
  });

  it('returns 500 when metrics collection fails', async () => {
    mocks.metrics.mockRejectedValue(new Error('collector failed'));

    const { createMetricsRuntime } = await import('./metrics');
    const runtime = createMetricsRuntime(createPrometheusModule());
    const routes = new Map<string, (request: unknown, response: ReturnType<typeof createResponse>) => Promise<void>>();
    const app = {
      get: vi.fn((routePath: string, handler: (request: unknown, response: ReturnType<typeof createResponse>) => Promise<void>) => {
        routes.set(routePath, handler);
      }),
    };

    runtime.setupMetricsEndpoint(app as never, '/metrics');

    const response = createResponse();
    await routes.get('/metrics')?.({}, response);

    expect(mocks.loggerError).toHaveBeenCalledWith('Failed to collect metrics', expect.any(Error));
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.end).toHaveBeenCalledWith();
  });
});

describe('default metrics runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.loggerWarn.mockReset();
  });

  it('disables metrics cleanly when prom-client is unavailable', async () => {
    const { register, setupMetricsEndpoint, trackError } = await import('./metrics');
    const routes = new Map<string, (request: unknown, response: ReturnType<typeof createResponse>) => Promise<void>>();
    const app = {
      get: vi.fn((routePath: string, handler: (request: unknown, response: ReturnType<typeof createResponse>) => Promise<void>) => {
        routes.set(routePath, handler);
      }),
    };

    setupMetricsEndpoint(app as never, '/disabled-metrics');
    trackError('network');

    const response = createResponse();
    await routes.get('/disabled-metrics')?.({}, response);

    expect(register).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith('prom-client not available, metrics will be disabled');
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.end).toHaveBeenCalledWith('Metrics not available');
  });
});

function createResponse() {
  const response = {
    end: vi.fn(),
    set: vi.fn(),
    status: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}
