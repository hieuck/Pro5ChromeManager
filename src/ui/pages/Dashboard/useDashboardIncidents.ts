import { useCallback, useMemo, useState } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { IncidentEntry, LogEntry } from './types';
import { formatTime, minutesSince, isWithinLastMinutes, formatMaybeValue } from './utils';

export function useDashboardIncidents(
  incidents: IncidentEntry[],
  logs: LogEntry[],
  t: any,
  getIncidentLevelLabel: (level: 'warn' | 'error') => string,
  formatIncidentSummary: (entry?: IncidentEntry | null) => string
) {
  const navigate = useNavigate();
  const [copyingIncidentDigest, setCopyingIncidentDigest] = useState(false);
  const [copyingLatestIncident, setCopyingLatestIncident] = useState(false);
  const [copyingTopIncidentSource, setCopyingTopIncidentSource] = useState(false);
  const [copyingTopIncidentSources, setCopyingTopIncidentSources] = useState(false);
  const [copyingTopSourceLatestIncident, setCopyingTopSourceLatestIncident] = useState(false);

  const incidentDigest = useMemo(() => {
    if (!incidents.length) {
      return null;
    }

    const latestIncident = incidents
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    const topSources = Array.from(
      incidents.reduce((acc, incident) => {
        acc.set(incident.source, (acc.get(incident.source) ?? 0) + 1);
        return acc;
      }, new Map<string, number>()),
    ).sort((a, b) => b[1] - a[1]);

    const topSource = topSources[0] ?? null;
    const topSourcesSlice = topSources.slice(0, 3);
    const topSourcesConcentration = incidents.length
      ? Math.round((topSourcesSlice.reduce((sum, [, count]) => sum + count, 0) / incidents.length) * 100)
      : 0;
    const topSourceLatestIncident = topSource
      ? incidents
          .filter((incident) => incident.source === topSource[0])
          .slice()
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? null
      : null;
    const latestIncidentMinutes = minutesSince(latestIncident.timestamp);
    const incidents15 = incidents.filter((incident) => isWithinLastMinutes(incident.timestamp, 15)).length;
    const incidents60 = incidents.filter((incident) => isWithinLastMinutes(incident.timestamp, 60)).length;
    
    const heat =
      incidents15 >= 3
        ? { color: 'red', label: t.dashboard.logHeatHot }
        : incidents15 > 0 || incidents60 >= 5
          ? { color: 'gold', label: t.dashboard.logHeatElevated }
          : { color: 'green', label: t.dashboard.logHeatCalm };
    
    const trend =
      incidents15 >= 3 && incidents15 * 2 >= Math.max(incidents60, 1)
        ? { color: 'volcano', label: t.dashboard.incidentTrendSpiking }
        : incidents15 > 0
          ? { color: 'gold', label: t.dashboard.incidentTrendActive }
          : { color: 'blue', label: t.dashboard.incidentTrendCooling };
    
    const sourceMode =
      topSourcesConcentration >= 80
        ? { color: 'volcano', label: t.dashboard.incidentSourceModeFocused }
        : topSourcesConcentration >= 50
          ? { color: 'gold', label: t.dashboard.incidentSourceModeMixed }
          : { color: 'green', label: t.dashboard.incidentSourceModeDistributed };
    
    const sourceModeHint =
      topSourcesConcentration >= 80
        ? t.dashboard.incidentSourceModeFocusedHint
        : topSourcesConcentration >= 50
          ? t.dashboard.incidentSourceModeMixedHint
          : t.dashboard.incidentSourceModeDistributedHint;
    
    const freshness =
      latestIncidentMinutes !== null && latestIncidentMinutes <= 5
        ? { color: 'volcano', label: t.dashboard.incidentFreshnessHot }
        : latestIncidentMinutes !== null && latestIncidentMinutes <= 30
          ? { color: 'gold', label: t.dashboard.incidentFreshnessWarm }
          : { color: 'green', label: t.dashboard.incidentFreshnessStale };
    
    const topSourceLatestMinutes = minutesSince(topSourceLatestIncident?.timestamp ?? null);
    const topSourceFreshness =
      topSourceLatestMinutes !== null && topSourceLatestMinutes <= 5
        ? { color: 'volcano', label: t.dashboard.incidentFreshnessHot }
        : topSourceLatestMinutes !== null && topSourceLatestMinutes <= 30
          ? { color: 'gold', label: t.dashboard.incidentFreshnessWarm }
          : { color: 'green', label: t.dashboard.incidentFreshnessStale };
    
    const topSourceLatestLevel =
      topSourceLatestIncident?.level === 'error'
        ? { color: 'red', label: t.dashboard.errorCountLabel }
        : { color: 'gold', label: t.dashboard.warningCountLabel };
    
    const incidentActionHint =
      incidents15 >= 3 && latestIncidentMinutes !== null && latestIncidentMinutes <= 5
        ? t.dashboard.incidentActionImmediate
        : topSourcesConcentration >= 80
          ? t.dashboard.incidentActionFocused
          : topSourcesConcentration < 50 && incidents60 >= 5
            ? t.dashboard.incidentActionDistributed
            : t.dashboard.incidentActionMonitor;

    return {
      total: incidents.length,
      errors: incidents.filter((incident) => incident.level === 'error').length,
      warnings: incidents.filter((incident) => incident.level === 'warn').length,
      incidents15,
      incidents60,
      heat,
      trend,
      sourceMode,
      sourceModeHint,
      incidentActionHint,
      freshness,
      errorRatio: incidents.length ? Math.round((incidents.filter((incident) => incident.level === 'error').length / incidents.length) * 100) : 0,
      latestIncident,
      topSource,
      topSourceLatestIncident,
      topSourceFreshness,
      topSourceLatestLevel,
      topSourceRatio: topSource ? Math.round((topSource[1] / incidents.length) * 100) : 0,
      topSourcesConcentration,
      topSources: topSourcesSlice,
    };
  }, [incidents, t.dashboard]);

  const handleOpenIncidentInLogs = useCallback((incident: IncidentEntry) => {
    navigate('/logs', {
      state: {
        presetQuery: incident.message,
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
      },
    });
  }, [navigate]);

  const handleOpenIncidentSource = useCallback((source?: string | null) => {
    if (!source) return;
    navigate('/logs', {
      state: {
        presetQuery: '',
        presetSourceFilter: source,
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

  const handleOpenTopIncidentSource = useCallback(() => {
    handleOpenIncidentSource(incidentDigest?.topSource?.[0] ?? null);
  }, [handleOpenIncidentSource, incidentDigest]);

  const handleOpenLatestIncident = useCallback(() => {
    if (!incidentDigest?.latestIncident) return;
    handleOpenIncidentInLogs(incidentDigest.latestIncident);
  }, [handleOpenIncidentInLogs, incidentDigest]);

  const handleOpenTopSourceLatestIncident = useCallback(() => {
    if (!incidentDigest?.topSourceLatestIncident) return;
    handleOpenIncidentInLogs(incidentDigest.topSourceLatestIncident);
  }, [handleOpenIncidentInLogs, incidentDigest]);

  const handleOpenRecentLogs = useCallback(() => {
    navigate('/logs', {
      state: {
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

  const handleIncidentSuggestedAction = useCallback(() => {
    if (!incidentDigest) return;
    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionImmediate) {
      handleOpenLatestIncident();
      return;
    }
    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionFocused) {
      handleOpenTopIncidentSource();
      return;
    }
    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionDistributed) {
      handleOpenRecentLogs();
      return;
    }
    handleOpenLatestIncident();
  }, [handleOpenLatestIncident, handleOpenRecentLogs, handleOpenTopIncidentSource, incidentDigest, t.dashboard]);

  const incidentSuggestedActionLabel = useMemo(() => {
    if (!incidentDigest) return t.dashboard.openLatestIncident;
    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionImmediate) return t.dashboard.openLatestIncident;
    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionFocused) return t.dashboard.openTopSource;
    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionDistributed) return t.dashboard.openRecentLogs;
    return t.dashboard.openLatestIncident;
  }, [incidentDigest, t.dashboard]);

  const handleCopyIncidentDigest = useCallback(async () => {
    if (!incidentDigest) {
      void message.warning(t.dashboard.incidentDigestUnavailable);
      return;
    }

    setCopyingIncidentDigest(true);
    const summaryLines = [
      t.dashboard.incidentDigestTitle,
      `${t.dashboard.incidentHeatLabel}: ${incidentDigest.heat.label}`,
      `${t.dashboard.incidentTrendLabel}: ${incidentDigest.trend.label}`,
      `${t.dashboard.incidentFreshnessLabel}: ${incidentDigest.freshness.label}`,
      `${t.dashboard.totalIncidentsLabel}: ${incidentDigest.total}`,
      `${t.dashboard.incidentIssues15Label}: ${incidentDigest.incidents15}`,
      `${t.dashboard.incidentIssues60Label}: ${incidentDigest.incidents60}`,
      `${t.dashboard.errorCountLabel}: ${incidentDigest.errors}`,
      `${t.dashboard.warningCountLabel}: ${incidentDigest.warnings}`,
      `${t.dashboard.errorRatioLabel}: ${incidentDigest.errorRatio}%`,
      incidentDigest.topSource ? `${t.dashboard.topSourceShareDigestLabel}: ${incidentDigest.topSource[0]} (${incidentDigest.topSourceRatio}%)` : null,
      `${t.dashboard.topSourcesConcentrationLabel}: ${incidentDigest.topSourcesConcentration}%`,
      `${t.dashboard.incidentSourceModeLabel}: ${incidentDigest.sourceMode.label}`,
      `${t.dashboard.incidentSourceModeHintLabel}: ${incidentDigest.sourceModeHint}`,
      `${t.dashboard.incidentActionHintLabel}: ${incidentDigest.incidentActionHint}`,
      incidentDigest.topSourceLatestIncident
        ? `${t.dashboard.topSourceLatestDigestLabel}: ${formatIncidentSummary(incidentDigest.topSourceLatestIncident)}`
        : null,
      incidentDigest.topSourceLatestIncident ? `${t.dashboard.topSourceLatestLevelDigestLabel}: ${getIncidentLevelLabel(incidentDigest.topSourceLatestIncident.level)}` : null,
      incidentDigest.topSourceLatestIncident ? `${t.dashboard.topSourceFreshnessLabel}: ${incidentDigest.topSourceFreshness.label}` : null,
      incidentDigest.topSourceLatestIncident ? `${t.dashboard.topSourceMessageDigestLabel}: ${incidentDigest.topSourceLatestIncident.message}` : null,
      `${t.dashboard.latestIncidentDigestLabel}: ${formatIncidentSummary(incidentDigest.latestIncident)}`,
      `${t.dashboard.latestSourceDigestLabel}: ${formatMaybeValue(incidentDigest.latestIncident.source)}`,
      `${t.dashboard.latestMessageLabel}: ${incidentDigest.latestIncident.message}`,
      incidentDigest.topSources.length
        ? `${t.dashboard.topSourcesDigestLabel}: ${incidentDigest.topSources.map(([source, count]) => `${source} (${count})`).join(', ')}`
        : null,
    ].filter(Boolean) as string[];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.incidentDigestCopied);
    } catch {
      void message.error(t.dashboard.incidentDigestCopyFailed);
    } finally {
      setCopyingIncidentDigest(false);
    }
  }, [incidentDigest, formatIncidentSummary, formatMaybeValue, getIncidentLevelLabel, t.dashboard]);

  const handleCopyLatestIncident = useCallback(async () => {
    if (!incidentDigest?.latestIncident) {
      void message.warning(t.dashboard.latestIncidentUnavailable);
      return;
    }

    setCopyingLatestIncident(true);
    const latestIncident = incidentDigest.latestIncident;
    const summaryLines = [
      t.dashboard.latestIncidentDigestTitle,
      `${t.dashboard.levelLabel}: ${getIncidentLevelLabel(latestIncident.level)}`,
      `${t.dashboard.timestampLabel}: ${formatTime(latestIncident.timestamp)}`,
      `${t.dashboard.sourceLabel}: ${formatMaybeValue(latestIncident.source)}`,
      `${t.dashboard.messageLabel}: ${latestIncident.message}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.latestIncidentCopied);
    } catch {
      void message.error(t.dashboard.latestIncidentCopyFailed);
    } finally {
      setCopyingLatestIncident(false);
    }
  }, [incidentDigest, formatMaybeValue, getIncidentLevelLabel, t.dashboard]);

  const handleCopyTopIncidentSource = useCallback(async () => {
    if (!incidentDigest?.topSource) {
      void message.warning(t.dashboard.topIncidentSourceUnavailable);
      return;
    }

    setCopyingTopIncidentSource(true);
    const summaryLines = [
      t.dashboard.topIncidentSourceDigestTitle,
      `${t.dashboard.sourceLabel}: ${incidentDigest.topSource[0]}`,
      `${t.dashboard.topIncidentSourceCountLabel}: ${incidentDigest.topSource[1]}`,
      incidentDigest.topSourceLatestIncident
        ? `${t.dashboard.latestIncidentDigestLabel}: ${formatIncidentSummary(incidentDigest.topSourceLatestIncident)}`
        : null,
      incidentDigest.topSourceLatestIncident ? `${t.dashboard.latestMessageLabel}: ${incidentDigest.topSourceLatestIncident.message}` : null,
    ].filter(Boolean) as string[];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topIncidentSourceCopied);
    } catch {
      void message.error(t.dashboard.topIncidentSourceCopyFailed);
    } finally {
      setCopyingTopIncidentSource(false);
    }
  }, [incidentDigest, formatIncidentSummary, t.dashboard]);

  const handleCopyTopIncidentSources = useCallback(async () => {
    if (!incidentDigest?.topSources.length) {
      void message.warning(t.dashboard.topIncidentSourcesUnavailable);
      return;
    }

    setCopyingTopIncidentSources(true);
    const summaryLines = [
      t.dashboard.topIncidentSourcesDigestTitle,
      ...incidentDigest.topSources.map(([source, count], index) => `${index + 1}. ${source} (${count})`),
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topIncidentSourcesCopied);
    } catch {
      void message.error(t.dashboard.topIncidentSourcesCopyFailed);
    } finally {
      setCopyingTopIncidentSources(false);
    }
  }, [incidentDigest, t.dashboard]);

  const handleCopyTopSourceLatestIncident = useCallback(async () => {
    if (!incidentDigest?.topSourceLatestIncident) {
      void message.warning(t.dashboard.topSourceLatestIncidentUnavailable);
      return;
    }

    setCopyingTopSourceLatestIncident(true);
    const latestIncident = incidentDigest.topSourceLatestIncident;
    const summaryLines = [
      t.dashboard.topSourceLatestIncidentDigestTitle,
      `${t.dashboard.sourceLabel}: ${formatMaybeValue(latestIncident.source)}`,
      `${t.dashboard.levelLabel}: ${getIncidentLevelLabel(latestIncident.level)}`,
      `${t.dashboard.timestampLabel}: ${formatTime(latestIncident.timestamp)}`,
      `${t.dashboard.messageLabel}: ${latestIncident.message}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topSourceLatestIncidentCopied);
    } catch {
      void message.error(t.dashboard.topSourceLatestIncidentCopyFailed);
    } finally {
      setCopyingTopSourceLatestIncident(false);
    }
  }, [incidentDigest, formatMaybeValue, getIncidentLevelLabel, t.dashboard]);

  return {
    incidentDigest,
    copyingIncidentDigest,
    copyingLatestIncident,
    copyingTopIncidentSource,
    copyingTopIncidentSources,
    copyingTopSourceLatestIncident,
    handleOpenIncidentInLogs,
    handleOpenIncidentSource,
    handleOpenTopIncidentSource,
    handleOpenLatestIncident,
    handleOpenTopSourceLatestIncident,
    handleOpenRecentLogs,
    handleIncidentSuggestedAction,
    incidentSuggestedActionLabel,
    handleCopyIncidentDigest,
    handleCopyLatestIncident,
    handleCopyTopIncidentSource,
    handleCopyTopIncidentSources,
    handleCopyTopSourceLatestIncident
  };
}
