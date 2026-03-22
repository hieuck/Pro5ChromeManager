import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { logger } from '../utils/logger';
import { dataPath } from '../utils/dataPaths';

const router = Router();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

interface SelfTestCheck {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface IncidentEntry {
  timestamp: string;
  level: 'warn' | 'error';
  source: string;
  message: string;
}

function parseIncidentLevel(value: unknown): 'warn' | 'error' | null {
  return value === 'warn' || value === 'error' ? value : null;
}

async function listLogFiles(): Promise<string[]> {
  try {
    return (await fs.readdir(dataPath('logs'))).filter((entry) => entry.endsWith('.log'));
  } catch {
    return [];
  }
}

function normalizeIncident(
  source: string,
  entry: Partial<IncidentEntry> & { message?: string; timestamp?: string; level?: string },
): IncidentEntry | null {
  const level = parseIncidentLevel(entry.level);
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null;
  const message = typeof entry.message === 'string' ? entry.message.trim() : null;
  if (!level || !timestamp || !message) return null;
  return { timestamp, level, source, message };
}

async function loadIncidentEntries(limit: number): Promise<IncidentEntry[]> {
  const logDir = dataPath('logs');
  const files = await listLogFiles();
  const relevantFiles = files.filter((file) =>
    file === 'electron-main.log' || file.startsWith('exceptions-') || file.startsWith('rejections-') || file.startsWith('app-'));

  const incidents: IncidentEntry[] = [];

  for (const file of relevantFiles) {
    try {
      const content = await fs.readFile(path.join(logDir, file), 'utf-8');
      const lines = content.split(/\r?\n/).filter(Boolean).slice(-200);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const incident = normalizeIncident(file, {
            timestamp: typeof parsed['timestamp'] === 'string' ? parsed['timestamp'] : undefined,
            level: parseIncidentLevel(parsed['level']) ?? undefined,
            message: typeof parsed['message'] === 'string' ? parsed['message'] : undefined,
          });
          if (incident) incidents.push(incident);
        } catch {
          const match = line.match(/^\[(?<timestamp>[^\]]+)\]\s+(?<level>warn|error):\s+(?<message>.+)$/i);
          if (match?.groups) {
            const incident = normalizeIncident(file, {
              timestamp: new Date().toISOString(),
              level: parseIncidentLevel(match.groups['level']?.toLowerCase()) ?? undefined,
              message: match.groups['message'],
            });
            if (incident) incidents.push(incident);
          }
        }
      }
    } catch {
      // ignore unreadable log file
    }
  }

  return incidents
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

router.get('/support/status', async (_req: Request, res: Response) => {
  try {
    const logFiles = await listLogFiles();

    const diagnosticsReady = await fileExists(dataPath('config.json'));
    const offlineSecretConfigured = Boolean(process.env['PRO5_OFFLINE_SECRET']);
    const codeSigningConfigured = Boolean(process.env['CSC_LINK']);
    const supportPagesReady = await Promise.all([
      fileExists(path.resolve(process.cwd(), 'landing', 'support.html')),
      fileExists(path.resolve(process.cwd(), 'landing', 'privacy.html')),
      fileExists(path.resolve(process.cwd(), 'landing', 'terms.html')),
    ]).then((results) => results.every(Boolean));

    const warnings = [
      !diagnosticsReady ? 'Base configuration file is missing.' : null,
      !offlineSecretConfigured ? 'PRO5_OFFLINE_SECRET is not configured for production licensing.' : null,
      !codeSigningConfigured ? 'CSC_LINK is not configured; Windows builds may show SmartScreen warnings.' : null,
      !supportPagesReady ? 'Public support/legal pages are incomplete.' : null,
    ].filter((item): item is string => Boolean(item));

    res.json({
      success: true,
      data: {
        appVersion: process.env['npm_package_version'] ?? '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: process.uptime(),
        dataDir: dataPath(),
        logFileCount: logFiles.length,
        diagnosticsReady,
        offlineSecretConfigured,
        codeSigningConfigured,
        supportPagesReady,
        releaseReady: diagnosticsReady && offlineSecretConfigured && supportPagesReady,
        warnings,
      },
    });
  } catch (err) {
    logger.error('GET /api/support/status error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load support status' });
  }
});

router.get('/support/incidents', async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const incidents = await loadIncidentEntries(limit);
    res.json({
      success: true,
      data: {
        count: incidents.length,
        incidents,
      },
    });
  } catch (err) {
    logger.error('GET /api/support/incidents error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load incidents' });
  }
});

