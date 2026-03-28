import type { TranslationKeys } from '../../i18n';
import type { IncidentEntry, LogEntry } from './types';
import { DASHBOARD_LIMITS, DASHBOARD_THRESHOLDS, DASHBOARD_WINDOWS } from './constants';
import { isWithinLastMinutes, minutesSince } from './utils';

type DashboardTranslations = TranslationKeys['dashboard'];
type Tone = { color: string; label: string };
type ToneWithHint = Tone & { hint: string };

export type DashboardIncidentActionId = 'immediate' | 'focused' | 'distributed' | 'monitor';
export type DashboardActivityActionId = 'hottest' | 'source' | 'recent' | 'latest';

export interface DashboardRepeatedIssue {
  entry: LogEntry;
  count: number;
}

export interface DashboardIncidentDigest {
  total: number;
  errors: number;
  warnings: number;
  incidents15: number;
  incidents60: number;
  heat: Tone;
  trend: Tone;
  sourceMode: Tone;
  sourceModeHint: string;
  incidentAction: DashboardIncidentActionId;
  incidentActionHint: string;
  freshness: Tone;
  errorRatio: number;
  errorRatioColor: string;
  latestIncident: IncidentEntry;
  latestIncidentLevel: Tone;
  topSource: [string, number] | null;
  topSourceLatestIncident: IncidentEntry | null;
  topSourceFreshness: Tone;
  topSourceLatestLevel: Tone;
  topSourceRatio: number;
  topSourceShareColor: string;
  topSourcesConcentration: number;
  topSourcesConcentrationColor: string;
  topSources: Array<[string, number]>;
}

export interface DashboardActivityDigest {
  total: number;
  issues15: number;
  issues60: number;
  errors: number;
  warnings: number;
  debugs: number;
  infos: number;
  issueRatio: number;
  issueRatioColor: string;
  latestEntry: LogEntry;
  activityFreshness: Tone;
  latestActivityLevel: Tone;
  hottestIssueFreshness: Tone;
  hottestIssueLevel: Tone;
  activitySignalMode: ToneWithHint;
  hottestRecentIssue: DashboardRepeatedIssue | null;
  topRecentIssues: DashboardRepeatedIssue[];
  topSources: Array<[string, number]>;
  topSource: [string, number] | null;
  topSourceLatestEntry: LogEntry | null;
  topSourceLatestFreshness: Tone;
  topSourceLatestLevel: Tone;
  topSourceShare: number;
  topSourceShareColor: string;
  topSourcesConcentration: number;
  topSourcesConcentrationColor: string;
  activitySourceMode: ToneWithHint;
  activityAction: DashboardActivityActionId;
  activityActionHint: string;
}

export interface DashboardActivityInsights {
  logHeat: Tone & { incidents15: number; incidents60: number };
  topRecentIssues: DashboardRepeatedIssue[];
  hottestRecentIssue: DashboardRepeatedIssue | null;
  activityDigest: DashboardActivityDigest | null;
}

function sortByNewest<T extends { timestamp: string }>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}

function countMatching<T>(entries: readonly T[], predicate: (entry: T) => boolean): number {
  return entries.filter(predicate).length;
}

function createFreshnessTone(minutes: number | null, dashboard: DashboardTranslations): Tone {
  if (minutes !== null && minutes <= DASHBOARD_WINDOWS.freshnessHotMinutes) {
    return { color: 'volcano', label: dashboard.incidentFreshnessHot };
  }

  if (minutes !== null && minutes <= DASHBOARD_WINDOWS.freshnessWarmMinutes) {
    return { color: 'gold', label: dashboard.incidentFreshnessWarm };
  }

  return { color: 'green', label: dashboard.incidentFreshnessStale };
}

function createIncidentHeatTone(incidents15: number, incidents60: number, dashboard: DashboardTranslations): Tone {
  if (incidents15 >= DASHBOARD_THRESHOLDS.hotIssueCount) {
    return { color: 'red', label: dashboard.logHeatHot };
  }

  if (incidents15 > 0 || incidents60 >= DASHBOARD_THRESHOLDS.elevatedIssueCount) {
    return { color: 'gold', label: dashboard.logHeatElevated };
  }

  return { color: 'green', label: dashboard.logHeatCalm };
}

