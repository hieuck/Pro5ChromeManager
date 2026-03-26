import fs from 'fs/promises';
import path from 'path';
import type archiver from 'archiver';
import { dataPath } from '../../core/fs/dataPaths';
import type {
  IncidentCategory,
  IncidentCategorySummary,
  IncidentEntry,
  IncidentSnapshot,
} from '../../../shared/contracts';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseIncidentLevel(value: unknown): 'warn' | 'error' | null {
  return value === 'warn' || value === 'error' ? value : null;
}

export async function listLogFiles(): Promise<string[]> {
  try {
    return (await fs.readdir(dataPath('logs'))).filter((entry) => entry.endsWith('.log'));
  } catch {
    return [];
  }
}

export function classifyIncident(source: string, message: string): {
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

export function normalizeIncident(
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

export function buildIncidentSnapshot(incidents: IncidentEntry[]): IncidentSnapshot {
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

export async function loadIncidentEntries(limit: number): Promise<IncidentEntry[]> {
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

export async function getSupportPagesReady(): Promise<boolean> {
  return Promise.all([
    fileExists(path.resolve(process.cwd(), 'landing', 'support.html')),
    fileExists(path.resolve(process.cwd(), 'landing', 'privacy.html')),
    fileExists(path.resolve(process.cwd(), 'landing', 'terms.html')),
  ]).then((results) => results.every(Boolean));
}

export function sanitizeJsonText(raw: string, filename: string): string {
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

export async function appendIfExists(
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
