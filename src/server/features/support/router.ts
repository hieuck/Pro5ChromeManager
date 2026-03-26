import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import { z } from 'zod';
import { logger } from '../../core/logging/logger';
import { dataPath } from '../../core/fs/dataPaths';
import type { SelfTestCheck, IncidentEntry, IncidentCategory, IncidentCategorySummary, IncidentSnapshot } from '../../../shared/contracts';

const router = Router();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}





interface SupportStatusPayload {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  dataDir: string;
  logFileCount: number;
  diagnosticsReady: boolean;
  codeSigningConfigured: boolean;
  supportPagesReady: boolean;
  onboardingCompleted: boolean;
  onboardingState: {
    status: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
    currentStep: number;
    selectedRuntime: string | null;
    draftProfileName: string | null;
    createdProfileId: string | null;
    lastOpenedAt: string | null;
    lastUpdatedAt: string | null;
    profileCreatedAt: string | null;
    completedAt: string | null;
    skippedAt: string | null;
  };
  profileCount: number;
  proxyCount: number;
  backupCount: number;
  feedbackCount: number;
  lastFeedbackAt: string | null;
  usageMetrics: {
    profileCreates: number;
    profileImports: number;
    profileLaunches: number;
    sessionChecks: number;
    sessionCheckLoggedIn: number;
    sessionCheckLoggedOut: number;
    sessionCheckErrors: number;
    lastProfileCreatedAt: string | null;
    lastProfileImportedAt: string | null;
    lastProfileLaunchAt: string | null;
    lastSessionCheckAt: string | null;
  };
  recentIncidentCount: number;
  recentErrorCount: number;
  lastIncidentAt: string | null;
  recentIncidentTopCategory: IncidentCategory | null;
  recentIncidentCategories: IncidentCategorySummary[];
  releaseReady: boolean;
  warnings: string[];
  offlineSecretConfigured: boolean;
}

const SupportFeedbackSchema = z.object({
  category: z.enum(['bug', 'feedback', 'question']),
  sentiment: z.enum(['negative', 'neutral', 'positive']),
  message: z.string().trim().min(10).max(5000),
  email: z.string().email().optional().or(z.literal('')).optional(),
  appVersion: z.string().max(64).optional().or(z.literal('')).optional(),
});

const OnboardingStateSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'profile_created', 'completed', 'skipped']).optional(),
  currentStep: z.number().int().min(0).max(10).optional(),
  selectedRuntime: z.string().max(128).nullable().optional(),
  draftProfileName: z.string().max(256).nullable().optional(),
  createdProfileId: z.string().max(128).nullable().optional(),
  lastOpenedAt: z.string().datetime().nullable().optional(),
  profileCreatedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  skippedAt: z.string().datetime().nullable().optional(),
});

interface SupportSelfTestPayload {
  status: 'pass' | 'warn' | 'fail';
  checkedAt: string;
  checks: SelfTestCheck[];
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
  const classified = classifyIncident(source, message);
  return {
    timestamp,
    level,
    source,
    message,
    category: classified.category,
    categoryLabel: classified.label,
    fingerprint: classified.fingerprint,
  };
}

function classifyIncident(source: string, message: string): {
  category: IncidentCategory;
  label: string;
  fingerprint: string;
} {
  const normalizedSource = source.toLowerCase();
  const normalizedMessage = message.toLowerCase();

  const fingerprints: Array<{
    category: IncidentCategory;
    label: string;
    match: boolean;
    fingerprint: string;
  }> = [
    {
      category: 'electron-process',
      label: 'Electron process',
      match: normalizedMessage.includes('child process gone')
        || normalizedMessage.includes('network service')
        || normalizedMessage.includes('utility process'),
      fingerprint: 'electron-child-process-gone',
    },
    {
      category: 'renderer-navigation',
      label: 'Renderer navigation',
      match: normalizedMessage.includes('renderer failed to load')
        || normalizedMessage.includes('load url')
        || normalizedMessage.includes('did-fail-load'),
      fingerprint: 'renderer-navigation-failure',
    },
    {
      category: 'startup-readiness',
      label: 'Startup readiness',
      match: normalizedMessage.includes('readiness probe')
        || normalizedMessage.includes('backend readiness')
        || normalizedMessage.includes('server boot timeout'),
      fingerprint: 'startup-readiness-failure',
    },
    {
      category: 'runtime-launch',
      label: 'Runtime launch',
      match: normalizedMessage.includes('failed to launch')
        || normalizedMessage.includes('browser launch')
        || normalizedMessage.includes('runtime'),
      fingerprint: 'runtime-launch-failure',
    },
    {
      category: 'proxy',
      label: 'Proxy',
      match: normalizedMessage.includes('proxy'),
      fingerprint: 'proxy-issue',
    },
    {
      category: 'extension',
      label: 'Extension',
      match: normalizedMessage.includes('extension'),
      fingerprint: 'extension-issue',
    },
    {
      category: 'cookies',
      label: 'Cookies',
      match: normalizedMessage.includes('cookie'),
      fingerprint: 'cookies-issue',
    },
    {
      category: 'profile-package',
      label: 'Profile package',
      match: normalizedMessage.includes('package')
        || normalizedMessage.includes('archive')
        || normalizedMessage.includes('expand-archive'),
      fingerprint: 'profile-package-issue',
    },
    {
      category: 'onboarding',
      label: 'Onboarding',
      match: normalizedMessage.includes('onboarding'),
      fingerprint: 'onboarding-issue',
    },
    {
      category: 'support',
      label: 'Support',
      match: normalizedSource.includes('support') || normalizedMessage.includes('feedback'),
      fingerprint: 'support-issue',
    },
  ];

  const matched = fingerprints.find((candidate) => candidate.match);
  if (matched) {
    return {
      category: matched.category,
      label: matched.label,
      fingerprint: matched.fingerprint,
    };
  }

  return {
    category: 'general',
    label: 'General',
    fingerprint: 'general-incident',
  };
}

