import { useCallback, useMemo, useState } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { TranslationKeys } from '../../i18n';
import type { IncidentEntry, LogEntry } from './types';
import { buildDashboardIncidentDigest } from './insights';
import { formatMaybeValue, formatTime } from './utils';

const INCIDENT_ACTION_LABELS = {
  immediate: 'openLatestIncident',
  focused: 'openTopSource',
  distributed: 'openRecentLogs',
  monitor: 'openLatestIncident',
} as const;

export function useDashboardIncidents(
  incidents: IncidentEntry[],
  _logs: LogEntry[],
  t: TranslationKeys,
  getIncidentLevelLabel: (level: 'warn' | 'error') => string,
  formatIncidentSummary: (entry?: IncidentEntry | null) => string,
) {
  const navigate = useNavigate();
  const dashboard = t.dashboard;
  const [copyingIncidentDigest, setCopyingIncidentDigest] = useState(false);
  const [copyingLatestIncident, setCopyingLatestIncident] = useState(false);
  const [copyingTopIncidentSource, setCopyingTopIncidentSource] = useState(false);
  const [copyingTopIncidentSources, setCopyingTopIncidentSources] = useState(false);
  const [copyingTopSourceLatestIncident, setCopyingTopSourceLatestIncident] = useState(false);

  const incidentDigest = useMemo(
    () => buildDashboardIncidentDigest(incidents, dashboard),
    [dashboard, incidents],
  );

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

    switch (incidentDigest.incidentAction) {
      case 'focused':
        handleOpenTopIncidentSource();
        return;
      case 'distributed':
        handleOpenRecentLogs();
        return;
      case 'immediate':
      case 'monitor':
      default:
        handleOpenLatestIncident();
    }
  }, [handleOpenLatestIncident, handleOpenRecentLogs, handleOpenTopIncidentSource, incidentDigest]);

  const incidentSuggestedActionLabel = useMemo(() => {
    if (!incidentDigest) {
      return dashboard.openLatestIncident;
    }

    const labelKey = INCIDENT_ACTION_LABELS[incidentDigest.incidentAction];
    return dashboard[labelKey];
  }, [dashboard, incidentDigest]);

  const handleCopyIncidentDigest = useCallback(async () => {
    if (!incidentDigest) {
      void message.warning(dashboard.incidentDigestUnavailable);
      return;
    }

    setCopyingIncidentDigest(true);
    const summaryLines = [
      dashboard.incidentDigestTitle,
      `${dashboard.incidentHeatLabel}: ${incidentDigest.heat.label}`,
      `${dashboard.incidentTrendLabel}: ${incidentDigest.trend.label}`,
      `${dashboard.incidentFreshnessLabel}: ${incidentDigest.freshness.label}`,
      `${dashboard.totalIncidentsLabel}: ${incidentDigest.total}`,
      `${dashboard.incidentIssues15Label}: ${incidentDigest.incidents15}`,
      `${dashboard.incidentIssues60Label}: ${incidentDigest.incidents60}`,
      `${dashboard.errorCountLabel}: ${incidentDigest.errors}`,
      `${dashboard.warningCountLabel}: ${incidentDigest.warnings}`,
      `${dashboard.errorRatioLabel}: ${incidentDigest.errorRatio}%`,
      incidentDigest.topSource ? `${dashboard.topSourceShareDigestLabel}: ${incidentDigest.topSource[0]} (${incidentDigest.topSourceRatio}%)` : null,
      `${dashboard.topSourcesConcentrationLabel}: ${incidentDigest.topSourcesConcentration}%`,
      `${dashboard.incidentSourceModeLabel}: ${incidentDigest.sourceMode.label}`,
      `${dashboard.incidentSourceModeHintLabel}: ${incidentDigest.sourceModeHint}`,
      `${dashboard.incidentActionHintLabel}: ${incidentDigest.incidentActionHint}`,
      incidentDigest.topSourceLatestIncident
        ? `${dashboard.topSourceLatestDigestLabel}: ${formatIncidentSummary(incidentDigest.topSourceLatestIncident)}`
        : null,
      incidentDigest.topSourceLatestIncident ? `${dashboard.topSourceLatestLevelDigestLabel}: ${getIncidentLevelLabel(incidentDigest.topSourceLatestIncident.level)}` : null,
      incidentDigest.topSourceLatestIncident ? `${dashboard.topSourceFreshnessLabel}: ${incidentDigest.topSourceFreshness.label}` : null,
      incidentDigest.topSourceLatestIncident ? `${dashboard.topSourceMessageDigestLabel}: ${incidentDigest.topSourceLatestIncident.message}` : null,
      `${dashboard.latestIncidentDigestLabel}: ${formatIncidentSummary(incidentDigest.latestIncident)}`,
      `${dashboard.latestSourceDigestLabel}: ${formatMaybeValue(incidentDigest.latestIncident.source, t.settings.noneValue)}`,
      `${dashboard.latestMessageLabel}: ${incidentDigest.latestIncident.message}`,
      incidentDigest.topSources.length
        ? `${dashboard.topSourcesDigestLabel}: ${incidentDigest.topSources.map(([source, count]) => `${source} (${count})`).join(', ')}`
        : null,
    ].filter(Boolean) as string[];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(dashboard.incidentDigestCopied);
    } catch {
      void message.error(dashboard.incidentDigestCopyFailed);
    } finally {
      setCopyingIncidentDigest(false);
    }
  }, [dashboard, formatIncidentSummary, getIncidentLevelLabel, incidentDigest, t.settings.noneValue]);

  const handleCopyLatestIncident = useCallback(async () => {
    if (!incidentDigest?.latestIncident) {
      void message.warning(dashboard.latestIncidentUnavailable);
      return;
    }

    setCopyingLatestIncident(true);
    const latestIncident = incidentDigest.latestIncident;
    const summaryLines = [
      dashboard.latestIncidentDigestTitle,
      `${dashboard.levelLabel}: ${getIncidentLevelLabel(latestIncident.level)}`,
      `${dashboard.timestampLabel}: ${formatTime(latestIncident.timestamp)}`,
      `${dashboard.sourceLabel}: ${formatMaybeValue(latestIncident.source, t.settings.noneValue)}`,
      `${dashboard.messageLabel}: ${latestIncident.message}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(dashboard.latestIncidentCopied);
    } catch {
      void message.error(dashboard.latestIncidentCopyFailed);
    } finally {
      setCopyingLatestIncident(false);
    }
  }, [dashboard, getIncidentLevelLabel, incidentDigest, t.settings.noneValue]);

  const handleCopyTopIncidentSource = useCallback(async () => {
    if (!incidentDigest?.topSource) {
      void message.warning(dashboard.topIncidentSourceUnavailable);
      return;
    }

    setCopyingTopIncidentSource(true);
    const summaryLines = [
      dashboard.topIncidentSourceDigestTitle,
      `${dashboard.sourceLabel}: ${incidentDigest.topSource[0]}`,
      `${dashboard.topIncidentSourceCountLabel}: ${incidentDigest.topSource[1]}`,
      incidentDigest.topSourceLatestIncident
        ? `${dashboard.latestIncidentDigestLabel}: ${formatIncidentSummary(incidentDigest.topSourceLatestIncident)}`
        : null,
      incidentDigest.topSourceLatestIncident ? `${dashboard.latestMessageLabel}: ${incidentDigest.topSourceLatestIncident.message}` : null,
    ].filter(Boolean) as string[];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(dashboard.topIncidentSourceCopied);
    } catch {
      void message.error(dashboard.topIncidentSourceCopyFailed);
    } finally {
      setCopyingTopIncidentSource(false);
    }
  }, [dashboard, formatIncidentSummary, incidentDigest]);

  const handleCopyTopIncidentSources = useCallback(async () => {
    if (!incidentDigest?.topSources.length) {
      void message.warning(dashboard.topIncidentSourcesUnavailable);
      return;
    }

    setCopyingTopIncidentSources(true);
    const summaryLines = [
      dashboard.topIncidentSourcesDigestTitle,
      ...incidentDigest.topSources.map(([source, count], index) => `${index + 1}. ${source} (${count})`),
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(dashboard.topIncidentSourcesCopied);
    } catch {
      void message.error(dashboard.topIncidentSourcesCopyFailed);
    } finally {
      setCopyingTopIncidentSources(false);
    }
  }, [dashboard, incidentDigest]);

  const handleCopyTopSourceLatestIncident = useCallback(async () => {
    if (!incidentDigest?.topSourceLatestIncident) {
      void message.warning(dashboard.topSourceLatestIncidentUnavailable);
      return;
    }

    setCopyingTopSourceLatestIncident(true);
    const latestIncident = incidentDigest.topSourceLatestIncident;
    const summaryLines = [
      dashboard.topSourceLatestIncidentDigestTitle,
      `${dashboard.sourceLabel}: ${formatMaybeValue(latestIncident.source, t.settings.noneValue)}`,
      `${dashboard.levelLabel}: ${getIncidentLevelLabel(latestIncident.level)}`,
      `${dashboard.timestampLabel}: ${formatTime(latestIncident.timestamp)}`,
      `${dashboard.messageLabel}: ${latestIncident.message}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(dashboard.topSourceLatestIncidentCopied);
    } catch {
      void message.error(dashboard.topSourceLatestIncidentCopyFailed);
    } finally {
      setCopyingTopSourceLatestIncident(false);
    }
  }, [dashboard, getIncidentLevelLabel, incidentDigest, t.settings.noneValue]);

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
    handleCopyTopSourceLatestIncident,
  };
}