function createIncidentTrendTone(incidents15: number, incidents60: number, dashboard: DashboardTranslations): Tone {
  if (
    incidents15 >= DASHBOARD_THRESHOLDS.hotIssueCount
    && incidents15 * 2 >= Math.max(incidents60, 1)
  ) {
    return { color: 'volcano', label: dashboard.incidentTrendSpiking };
  }

  if (incidents15 > 0) {
    return { color: 'gold', label: dashboard.incidentTrendActive };
  }

  return { color: 'blue', label: dashboard.incidentTrendCooling };
}

function createSourceModeTone(
  concentrationPercent: number,
  dashboard: DashboardTranslations,
  labels: {
    focused: string;
    focusedHint: string;
    mixed: string;
    mixedHint: string;
    distributed: string;
    distributedHint: string;
  },
): ToneWithHint {
  if (concentrationPercent >= DASHBOARD_THRESHOLDS.sourceModeFocusedPercent) {
    return { color: 'volcano', label: labels.focused, hint: labels.focusedHint };
  }

  if (concentrationPercent >= DASHBOARD_THRESHOLDS.sourceModeMixedPercent) {
    return { color: 'gold', label: labels.mixed, hint: labels.mixedHint };
  }

  return { color: 'green', label: labels.distributed, hint: labels.distributedHint };
}

function createIncidentLevelTone(level: IncidentEntry['level'], dashboard: DashboardTranslations): Tone {
  return level === 'error'
    ? { color: 'red', label: dashboard.errorCountLabel }
    : { color: 'gold', label: dashboard.warningCountLabel };
}

function createLogLevelTone(level: LogEntry['level'], dashboard: DashboardTranslations): Tone {
  if (level === 'error') {
    return { color: 'red', label: dashboard.errorCountLabel };
  }

  if (level === 'warn') {
    return { color: 'gold', label: dashboard.warningCountLabel };
  }

  if (level === 'debug') {
    return { color: 'cyan', label: dashboard.debugCountLabel };
  }

  return { color: 'blue', label: dashboard.infoCountLabel };
}

function createIssueRatioColor(issueRatio: number): string {
  if (issueRatio >= DASHBOARD_THRESHOLDS.issueRatioHighPercent) {
    return 'red';
  }

  if (issueRatio >= DASHBOARD_THRESHOLDS.issueRatioMediumPercent) {
    return 'gold';
  }

  return 'green';
}

function createIncidentSourceShareColor(sourceShare: number): string {
  if (sourceShare >= DASHBOARD_THRESHOLDS.incidentSourceShareHotPercent) {
    return 'volcano';
  }

  if (sourceShare >= DASHBOARD_THRESHOLDS.incidentSourceShareWarmPercent) {
    return 'gold';
  }

  return 'geekblue';
}

function createIncidentConcentrationColor(concentrationPercent: number): string {
  if (concentrationPercent >= DASHBOARD_THRESHOLDS.sourceModeFocusedPercent) {
    return 'volcano';
  }

  if (concentrationPercent >= DASHBOARD_THRESHOLDS.incidentConcentrationWarmPercent) {
    return 'gold';
  }

  return 'green';
}

function createActivitySourceShareColor(sourceShare: number): string {
  return sourceShare >= DASHBOARD_THRESHOLDS.activitySourceShareFocusedPercent ? 'cyan' : 'blue';
}

function createActivityConcentrationColor(concentrationPercent: number): string {
  if (concentrationPercent >= DASHBOARD_THRESHOLDS.sourceModeFocusedPercent) {
    return 'cyan';
  }

  if (concentrationPercent >= DASHBOARD_THRESHOLDS.sourceModeMixedPercent) {
    return 'blue';
  }

  return 'green';
}