function buildIncidentSnapshot(incidents: IncidentEntry[]): IncidentSnapshot {
  const categoryMap = new Map<IncidentCategory, IncidentCategorySummary>();

  for (const incident of incidents) {
    const existing = categoryMap.get(incident.category) ?? {
      category: incident.category,
      label: incident.categoryLabel,
      count: 0,
      errorCount: 0,
      warnCount: 0,
      latestAt: null,
    };
    existing.count += 1;
    if (incident.level === 'error') {
      existing.errorCount += 1;
    } else {
      existing.warnCount += 1;
    }
    if (!existing.latestAt || new Date(incident.timestamp).getTime() > new Date(existing.latestAt).getTime()) {
      existing.latestAt = incident.timestamp;
    }
    categoryMap.set(incident.category, existing);
  }

  const categories = Array.from(categoryMap.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return (right.latestAt ?? '').localeCompare(left.latestAt ?? '');
  });

  return {
    count: incidents.length,
    incidents,
    summary: {
      total: incidents.length,
      errorCount: incidents.filter((incident) => incident.level === 'error').length,
      warnCount: incidents.filter((incident) => incident.level === 'warn').length,
      topCategory: categories[0]?.category ?? null,
      categories,
    },
    timeline: [...incidents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
  };
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

async function getSupportPagesReady(): Promise<boolean> {
  return Promise.all([
    fileExists(path.resolve(process.cwd(), 'landing', 'support.html')),
    fileExists(path.resolve(process.cwd(), 'landing', 'privacy.html')),
    fileExists(path.resolve(process.cwd(), 'landing', 'terms.html')),
  ]).then((results) => results.every(Boolean));
}

function isProductionLikeRuntime(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

async function buildSupportStatus(): Promise<SupportStatusPayload> {
    const { configManager } = await import('../config/ConfigManager');
      const { profileManager } = await import('../profiles/ProfileManager');
  const { proxyManager } = await import('../../managers/ProxyManager');
    const { backupManager } = await import('../backups/BackupManager');
  const { usageMetricsManager } = await import('../../managers/UsageMetricsManager');
  const { supportInboxManager } = await import('../../managers/SupportInboxManager');
  const { onboardingStateManager } = await import('../../managers/OnboardingStateManager');

  const config = configManager.get();
  const profiles = profileManager.listProfiles();
  const proxies = proxyManager.listProxies();
  const backups = await backupManager.listBackups();
  await usageMetricsManager.initialize();
  await onboardingStateManager.initialize();
  const usageMetrics = usageMetricsManager.getSnapshot();
  const onboardingState = onboardingStateManager.getSnapshot();
  const feedbackEntries = await supportInboxManager.listFeedback(50);
  const logFiles = await listLogFiles();
  const recentIncidents = buildIncidentSnapshot(await loadIncidentEntries(20));
  const diagnosticsReady = await fileExists(dataPath('config.json'));
  const offlineSecretConfigured = Boolean(process.env['PRO5_OFFLINE_SECRET'] || process.env['OFFLINE_SECRET']);
  const codeSigningConfigured = Boolean(process.env['CSC_LINK']);
  const supportPagesReady = await getSupportPagesReady();
  const releaseRuntime = isProductionLikeRuntime();

  const warnings = [
    !diagnosticsReady ? 'Base configuration file is missing.' : null,
    releaseRuntime && !codeSigningConfigured ? 'CSC_LINK is not configured; Windows builds may show SmartScreen warnings.' : null,
    releaseRuntime && !supportPagesReady ? 'Public support/legal pages are incomplete.' : null,
  ].filter((item): item is string => Boolean(item));

  return {
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
    onboardingCompleted: config.onboardingCompleted,
    onboardingState,
    profileCount: profiles.length,
    proxyCount: proxies.length,
    backupCount: backups.length,
    feedbackCount: feedbackEntries.length,
    lastFeedbackAt: feedbackEntries[0]?.createdAt ?? null,
    usageMetrics,
    recentIncidentCount: recentIncidents.count,
    recentErrorCount: recentIncidents.summary.errorCount,
    lastIncidentAt: recentIncidents.timeline[0]?.timestamp ?? null,
    recentIncidentTopCategory: recentIncidents.summary.topCategory,
    recentIncidentCategories: recentIncidents.summary.categories,
    releaseReady: diagnosticsReady && supportPagesReady,
    warnings,
  };
}

async function buildSelfTest(): Promise<SupportSelfTestPayload> {
    const { configManager } = await import('../config/ConfigManager');
    const { runtimeManager } = await import('../runtimes/RuntimeManager');
  const { proxyManager } = await import('../../managers/ProxyManager');

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

  const supportPagesReady = await getSupportPagesReady();
  checks.push({
    key: 'support-pages',
    label: 'Public support/legal pages',
    status: supportPagesReady ? 'pass' : 'warn',
    detail: supportPagesReady ? 'Support, privacy, and terms pages are present.' : 'One or more support/legal pages are missing.',
  });

  checks.push({
    key: 'proxy-store',
    label: 'Proxy store',
    status: 'pass',
    detail: `${proxyManager.listProxies().length} proxy configuration(s) loaded.`,
  });

  const hasFailure = checks.some((check) => check.status === 'fail');
  const hasWarning = checks.some((check) => check.status === 'warn');

  return {
    status: hasFailure ? 'fail' : hasWarning ? 'warn' : 'pass',
    checkedAt: new Date().toISOString(),
    checks,
  };
}

router.get('/support/status', async (_req: Request, res: Response) => {
  try {
    const status = await buildSupportStatus();
    res.json({
      success: true,
      data: status,
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
    const incidents = buildIncidentSnapshot(await loadIncidentEntries(limit));
    res.json({
      success: true,
      data: incidents,
    });
  } catch (err) {
    logger.error('GET /api/support/incidents error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load incidents' });
  }
});

router.post('/support/self-test', async (_req: Request, res: Response) => {
  try {
    const selfTest = await buildSelfTest();
    res.json({
      success: true,
      data: selfTest,
    });
  } catch (err) {
    logger.error('POST /api/support/self-test error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to run self-test' });
  }
});

router.post('/support/onboarding-state', async (req: Request, res: Response) => {
  const parsed = OnboardingStateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid onboarding state payload', details: parsed.error.issues });
    return;
  }

  try {
    const { onboardingStateManager } = await import('../../managers/OnboardingStateManager');
    const state = await onboardingStateManager.update(parsed.data);
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error('POST /api/support/onboarding-state error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to save onboarding state' });
  }
});

