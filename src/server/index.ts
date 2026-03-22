import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { configManager } from './managers/ConfigManager';
import { logger } from './utils/logger';
import { wsServer } from './utils/wsServer';

const app = express();

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

// Logs endpoint — reads the latest daily-rotated app log file
app.get('/api/logs', async (_req: Request, res: Response) => {
  try {
    const fs = await import('fs/promises');
    const logDir = path.resolve('data/logs');
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

// Serve static UI
const uiDir = path.resolve('dist/ui');
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
  wsServer.attach(httpServer);

  httpServer.listen(port, host, () => {
    logger.info(`API server running at http://${host}:${port}`);
    logger.info(`WebSocket server running at ws://${host}:${port}/ws`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

export { app };