function createActivitySignalTone(issueRatio: number, dashboard: DashboardTranslations): ToneWithHint {
  if (issueRatio >= DASHBOARD_THRESHOLDS.issueRatioHighPercent) {
    return {
      color: 'red',
      label: dashboard.activitySignalHeavy,
      hint: dashboard.activitySignalHeavyHint,
    };
  }

  if (issueRatio >= DASHBOARD_THRESHOLDS.issueRatioMediumPercent) {
    return {
      color: 'gold',
      label: dashboard.activitySignalMixed,
      hint: dashboard.activitySignalMixedHint,
    };
  }

  return {
    color: 'green',
    label: dashboard.activitySignalLight,
    hint: dashboard.activitySignalLightHint,
  };
}

function normalizeIssueKey(message: string): string {
  return message.trim().toLowerCase();
}

function buildTopSources<T extends { source: string }>(
  entries: readonly T[],
  limit = DASHBOARD_LIMITS.topSources,
): Array<[string, number]> {
  const sourceCounts = entries.reduce((accumulator, entry) => {
    const next = new Map(accumulator);
    next.set(entry.source, (accumulator.get(entry.source) ?? 0) + 1);
    return next;
  }, new Map<string, number>());

  return Array.from(sourceCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function buildTopRecentIssues(logs: readonly LogEntry[], now = Date.now()): DashboardRepeatedIssue[] {
  const recentIssues = logs.filter(
    (entry) => (
      (entry.level === 'warn' || entry.level === 'error')
      && isWithinLastMinutes(entry.timestamp, DASHBOARD_WINDOWS.recentIssuesMinutes, now)
    ),
  );

  const grouped = recentIssues.reduce((accumulator, entry) => {
    const key = normalizeIssueKey(entry.message);
    const previous = accumulator.get(key);
    const next = new Map(accumulator);

    if (!previous) {
      next.set(key, { entry, count: 1 });
      return next;
    }

    const previousTime = new Date(previous.entry.timestamp).getTime();
    const currentTime = new Date(entry.timestamp).getTime();
    next.set(key, {
      entry: currentTime > previousTime ? entry : previous.entry,
      count: previous.count + 1,
    });
    return next;
  }, new Map<string, DashboardRepeatedIssue>());

  return Array.from(grouped.values())
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return new Date(right.entry.timestamp).getTime() - new Date(left.entry.timestamp).getTime();
    })
    .slice(0, DASHBOARD_LIMITS.topSources);
}