router.get('/support/feedback', async (req: Request, res: Response) => {
  try {
    const limitRaw = typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : 20;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
    const { supportInboxManager } = await import('../../managers/SupportInboxManager');
    const entries = await supportInboxManager.listFeedback(limit);
    res.json({
      success: true,
      data: {
        count: entries.length,
        entries,
      },
    });
  } catch (err) {
    logger.error('GET /api/support/feedback error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to load support feedback' });
  }
});

router.post('/support/feedback', async (req: Request, res: Response) => {
  const parsed = SupportFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid feedback payload', details: parsed.error.issues });
    return;
  }

  try {
    const { supportInboxManager } = await import('../../managers/SupportInboxManager');
    const entry = await supportInboxManager.createFeedback({
      category: parsed.data.category,
      sentiment: parsed.data.sentiment,
      message: parsed.data.message,
      email: parsed.data.email ?? null,
      appVersion: parsed.data.appVersion ?? null,
    });
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    logger.error('POST /api/support/feedback error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: 'Failed to save support feedback' });
  }
});

function sanitizeJsonText(raw: string, filename: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
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
    const supportStatus = await buildSupportStatus();
    const selfTest = await buildSelfTest();
    const incidents = buildIncidentSnapshot(await loadIncidentEntries(50));

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
      archive.append(JSON.stringify(supportStatus, null, 2), { name: 'support-status.json' });
      archive.append(JSON.stringify(selfTest, null, 2), { name: 'self-test.json' });
      archive.append(JSON.stringify(incidents, null, 2), { name: 'incidents.json' });
      archive.append(JSON.stringify(incidents.summary, null, 2), { name: 'incident-summary.json' });
      archive.append(JSON.stringify(incidents.timeline, null, 2), { name: 'incident-timeline.json' });

      void Promise.all([
        appendIfExists(archive, dataPath('config.json'), 'config.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('instances.json'), 'instances.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('proxies.json'), 'proxies.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('activity.log'), 'activity.log'),
        appendIfExists(archive, dataPath('onboarding-state.json'), 'onboarding-state.json', sanitizeJsonText),
        appendIfExists(archive, dataPath('support-feedback.json'), 'support-feedback.json', sanitizeJsonText),
      ]).then(async () => {
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
