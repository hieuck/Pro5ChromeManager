import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { configManager } from './managers/ConfigManager';
import { logger } from './utils/logger';
import { wsServer } from './utils/wsServer';
import { dataPath } from './utils/dataPaths';

const app = express();
type OpsLogEntry = {
  timestamp: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string | null;
  raw: string;
};
const bootState: { ready: boolean; startedAt: string; lastError: string | null } = {
  ready: false,
  startedAt: new Date().toISOString(),
  lastError: null,
};
let httpServerRef: http.Server | null = null;
let shutdownRegistered = false;
let shuttingDown = false;

app.use(express.json());

// CORS — allow localhost origins
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin ?? '';
  if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: process.env.npm_package_version ?? '1.0.0' });
});

app.get('/readyz', async (_req: Request, res: Response) => {
  try {
    const { runtimeManager } = await import('./managers/RuntimeManager');
    const { profileManager } = await import('./managers/ProfileManager');
    const { proxyManager } = await import('./managers/ProxyManager');
    const { licenseManager } = await import('./managers/LicenseManager');

    const runtimes = runtimeManager.listRuntimes();
    const profiles = profileManager.listProfiles();
    const proxies = proxyManager.listProxies();
    const license = licenseManager.getStatus(profiles.length);
    const availableRuntimeCount = runtimes.filter((runtime) => runtime.available).length;
    const config = configManager.get();
    const warnings = [
      bootState.lastError ? `Last startup error: ${bootState.lastError}` : null,
      availableRuntimeCount === 0 ? 'No available browser runtime detected.' : null,
      !process.env['PRO5_OFFLINE_SECRET'] && process.env['NODE_ENV'] === 'production'
        ? 'PRO5_OFFLINE_SECRET is missing in production.'
        : null,
    ].filter((item): item is string => Boolean(item));

    const payload = {
      status: warnings.length === 0 ? 'ready' : 'degraded',
      bootReady: bootState.ready,
      startedAt: bootState.startedAt,
      lastError: bootState.lastError,
      api: config.api,
      dataDir: dataPath(),
      profileCount: profiles.length,
      proxyCount: proxies.length,
      runtimeCount: runtimes.length,
      availableRuntimeCount,
      licenseTier: license.tier,
      warnings,
    };

    res.status(warnings.length === 0 ? 200 : 503).json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({
      status: 'not_ready',
      bootReady: bootState.ready,
      startedAt: bootState.startedAt,
      lastError: message,
    });
  }
});

// Config routes
import configRoutes from './routes/config';
app.use('/api', configRoutes);

// Profile routes
import profileRoutes from './routes/profiles';
app.use('/api', profileRoutes);

// Proxy routes
import proxyRoutes from './routes/proxies';
app.use('/api', proxyRoutes);

// Runtime routes
import runtimeRoutes from './routes/runtimes';
app.use('/api', runtimeRoutes);

// Instance routes
import instanceRoutes from './routes/instances';
app.use('/api', instanceRoutes);

// License routes
import licenseRoutes from './routes/license';
app.use('/api/license', licenseRoutes);

// Backup routes
import backupRoutes from './routes/backups';
app.use('/api', backupRoutes);

// Support routes
import supportRoutes from './routes/support';
app.use('/api', supportRoutes);

function getLogTimestamp(line: string): number {
  try {
    const parsed = JSON.parse(line) as { timestamp?: unknown };
    if (typeof parsed.timestamp === 'string') {
      const timestamp = new Date(parsed.timestamp).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    }
  } catch {
    const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
    if (match?.[1]) {
      const timestamp = new Date(match[1]).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    }
  }

  return 0;
}

function injectLogSource(line: string, source: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source : source,
    });
  } catch {
    return JSON.stringify({
      timestamp: null,
      level: 'info',
      message: trimmed,
      source,
      raw: trimmed,
    });
  }
}

function normalizeLogLevel(value: unknown): OpsLogEntry['level'] {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized === 'debug') return 'debug';
  if (normalized === 'error') return 'error';
  if (normalized === 'warn' || normalized === 'warning') return 'warn';
  return 'info';
}

function parseOpsLogEntry(line: string): OpsLogEntry {
  const trimmed = line.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const message =
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message
        : typeof parsed.msg === 'string' && parsed.msg.trim()
          ? parsed.msg
          : trimmed;

    return {
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : null,
      level: normalizeLogLevel(parsed.level),
      message,
      source: typeof parsed.source === 'string' && parsed.source.trim() ? parsed.source : null,
      raw: trimmed,
    };
  } catch {
    return {
      timestamp: null,
      level: 'info',
      message: trimmed,
      source: null,
      raw: trimmed,
    };
  }
}

async function loadOpsLogEntries(limit: number): Promise<OpsLogEntry[]> {
  const logDir = dataPath('logs');

  try {
    const files = await fs.readdir(logDir);
    const relevantFiles = files.filter((file) =>
      file === 'electron-main.log' ||
      file.startsWith('exceptions-') ||
      file.startsWith('rejections-') ||
      /^app-\d{4}-\d{2}-\d{2}\.log$/.test(file),
    );

    const entries: Array<{ entry: OpsLogEntry; timestamp: number }> = [];

    for (const file of relevantFiles) {
      try {
        const content = await fs.readFile(path.join(logDir, file), 'utf-8');
        const lines = content.split(/\r?\n/).filter(Boolean).slice(-200);
        for (const line of lines) {
          const normalized = injectLogSource(line, file);
          if (!normalized) continue;
          entries.push({
            entry: parseOpsLogEntry(normalized),
            timestamp: getLogTimestamp(normalized),
          });
        }
      } catch {
        // skip unreadable files
      }
    }

    return entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map((entry) => entry.entry);
  } catch {
    return [];
  }
}