export function buildDashboardIncidentDigest(
  incidents: readonly IncidentEntry[],
  dashboard: DashboardTranslations,
  now = Date.now(),
): DashboardIncidentDigest | null {
  if (incidents.length === 0) {
    return null;
  }

  const latestIncident = sortByNewest(incidents)[0];
  if (!latestIncident) {
    return null;
  }

  const topSources = buildTopSources(incidents);
  const topSource = topSources[0] ?? null;
  const topSourcesConcentration = incidents.length > 0
    ? Math.round((topSources.reduce((sum, [, count]) => sum + count, 0) / incidents.length) * 100)
    : 0;
  const topSourceLatestIncident = topSource
    ? sortByNewest(incidents.filter((incident) => incident.source === topSource[0]))[0] ?? null
    : null;
  const latestIncidentMinutes = minutesSince(latestIncident.timestamp, now);
  const incidents15 = countMatching(
    incidents,
    (incident) => isWithinLastMinutes(incident.timestamp, DASHBOARD_WINDOWS.urgentIssuesMinutes, now),
  );
  const incidents60 = countMatching(
    incidents,
    (incident) => isWithinLastMinutes(incident.timestamp, DASHBOARD_WINDOWS.recentIssuesMinutes, now),
  );
  const errors = countMatching(incidents, (incident) => incident.level === 'error');
  const warnings = countMatching(incidents, (incident) => incident.level === 'warn');
  const errorRatio = incidents.length > 0 ? Math.round((errors / incidents.length) * 100) : 0;
  const topSourceLatestMinutes = minutesSince(topSourceLatestIncident?.timestamp ?? null, now);
  const sourceMode = createSourceModeTone(topSourcesConcentration, dashboard, {
    focused: dashboard.incidentSourceModeFocused,
    focusedHint: dashboard.incidentSourceModeFocusedHint,
    mixed: dashboard.incidentSourceModeMixed,
    mixedHint: dashboard.incidentSourceModeMixedHint,
    distributed: dashboard.incidentSourceModeDistributed,
    distributedHint: dashboard.incidentSourceModeDistributedHint,
  });

  const incidentAction: DashboardIncidentActionId =
    incidents15 >= DASHBOARD_THRESHOLDS.hotIssueCount && latestIncidentMinutes !== null && latestIncidentMinutes <= DASHBOARD_WINDOWS.freshnessHotMinutes
      ? 'immediate'
      : topSourcesConcentration >= DASHBOARD_THRESHOLDS.sourceModeFocusedPercent
        ? 'focused'
        : topSourcesConcentration < DASHBOARD_THRESHOLDS.sourceModeMixedPercent && incidents60 >= DASHBOARD_THRESHOLDS.elevatedIssueCount
          ? 'distributed'
          : 'monitor';

  const incidentActionHintById: Record<DashboardIncidentActionId, string> = {
    immediate: dashboard.incidentActionImmediate,
    focused: dashboard.incidentActionFocused,
    distributed: dashboard.incidentActionDistributed,
    monitor: dashboard.incidentActionMonitor,
  };

  return {
    total: incidents.length,
    errors,
    warnings,
    incidents15,
    incidents60,
    heat: createIncidentHeatTone(incidents15, incidents60, dashboard),
    trend: createIncidentTrendTone(incidents15, incidents60, dashboard),
    sourceMode,
    sourceModeHint: sourceMode.hint,
    incidentAction,
    incidentActionHint: incidentActionHintById[incidentAction],
    freshness: createFreshnessTone(latestIncidentMinutes, dashboard),
    errorRatio,
    errorRatioColor: createIssueRatioColor(errorRatio),
    latestIncident,
    latestIncidentLevel: createIncidentLevelTone(latestIncident.level, dashboard),
    topSource,
    topSourceLatestIncident,
    topSourceFreshness: createFreshnessTone(topSourceLatestMinutes, dashboard),
    topSourceLatestLevel: createIncidentLevelTone(topSourceLatestIncident?.level ?? 'warn', dashboard),
    topSourceRatio: topSource ? Math.round((topSource[1] / incidents.length) * 100) : 0,
    topSourceShareColor: createIncidentSourceShareColor(
      topSource ? Math.round((topSource[1] / incidents.length) * 100) : 0,
    ),
    topSourcesConcentration,
    topSourcesConcentrationColor: createIncidentConcentrationColor(topSourcesConcentration),
    topSources,
  };
}