router.post('/support/self-test', async (_req: Request, res: Response) => {
  try {
    const { configManager } = await import('../managers/ConfigManager');
    const { runtimeManager } = await import('../managers/RuntimeManager');
    const { profileManager } = await import('../managers/ProfileManager');
    const { proxyManager } = await import('../managers/ProxyManager');
    const { licenseManager } = await import('../managers/LicenseManager');

    const checks: SelfTestCheck[] = [];
    const config = configManager.get();
    const profilesDirExists = await fileExists(config.profilesDir);
    checks.push({
      key: 'profiles-dir',
      label: 'Profiles directory',
      status: profilesDirExists ? 'pass' : 'fail',
      detail: profilesDirExists ? config.profilesDir : `Missing: ${config.profilesDir}`,
    });

    await runtimeManager.refreshAvailability();
    const runtimes = runtimeManager.listRuntimes();
    const availableRuntimes = runtimes.filter((runtime) => runtime.available);
    checks.push({
      key: 'runtime',
      label: 'Browser runtime',
      status: availableRuntimes.length > 0 ? 'pass' : 'fail',
      detail: availableRuntimes.length > 0
        ? `${availableRuntimes.length}/${runtimes.length} runtime(s) available`
        : 'No configured browser runtime is available.',
    });

    const diagnosticsReady = await fileExists(dataPath('config.json'));
    checks.push({
      key: 'diagnostics',
      label: 'Diagnostics export',
      status: diagnosticsReady ? 'pass' : 'fail',
      detail: diagnosticsReady ? 'Base config detected, diagnostics export is available.' : 'Base config is missing.',
    });

    const supportPagesReady = await Promise.all([
      fileExists(path.resolve(process.cwd(), 'landing', 'support.html')),
      fileExists(path.resolve(process.cwd(), 'landing', 'privacy.html')),
      fileExists(path.resolve(process.cwd(), 'landing', 'terms.html')),
    ]).then((results) => results.every(Boolean));
    checks.push({
      key: 'support-pages',
      label: 'Public support/legal pages',
      status: supportPagesReady ? 'pass' : 'warn',
      detail: supportPagesReady ? 'Support, privacy, and terms pages are present.' : 'One or more support/legal pages are missing.',
    });

    const license = licenseManager.getStatus(profileManager.listProfiles().length);
    checks.push({
      key: 'license',
      label: 'License state',
      status: license.tier === 'expired' ? 'fail' : 'pass',
      detail: `Current tier: ${license.tier}`,
    });

    checks.push({
      key: 'proxy-store',
      label: 'Proxy store',
      status: 'pass',
      detail: `${proxyManager.listProxies().length} proxy configuration(s) loaded.`,
    });

    const hasFailure = checks.some((check) => check.status === 'fail');
    const hasWarning = checks.some((check) => check.status === 'warn');

    res.json({
      success: true,
      data: {
        status: hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass',
        checkedAt: new Date().toISOString(),
        checks,
      },
    });
  } catch (err) {
    logger.error('POST /api/support/self-test error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to run self-test' });
  }
});

function redactLicenseKey(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '****';
}

function sanitizeJsonText(raw: string, filename: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (filename === 'license.dat.summary.json' && parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if ('licenseKey' in record) {
        record['licenseKey'] = redactLicenseKey(record['licenseKey']);
      }
      return JSON.stringify(record, null, 2);
    }

    if (filename === 'proxies.json' && Array.isArray(parsed)) {
      const redacted = parsed.map((item) => {
        if (!item || typeof item !== 'object') return item;
        return { ...(item as Record<string, unknown>), password: '[redacted]' };
      });
      return JSON.stringify(redacted, null, 2);
    }

    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

async function appendIfExists(
  archive: archiver.Archiver,
  filePath: string,
  filename: string,
  transform?: (raw: string, filename: string) => string,
): Promise<void> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const content = transform ? transform(raw, filename) : raw;
    archive.append(content, { name: filename });
  } catch {
    // optional file missing
  }
}

router.get('/support/diagnostics', async (_req: Request, res: Response) => {
  const tmpZipPath = path.join(os.tmpdir(), `pro5-diagnostics-${Date.now()}.zip`);

  try {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(tmpZipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      const summary = {
        generatedAt: new Date().toISOString(),
        appVersion: process.env['npm_package_version'] ?? '1.0.0',
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        dataDir: dataPath(),
      };
      archive.append(JSON.stringify(summary, null, 2), { name: 'summary.json' });

      void Promise.all([
        appendIfExists(archive, dataPath('config.json'), 'config.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('instances.json'), 'instances.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('proxies.json'), 'proxies.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('activity.log'), 'activity.log'),
      ]).then(async () => {
        try {
          const encryptedLicense = await fs.readFile(dataPath('license.dat'), 'utf-8');
          archive.append(
            JSON.stringify(
              {
                present: true,
                encrypted: true,
                licenseKey: redactLicenseKey(encryptedLicense.trim()),
              },
              null,
              2,
            ),
            { name: 'license.dat.summary.json' },
          );
        } catch {
          archive.append(JSON.stringify({ present: false }, null, 2), { name: 'license.dat.summary.json' });
        }

        try {
          const logFiles = await fs.readdir(dataPath('logs'));
          for (const file of logFiles.filter((entry) => entry.endsWith('.log'))) {
            archive.file(dataPath('logs', file), { name: path.posix.join('logs', file) });
          }
        } catch {
          // ignore missing logs
        }

        void archive.finalize();
      }).catch(reject);
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="pro5-diagnostics.zip"');
    res.sendFile(tmpZipPath, (err) => {
      if (err) {
        logger.error('GET /api/support/diagnostics sendFile error', { error: err.message });
      }
      void fs.unlink(tmpZipPath).catch(() => undefined);
    });
  } catch (err) {
    logger.error('GET /api/support/diagnostics error', { error: err instanceof Error ? err.message : String(err) });
    void fs.unlink(tmpZipPath).catch(() => undefined);
    res.status(500).json({ success: false, error: 'Failed to export diagnostics' });
  }
});

export default router;
