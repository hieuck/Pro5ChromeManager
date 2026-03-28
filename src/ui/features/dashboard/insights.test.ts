import { describe, expect, it } from 'vitest';
import { getTranslations } from '../../i18n';
import {
  buildDashboardActivityInsights,
  buildDashboardIncidentDigest,
} from './insights';
import type { IncidentEntry, LogEntry } from './types';

const dashboard = getTranslations('en').dashboard;
const NOW = new Date('2026-03-27T12:00:00.000Z').getTime();
const MINUTE_IN_MS = 60_000;

function minutesAgo(minutes: number): string {
  return new Date(NOW - (minutes * MINUTE_IN_MS)).toISOString();
}

function createIncident(overrides: Partial<IncidentEntry> = {}): IncidentEntry {
  return {
    timestamp: minutesAgo(10),
    level: 'warn',
    source: 'proxy',
    message: 'Proxy latency increased',
    ...overrides,
  };
}

function createLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: minutesAgo(10),
    level: 'info',
    message: 'Profile refreshed',
    raw: '{"message":"Profile refreshed"}',
    source: 'profile',
    ...overrides,
  };
}

describe('dashboard insights', () => {
  it('builds an immediate incident digest for fresh, concentrated errors', () => {
    const digest = buildDashboardIncidentDigest([
      createIncident({ timestamp: minutesAgo(2), level: 'error', source: 'proxy', message: 'Proxy failed' }),
      createIncident({ timestamp: minutesAgo(3), level: 'error', source: 'proxy', message: 'Proxy failed again' }),
      createIncident({ timestamp: minutesAgo(4), level: 'error', source: 'proxy', message: 'Proxy timed out' }),
      createIncident({ timestamp: minutesAgo(12), level: 'warn', source: 'runtime', message: 'Runtime fallback enabled' }),
    ], dashboard, NOW);

    expect(digest).not.toBeNull();
    expect(digest?.incidentAction).toBe('immediate');
    expect(digest?.heat.color).toBe('red');
    expect(digest?.trend.label).toBe(dashboard.incidentTrendSpiking);
    expect(digest?.errorRatio).toBe(75);
    expect(digest?.errorRatioColor).toBe('red');
    expect(digest?.topSource?.[0]).toBe('proxy');
    expect(digest?.topSourceRatio).toBe(75);
    expect(digest?.topSourceShareColor).toBe('volcano');
    expect(digest?.topSourcesConcentration).toBe(100);
    expect(digest?.topSourcesConcentrationColor).toBe('volcano');
  });

  it('builds a distributed incident digest when issues are spread across many sources', () => {
    const incidents = [
      createIncident({ timestamp: minutesAgo(10), source: 'proxy-1', message: 'Proxy 1 failed' }),
      createIncident({ timestamp: minutesAgo(12), source: 'proxy-2', message: 'Proxy 2 failed' }),
      createIncident({ timestamp: minutesAgo(15), source: 'proxy-3', message: 'Proxy 3 failed' }),
      createIncident({ timestamp: minutesAgo(18), source: 'proxy-4', message: 'Proxy 4 failed' }),
      createIncident({ timestamp: minutesAgo(22), source: 'proxy-5', message: 'Proxy 5 failed' }),
      createIncident({ timestamp: minutesAgo(35), source: 'proxy-6', message: 'Proxy 6 failed' }),
      createIncident({ timestamp: minutesAgo(45), source: 'proxy-7', message: 'Proxy 7 failed' }),
    ];

    const digest = buildDashboardIncidentDigest(incidents, dashboard, NOW);

    expect(digest).not.toBeNull();
    expect(digest?.incidentAction).toBe('distributed');
    expect(digest?.sourceMode.label).toBe(dashboard.incidentSourceModeDistributed);
    expect(digest?.topSourceRatio).toBe(14);
    expect(digest?.topSourceShareColor).toBe('geekblue');
    expect(digest?.topSourcesConcentration).toBe(43);
    expect(digest?.topSourcesConcentrationColor).toBe('green');
  });

  it('builds hottest activity action when repeated issues are active right now', () => {
    const insights = buildDashboardActivityInsights([
      createLog({ timestamp: minutesAgo(2), level: 'error', message: 'Proxy handshake failed', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(3), level: 'warn', message: 'Proxy handshake failed', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(4), level: 'error', message: 'Proxy handshake failed', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(8), level: 'info', message: 'Proxy pool refreshed', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(14), level: 'info', message: 'Dashboard synced', source: 'dashboard' }),
    ], dashboard, NOW);

    expect(insights.logHeat.color).toBe('red');
    expect(insights.hottestRecentIssue?.count).toBe(3);
    expect(insights.activityDigest?.activityAction).toBe('hottest');
    expect(insights.activityDigest?.issueRatio).toBe(60);
    expect(insights.activityDigest?.issueRatioColor).toBe('red');
    expect(insights.activityDigest?.topSourceShare).toBe(80);
    expect(insights.activityDigest?.topSourceShareColor).toBe('cyan');
    expect(insights.activityDigest?.topSourcesConcentration).toBe(100);
    expect(insights.activityDigest?.topSourcesConcentrationColor).toBe('cyan');
  });

  it('builds source activity action when one source dominates but issues are not urgent', () => {
    const insights = buildDashboardActivityInsights([
      createLog({ timestamp: minutesAgo(16), level: 'warn', message: 'Proxy retry scheduled', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(22), level: 'info', message: 'Proxy pool refreshed', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(28), level: 'info', message: 'Proxy config loaded', source: 'proxy' }),
      createLog({ timestamp: minutesAgo(35), level: 'info', message: 'Runtime check passed', source: 'runtime' }),
    ], dashboard, NOW);

    expect(insights.activityDigest?.activityAction).toBe('source');
    expect(insights.activityDigest?.topSource?.[0]).toBe('proxy');
    expect(insights.activityDigest?.topSourceShare).toBe(75);
    expect(insights.activityDigest?.topSourceShareColor).toBe('cyan');
    expect(insights.activityDigest?.activitySourceMode.label).toBe(dashboard.activitySourceModeFocused);
  });

  it('builds recent activity action when medium-term issues are elevated but not focused', () => {
    const insights = buildDashboardActivityInsights([
      createLog({ timestamp: minutesAgo(20), level: 'warn', message: 'Proxy 1 slow', source: 'proxy-1' }),
      createLog({ timestamp: minutesAgo(22), level: 'warn', message: 'Proxy 2 slow', source: 'proxy-2' }),
      createLog({ timestamp: minutesAgo(25), level: 'error', message: 'Proxy 3 failed', source: 'proxy-3' }),
      createLog({ timestamp: minutesAgo(30), level: 'warn', message: 'Proxy 4 slow', source: 'proxy-4' }),
      createLog({ timestamp: minutesAgo(40), level: 'error', message: 'Proxy 5 failed', source: 'proxy-5' }),
      createLog({ timestamp: minutesAgo(50), level: 'warn', message: 'Proxy 6 slow', source: 'proxy-6' }),
      createLog({ timestamp: minutesAgo(55), level: 'warn', message: 'Proxy 7 slow', source: 'proxy-7' }),
    ], dashboard, NOW);

    expect(insights.logHeat.color).toBe('gold');
    expect(insights.activityDigest?.activityAction).toBe('recent');
    expect(insights.activityDigest?.topSourceShare).toBe(14);
    expect(insights.activityDigest?.activitySourceMode.label).toBe(dashboard.activitySourceModeDistributed);
  });

  it('builds latest activity action when activity is calm and unfocused', () => {
    const insights = buildDashboardActivityInsights([
      createLog({ timestamp: minutesAgo(70), level: 'info', message: 'Profile opened', source: 'profile' }),
      createLog({ timestamp: minutesAgo(80), level: 'info', message: 'Runtime list refreshed', source: 'runtime' }),
      createLog({ timestamp: minutesAgo(90), level: 'info', message: 'Support view rendered', source: 'support' }),
    ], dashboard, NOW);

    expect(insights.logHeat.color).toBe('green');
    expect(insights.hottestRecentIssue).toBeNull();
    expect(insights.activityDigest?.activityAction).toBe('latest');
    expect(insights.activityDigest?.issueRatio).toBe(0);
    expect(insights.activityDigest?.issueRatioColor).toBe('green');
    expect(insights.activityDigest?.topSourceShare).toBe(33);
  });
});