export function buildDashboardActivityInsights(
  logs: readonly LogEntry[],
  dashboard: DashboardTranslations,
  now = Date.now(),
): DashboardActivityInsights {
  const incidents15 = countMatching(
    logs,
    (entry) => (
      (entry.level === 'warn' || entry.level === 'error')
      && isWithinLastMinutes(entry.timestamp, DASHBOARD_WINDOWS.urgentIssuesMinutes, now)
    ),
  );
  const incidents60 = countMatching(
    logs,
    (entry) => (
      (entry.level === 'warn' || entry.level === 'error')
      && isWithinLastMinutes(entry.timestamp, DASHBOARD_WINDOWS.recentIssuesMinutes, now)
    ),
  );
  const logHeat = {
    ...createIncidentHeatTone(incidents15, incidents60, dashboard),
    incidents15,
    incidents60,
  };
  const topRecentIssues = buildTopRecentIssues(logs, now);
  const hottestRecentIssue = topRecentIssues[0] ?? null;

  if (logs.length === 0) {
    return {
      logHeat,
      topRecentIssues,
      hottestRecentIssue,
      activityDigest: null,
    };
  }

  const latestEntry = sortByNewest(logs)[0];
  if (!latestEntry) {
    return {
      logHeat,
      topRecentIssues,
      hottestRecentIssue,
      activityDigest: null,
    };
  }

  const latestActivityMinutes = minutesSince(latestEntry.timestamp, now);
  const hottestIssueMinutes = minutesSince(hottestRecentIssue?.entry.timestamp ?? null, now);
  const topSources = buildTopSources(logs.filter((entry): entry is LogEntry & { source: string } => Boolean(entry.source)));
  const topSource = topSources[0] ?? null;
  const topSourceLatestEntry = topSource
    ? sortByNewest(
      logs.filter(
        (entry): entry is LogEntry & { source: string } => entry.source === topSource[0],
      ),
    )[0] ?? null
    : null;
  const topSourceLatestMinutes = minutesSince(topSourceLatestEntry?.timestamp ?? null, now);
  const errors = countMatching(logs, (entry) => entry.level === 'error');
  const warnings = countMatching(logs, (entry) => entry.level === 'warn');
  const debugs = countMatching(logs, (entry) => entry.level === 'debug');
  const infos = countMatching(logs, (entry) => entry.level === 'info');
  const issueRatio = logs.length > 0
    ? Math.round(((errors + warnings) / logs.length) * 100)
    : 0;
  const topSourceShare = topSource ? Math.round((topSource[1] / logs.length) * 100) : 0;
  const topSourcesConcentration = logs.length > 0
    ? Math.round((topSources.reduce((sum, [, count]) => sum + count, 0) / logs.length) * 100)
    : 0;
  const activitySourceMode = createSourceModeTone(topSourcesConcentration, dashboard, {
    focused: dashboard.activitySourceModeFocused,
    focusedHint: dashboard.activitySourceModeFocusedHint,
    mixed: dashboard.activitySourceModeMixed,
    mixedHint: dashboard.activitySourceModeMixedHint,
    distributed: dashboard.activitySourceModeDistributed,
    distributedHint: dashboard.activitySourceModeDistributedHint,
  });

  const activityAction: DashboardActivityActionId =
    logHeat.incidents15 >= DASHBOARD_THRESHOLDS.hotIssueCount && hottestRecentIssue
      ? 'hottest'
      : topSourceShare >= DASHBOARD_THRESHOLDS.activitySourceShareFocusedPercent && topSource
        ? 'source'
        : logHeat.incidents60 >= DASHBOARD_THRESHOLDS.elevatedIssueCount
          ? 'recent'
          : 'latest';

  const activityActionHintById: Record<DashboardActivityActionId, string> = {
    hottest: dashboard.activityActionHottest,
    source: dashboard.activityActionSource,
    recent: dashboard.activityActionRecent,
    latest: dashboard.activityActionLatest,
  };

  const activityDigest: DashboardActivityDigest = {
    total: logs.length,
    issues15: logHeat.incidents15,
    issues60: logHeat.incidents60,
    errors,
    warnings,
    debugs,
    infos,
    issueRatio,
    issueRatioColor: createIssueRatioColor(issueRatio),
    latestEntry,
    activityFreshness: createFreshnessTone(latestActivityMinutes, dashboard),
    latestActivityLevel: createLogLevelTone(latestEntry.level, dashboard),
    hottestIssueFreshness: createFreshnessTone(hottestIssueMinutes, dashboard),
    hottestIssueLevel: createIncidentLevelTone(hottestRecentIssue?.entry.level ?? 'warn', dashboard),
    activitySignalMode: createActivitySignalTone(issueRatio, dashboard),
    hottestRecentIssue,
    topRecentIssues,
    topSources,
    topSource,
    topSourceLatestEntry,
    topSourceLatestFreshness: createFreshnessTone(topSourceLatestMinutes, dashboard),
    topSourceLatestLevel: createLogLevelTone(topSourceLatestEntry?.level ?? 'info', dashboard),
    topSourceShare,
    topSourceShareColor: createActivitySourceShareColor(topSourceShare),
    topSourcesConcentration,
    topSourcesConcentrationColor: createActivityConcentrationColor(topSourcesConcentration),
    activitySourceMode,
    activityAction,
    activityActionHint: activityActionHintById[activityAction],
  };

  return {
    logHeat,
    topRecentIssues,
    hottestRecentIssue,
    activityDigest,
  };
}
