import { describe, expect, it } from 'vitest';
import type { IncidentEntry } from '../../../shared/contracts';
import {
  buildIncidentSnapshot,
  classifyIncident,
  normalizeIncident,
  parseIncidentLevel,
  sanitizeJsonText,
} from './supportDiagnostics';

describe('supportDiagnostics', () => {
  it('parses supported incident levels only', () => {
    expect(parseIncidentLevel('warn')).toBe('warn');
    expect(parseIncidentLevel('error')).toBe('error');
    expect(parseIncidentLevel('info')).toBeNull();
    expect(parseIncidentLevel(undefined)).toBeNull();
  });

  it('classifies incidents by message and source fingerprints', () => {
    expect(classifyIncident('electron-main.log', 'Child process gone during startup')).toMatchObject({
      category: 'electron-process',
      fingerprint: 'electron-child-process-gone',
    });

    expect(classifyIncident('support.log', 'Feedback inbox write failed')).toMatchObject({
      category: 'support',
      fingerprint: 'support-issue',
    });

    expect(classifyIncident('app.log', 'Some unrelated message')).toMatchObject({
      category: 'general',
      fingerprint: 'general-incident',
    });
  });

  it('normalizes valid incidents and rejects incomplete entries', () => {
    expect(normalizeIncident('app.log', {
      timestamp: '2026-03-26T00:00:00.000Z',
      level: 'error',
      message: 'Proxy validation failed',
    })).toMatchObject({
      level: 'error',
      category: 'proxy',
      fingerprint: 'proxy-issue',
    });

    expect(normalizeIncident('app.log', {
      timestamp: '2026-03-26T00:00:00.000Z',
      level: 'info' as never,
      message: 'ignored',
    })).toBeNull();
    expect(normalizeIncident('app.log', {
      level: 'error',
      message: 'missing timestamp',
    })).toBeNull();
  });

  it('builds incident summary, timeline, and top category', () => {
    const incidents: IncidentEntry[] = [
      {
        timestamp: '2026-03-26T00:00:03.000Z',
        level: 'error',
        source: 'app.log',
        message: 'Proxy failed',
        category: 'proxy',
        categoryLabel: 'Proxy',
        fingerprint: 'proxy-issue',
      },
      {
        timestamp: '2026-03-26T00:00:01.000Z',
        level: 'warn',
        source: 'support.log',
        message: 'Feedback queue delayed',
        category: 'support',
        categoryLabel: 'Support',
        fingerprint: 'support-issue',
      },
      {
        timestamp: '2026-03-26T00:00:02.000Z',
        level: 'warn',
        source: 'app.log',
        message: 'Proxy timeout',
        category: 'proxy',
        categoryLabel: 'Proxy',
        fingerprint: 'proxy-issue',
      },
    ];

    const snapshot = buildIncidentSnapshot(incidents);

    expect(snapshot.count).toBe(3);
    expect(snapshot.summary.errorCount).toBe(1);
    expect(snapshot.summary.warnCount).toBe(2);
    expect(snapshot.summary.topCategory).toBe('proxy');
    expect(snapshot.summary.categories[0]).toMatchObject({
      category: 'proxy',
      count: 2,
      errorCount: 1,
      warnCount: 1,
      latestAt: '2026-03-26T00:00:03.000Z',
    });
    expect(snapshot.timeline.map((incident) => incident.timestamp)).toEqual([
      '2026-03-26T00:00:03.000Z',
      '2026-03-26T00:00:02.000Z',
      '2026-03-26T00:00:01.000Z',
    ]);
  });

  it('redacts proxy passwords when exporting diagnostics json', () => {
    const raw = JSON.stringify([
      { host: '1.2.3.4', username: 'demo', password: 'secret' },
      { host: '5.6.7.8', password: null },
    ]);

    expect(JSON.parse(sanitizeJsonText(raw, 'proxies.json'))).toEqual([
      { host: '1.2.3.4', username: 'demo', password: '[redacted]' },
      { host: '5.6.7.8', password: '[redacted]' },
    ]);
  });

  it('preserves non-json input during diagnostics export', () => {
    expect(sanitizeJsonText('not-json', 'activity.log')).toBe('not-json');
  });
});