// Logs endpoint — reads the latest daily-rotated app log file
app.get('/api/logs', async (_req: Request, res: Response) => {
  try {
    const entries = await loadOpsLogEntries(200);
    res.json({ success: true, data: entries });
    return;
  } catch {
    res.status(500).json({ success: false, error: 'Failed to read logs' });
    return;
  }
});

app.get('/api/logs-legacy-disabled', async (_req: Request, res: Response) => {
  try {
    const fs = await import('fs/promises');
    const logDir = dataPath('logs');
    // Find the most recent app-YYYY-MM-DD.log file
    let entries: string[] = [];
    try {
      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter((f) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .sort()
        .reverse();
      if (logFiles.length > 0) {
        const logPath = path.join(logDir, logFiles[0]);
        const content = await fs.readFile(logPath, 'utf-8');
        entries = content.split('\n').filter(Boolean).slice(-200);
      }
    } catch {
      // log dir or files missing — return empty array
    }
    res.json({ success: true, data: entries });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read logs' });
  }
});

function resolveUiDir(): string {
  const packagedUiDir = path.join(__dirname, '../ui');
  const devUiDir = path.resolve(process.cwd(), 'dist/ui');
  return packagedUiDir.includes('app.asar') ? packagedUiDir : devUiDir;
}

// Serve static UI
const uiDir = resolveUiDir();
const uiAssetsDir = path.join(uiDir, 'assets');
app.use('/assets', express.static(uiAssetsDir));
app.use('/ui', express.static(uiDir));
app.get('/ui/*', (_req: Request, res: Response) => {
  res.sendFile(path.join(uiDir, 'index.html'));
});

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

async function start(): Promise<void> {
  await configManager.load();

  // Initialize all managers in dependency order
  const { fingerprintEngine } = await import('./managers/FingerprintEngine');
  await fingerprintEngine.initialize();

  const { runtimeManager } = await import('./managers/RuntimeManager');
  await runtimeManager.initialize();

  const { profileManager } = await import('./managers/ProfileManager');
  await profileManager.initialize();

  const { proxyManager } = await import('./managers/ProxyManager');
  await proxyManager.initialize();

  const { licenseManager } = await import('./managers/LicenseManager');
  await licenseManager.initialize();

  const { usageMetricsManager } = await import('./managers/UsageMetricsManager');
  await usageMetricsManager.initialize();

  const { onboardingStateManager } = await import('./managers/OnboardingStateManager');
  await onboardingStateManager.initialize();

  const { instanceManager } = await import('./managers/InstanceManager');
  await instanceManager.initialize();

  const { backupManager } = await import('./managers/BackupManager');
  backupManager.startAutoBackup();

  // Warn if offline secret is not set in production
  if (!process.env['PRO5_OFFLINE_SECRET'] && process.env['NODE_ENV'] === 'production') {
    logger.warn('PRO5_OFFLINE_SECRET env var not set — offline keys use default secret (insecure)');
  }

  const { host, port } = configManager.get().api;
  const httpServer = http.createServer(app);
  httpServerRef = httpServer;
  wsServer.attach(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      bootState.ready = true;
      bootState.lastError = null;
      logger.info(`API server running at http://${host}:${port}`);
      logger.info(`WebSocket server running at ws://${host}:${port}/ws`);
      resolve();
    });
  });
}

async function stop(reason = 'shutdown'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  bootState.ready = false;
  bootState.lastError = `Stopped: ${reason}`;

  logger.warn('Stopping server', { reason });

  try {
    const { instanceManager } = await import('./managers/InstanceManager');
    await instanceManager.stopAll();
  } catch (err) {
    logger.warn('Failed to stop Chromium instances during shutdown', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (httpServerRef) {
    await new Promise<void>((resolve, reject) => {
      httpServerRef?.close((err) => (err ? reject(err) : resolve()));
    }).catch((err) => {
      logger.warn('Failed to close HTTP server cleanly', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    httpServerRef = null;
  }

  shuttingDown = false;
}

function registerProcessHandlers(): void {
  if (shutdownRegistered) return;
  shutdownRegistered = true;

  process.on('SIGINT', () => {
    void stop('SIGINT').finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void stop('SIGTERM').finally(() => process.exit(0));
  });

  process.on('uncaughtException', (err) => {
    bootState.lastError = err.message;
    logger.error('Uncaught exception in server process', { error: err.message, stack: err.stack });
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    bootState.lastError = message;
    logger.error('Unhandled rejection in server process', {
      error: message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

if (process.env['PRO5_SERVER_AUTOSTART'] !== 'false' && process.env['NODE_ENV'] !== 'test') {
  registerProcessHandlers();
  start().catch((err) => {
    bootState.ready = false;
    bootState.lastError = err instanceof Error ? err.message : String(err);
    logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}

export { app, start, stop, registerProcessHandlers };
