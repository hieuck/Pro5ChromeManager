import type express from 'express';
import { loggerService } from '../logging/LoggerService';

type PrometheusRegistry = {
  readonly contentType: string;
  metrics(): Promise<string>;
};

type PrometheusModule = {
  Registry: new () => PrometheusRegistry;
  Histogram: new (config: Record<string, unknown>) => {
    observe(labels: Record<string, string>, value: number): void;
  };
  Gauge: new (config: Record<string, unknown>) => {
    inc(): void;
    dec(): void;
  };
  Counter: new (config: Record<string, unknown>) => {
    inc(labels: Record<string, string>): void;
  };
  collectDefaultMetrics(config: Record<string, unknown>): void;
};

const DEFAULT_METRICS_ENDPOINT = '/metrics/prometheus';
const FALLBACK_ROUTE_LABEL = 'unknown';
const METRICS_UNAVAILABLE_MESSAGE = 'Metrics not available';
const REQUEST_DURATION_BUCKETS = [0.1, 0.5, 1, 2, 5, 10];
const SECONDS_PER_MILLISECOND = 1000;

type MetricsRuntime = {
  readonly register: PrometheusRegistry | null;
  prometheusMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void;
  setupMetricsEndpoint(app: express.Application, endpoint?: string): void;
  trackError(type: string, severity?: 'low' | 'medium' | 'high'): void;
};

function loadPrometheusModule(): PrometheusModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    return require('prom-client') as PrometheusModule;
  } catch {
    loggerService.warn('prom-client not available, metrics will be disabled');
    return null;
  }
}

export function createMetricsRuntime(prometheus: PrometheusModule | null): MetricsRuntime {
  const register = prometheus ? new prometheus.Registry() : null;

  if (prometheus && register) {
    prometheus.collectDefaultMetrics({ register });
  }

  const httpRequestDuration = prometheus && register ? new prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: REQUEST_DURATION_BUCKETS,
    registers: [register],
  }) : null;

  const activeConnections = prometheus && register ? new prometheus.Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
    registers: [register],
  }) : null;

  const errorCount = prometheus && register ? new prometheus.Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'severity'],
    registers: [register],
  }) : null;

  return {
    register,
    prometheusMiddleware(req, res, next) {
      const startedAt = Date.now();
      let decremented = false;
      const routePath = typeof req.route?.path === 'string' ? req.route.path : req.path;
      const routeLabel = routePath || FALLBACK_ROUTE_LABEL;

      activeConnections?.inc();

      res.on('finish', () => {
        const duration = (Date.now() - startedAt) / SECONDS_PER_MILLISECOND;
        httpRequestDuration?.observe({
          method: req.method,
          route: routeLabel,
          status_code: String(res.statusCode),
        }, duration);

        if (!decremented) {
          activeConnections?.dec();
          decremented = true;
        }
      });

      next();
    },
    setupMetricsEndpoint(app, endpoint = DEFAULT_METRICS_ENDPOINT) {
      app.get(endpoint, async (_req, res) => {
        if (!register) {
          res.status(503).end(METRICS_UNAVAILABLE_MESSAGE);
          return;
        }

        try {
          res.set('Content-Type', register.contentType);
          res.end(await register.metrics());
        } catch (error) {
          loggerService.error('Failed to collect metrics', error);
          res.status(500).end();
        }
      });
    },
    trackError(type, severity = 'medium') {
      errorCount?.inc({ type, severity });
    },
  };
}

const metricsRuntime = createMetricsRuntime(loadPrometheusModule());

export const register = metricsRuntime.register;
export const prometheusMiddleware = metricsRuntime.prometheusMiddleware;
export const setupMetricsEndpoint = metricsRuntime.setupMetricsEndpoint;
export const trackError = metricsRuntime.trackError;
