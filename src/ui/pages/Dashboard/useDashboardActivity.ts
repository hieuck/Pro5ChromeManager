import { useCallback, useMemo, useState } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { LogEntry } from './types';
import { formatTime, minutesSince, isWithinLastMinutes } from './utils';

export function useDashboardActivity(
  logs: LogEntry[],
  t: any,
  getLogLevelLabel: (level: 'debug' | 'info' | 'warn' | 'error') => string,
  formatActivitySummary: (entry?: LogEntry | null) => string,
  handleOpenLogEntry: (entry: LogEntry) => void
) {
  const navigate = useNavigate();
  const [copyingActivityDigest, setCopyingActivityDigest] = useState(false);
  const [copyingLatestActivity, setCopyingLatestActivity] = useState(false);
  const [copyingTopActivityIssues, setCopyingTopActivityIssues] = useState(false);
  const [copyingTopActivitySourceLatest, setCopyingTopActivitySourceLatest] = useState(false);
  const [copyingTopActivitySources, setCopyingTopActivitySources] = useState(false);

  const logHeat = useMemo(() => {
    const incidents15 = logs.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 15)).length;
    const incidents60 = logs.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 60)).length;

    if (incidents15 >= 3) {
      return { color: 'red', label: t.dashboard.logHeatHot, incidents15, incidents60 };
    }
    if (incidents15 > 0 || incidents60 >= 5) {
      return { color: 'gold', label: t.dashboard.logHeatElevated, incidents15, incidents60 };
    }
    return { color: 'green', label: t.dashboard.logHeatCalm, incidents15, incidents60 };
  }, [logs, t.dashboard]);

  const topRecentIssues = useMemo(() => {
    const recentIssues = logs.filter((entry) => (entry.level === 'warn' || entry.level === 'error') && isWithinLastMinutes(entry.timestamp, 60));
    const issueCounts = new Map<string, { entry: LogEntry; count: number }>();

    recentIssues.forEach((entry) => {
      const key = entry.message.trim().toLowerCase();
      const current = issueCounts.get(key);
      if (!current) {
        issueCounts.set(key, { entry, count: 1 });
        return;
      }
      const nextCount = current.count + 1;
      const shouldReplaceEntry = new Date(entry.timestamp).getTime() > new Date(current.entry.timestamp).getTime();
      issueCounts.set(key, {
        entry: shouldReplaceEntry ? entry : current.entry,
        count: nextCount,
      });
    });

    return Array.from(issueCounts.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime();
      })
      .slice(0, 3);
  }, [logs]);

  const hottestRecentIssue = topRecentIssues[0] ?? null;

  const activityDigest = useMemo(() => {
    if (!logs.length) return null;

    const latestEntry = logs
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    const latestActivityMinutes = minutesSince(latestEntry.timestamp);
    const activityFreshness =
      latestActivityMinutes !== null && latestActivityMinutes <= 5
        ? { color: 'volcano', label: t.dashboard.incidentFreshnessHot }
        : latestActivityMinutes !== null && latestActivityMinutes <= 30
          ? { color: 'gold', label: t.dashboard.incidentFreshnessWarm }
          : { color: 'green', label: t.dashboard.incidentFreshnessStale };
    
    const latestActivityLevel =
      latestEntry.level === 'error'
        ? { color: 'red', label: t.dashboard.errorCountLabel }
        : latestEntry.level === 'warn'
          ? { color: 'gold', label: t.dashboard.warningCountLabel }
          : latestEntry.level === 'debug'
            ? { color: 'cyan', label: t.dashboard.debugCountLabel }
            : { color: 'blue', label: t.dashboard.infoCountLabel };
    
    const hottestIssueMinutes = minutesSince(hottestRecentIssue?.entry.timestamp ?? null);
    const hottestIssueFreshness =
      hottestIssueMinutes !== null && hottestIssueMinutes <= 5
        ? { color: 'volcano', label: t.dashboard.incidentFreshnessHot }
        : hottestIssueMinutes !== null && hottestIssueMinutes <= 30
          ? { color: 'gold', label: t.dashboard.incidentFreshnessWarm }
          : { color: 'green', label: t.dashboard.incidentFreshnessStale };
    
    const hottestIssueLevel =
      hottestRecentIssue?.entry.level === 'error'
        ? { color: 'red', label: t.dashboard.errorCountLabel }
        : { color: 'gold', label: t.dashboard.warningCountLabel };
    
    const issueRatio = logs.length
      ? Math.round(((logs.filter((entry) => entry.level === 'error' || entry.level === 'warn').length) / logs.length) * 100)
      : 0;
    
    const activitySignalMode =
      issueRatio >= 60
        ? { color: 'red', label: t.dashboard.activitySignalHeavy, hint: t.dashboard.activitySignalHeavyHint }
        : issueRatio >= 30
          ? { color: 'gold', label: t.dashboard.activitySignalMixed, hint: t.dashboard.activitySignalMixedHint }
          : { color: 'green', label: t.dashboard.activitySignalLight, hint: t.dashboard.activitySignalLightHint };
    
    const topSources = Array.from(
      logs.reduce((acc, entry) => {
        if (!entry.source) return acc;
        acc.set(entry.source, (acc.get(entry.source) ?? 0) + 1);
        return acc;
      }, new Map<string, number>()),
    ).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const topSource = topSources[0] ?? null;
    const topSourceLatestEntry = topSource
      ? logs
          .filter((entry) => entry.source === topSource[0])
          .slice()
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? null
      : null;
    
    const topSourceLatestMinutes = minutesSince(topSourceLatestEntry?.timestamp ?? null);
    const topSourceLatestFreshness =
      topSourceLatestMinutes !== null && topSourceLatestMinutes <= 5
        ? { color: 'volcano', label: t.dashboard.incidentFreshnessHot }
        : topSourceLatestMinutes !== null && topSourceLatestMinutes <= 30
          ? { color: 'gold', label: t.dashboard.incidentFreshnessWarm }
          : { color: 'green', label: t.dashboard.incidentFreshnessStale };
    
    const topSourceLatestLevel =
      topSourceLatestEntry?.level === 'error'
        ? { color: 'red', label: t.dashboard.errorCountLabel }
        : topSourceLatestEntry?.level === 'warn'
          ? { color: 'gold', label: t.dashboard.warningCountLabel }
          : topSourceLatestEntry?.level === 'debug'
            ? { color: 'cyan', label: t.dashboard.debugCountLabel }
            : { color: 'blue', label: t.dashboard.infoCountLabel };
    
    const topSourceShare = topSource ? Math.round((topSource[1] / logs.length) * 100) : 0;
    const topSourcesConcentration = logs.length
      ? Math.round((topSources.reduce((sum, [, count]) => sum + count, 0) / logs.length) * 100)
      : 0;
    
    const activitySourceMode =
      topSourcesConcentration >= 80
        ? { color: 'volcano', label: t.dashboard.activitySourceModeFocused, hint: t.dashboard.activitySourceModeFocusedHint }
        : topSourcesConcentration >= 50
          ? { color: 'gold', label: t.dashboard.activitySourceModeMixed, hint: t.dashboard.activitySourceModeMixedHint }
          : { color: 'green', label: t.dashboard.activitySourceModeDistributed, hint: t.dashboard.activitySourceModeDistributedHint };
    
    const activityActionHint =
      logHeat.incidents15 >= 3 && hottestRecentIssue
        ? t.dashboard.activityActionHottest
        : topSourceShare >= 50 && topSource
          ? t.dashboard.activityActionSource
          : logHeat.incidents60 >= 5
            ? t.dashboard.activityActionRecent
            : t.dashboard.activityActionLatest;

    return {
      total: logs.length,
      issues15: logHeat.incidents15,
      issues60: logHeat.incidents60,
      errors: logs.filter((entry) => entry.level === 'error').length,
      warnings: logs.filter((entry) => entry.level === 'warn').length,
      debugs: logs.filter((entry) => entry.level === 'debug').length,
      infos: logs.filter((entry) => entry.level === 'info').length,
      issueRatio,
      latestEntry,
      activityFreshness,
      latestActivityLevel,
      hottestIssueFreshness,
      hottestIssueLevel,
      activitySignalMode,
      hottestRecentIssue,
      topRecentIssues,
      topSources,
      topSource,
      topSourceLatestEntry,
      topSourceLatestFreshness,
      topSourceLatestLevel,
      topSourceShare,
      topSourcesConcentration,
      activitySourceMode,
      activityActionHint,
    };
  }, [logs, t.dashboard, logHeat, hottestRecentIssue, topRecentIssues]);

  const handleOpenActivitySource = useCallback((source?: string | null) => {
    if (!source) return;
    navigate('/logs', {
      state: {
        presetQuery: '',
        presetSourceFilter: source,
        presetFilter: 'all',
        presetRecentWindowOnly: false,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

  const handleOpenTopActivitySourceLatest = useCallback(() => {
    if (!activityDigest?.topSourceLatestEntry) return;
    handleOpenLogEntry(activityDigest.topSourceLatestEntry);
  }, [activityDigest, handleOpenLogEntry]);

  const handleOpenHottestIssueLogs = useCallback(() => {
    if (!hottestRecentIssue) return;
    handleOpenLogEntry(hottestRecentIssue.entry);
  }, [hottestRecentIssue, handleOpenLogEntry]);

  const handleOpenRecentLogs = useCallback(() => {
    navigate('/logs', {
      state: {
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

  const handleOpenLatestActivity = useCallback(() => {
    if (!activityDigest?.latestEntry) return;
    handleOpenLogEntry(activityDigest.latestEntry);
  }, [activityDigest, handleOpenLogEntry]);

  const handleActivitySuggestedAction = useCallback(() => {
    if (!activityDigest) return;
    if (activityDigest.activityActionHint === t.dashboard.activityActionHottest && hottestRecentIssue) {
      handleOpenHottestIssueLogs();
      return;
    }
    if (activityDigest.activityActionHint === t.dashboard.activityActionSource && activityDigest.topSource) {
      handleOpenActivitySource(activityDigest.topSource[0]);
      return;
    }
    if (activityDigest.activityActionHint === t.dashboard.activityActionRecent) {
      handleOpenRecentLogs();
      return;
    }
    handleOpenLatestActivity();
  }, [activityDigest, handleOpenActivitySource, handleOpenHottestIssueLogs, handleOpenLatestActivity, handleOpenRecentLogs, t.dashboard, hottestRecentIssue]);

  const activitySuggestedActionLabel = useMemo(() => {
    if (!activityDigest) return t.dashboard.openLatestActivity;
    if (activityDigest.activityActionHint === t.dashboard.activityActionHottest && hottestRecentIssue) return t.dashboard.openHottestIssue;
    if (activityDigest.activityActionHint === t.dashboard.activityActionSource && activityDigest.topSource) return t.dashboard.openTopActivitySource;
    if (activityDigest.activityActionHint === t.dashboard.activityActionRecent) return t.dashboard.openRecentLogs;
    return t.dashboard.openLatestActivity;
  }, [activityDigest, hottestRecentIssue, t.dashboard]);

  const handleCopyHottestIssue = useCallback(async () => {
    if (!hottestRecentIssue) {
      void message.warning(t.dashboard.hottestIssueUnavailable);
      return;
    }

    const summaryLines = [
      t.dashboard.hottestIssueDigestTitle,
      `${t.dashboard.logHeatLabel}: ${logHeat.label}`,
      `${t.dashboard.hottestIssueRepeatsDigestLabel}: ${hottestRecentIssue.count}`,
      `${t.dashboard.levelLabel}: ${getLogLevelLabel(hottestRecentIssue.entry.level)}`,
      `${t.dashboard.timestampLabel}: ${formatTime(hottestRecentIssue.entry.timestamp)}`,
      `${t.dashboard.messageLabel}: ${hottestRecentIssue.entry.message}`,
      `${t.dashboard.rawLabel}: ${hottestRecentIssue.entry.raw}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.hottestIssueCopied);
    } catch {
      void message.error(t.dashboard.hottestIssueCopyFailed);
    }
  }, [hottestRecentIssue, logHeat.label, getLogLevelLabel, t.dashboard]);

  const handleCopyActivityDigest = useCallback(async () => {
    if (!activityDigest) {
      void message.warning(t.dashboard.activityDigestUnavailable);
      return;
    }

    setCopyingActivityDigest(true);
    const summaryLines = [
      t.dashboard.activityDigestTitle,
      `${t.dashboard.logHeatLabel}: ${logHeat.label}`,
      `${t.dashboard.activityEntriesDigestLabel}: ${activityDigest.total}`,
      `${t.dashboard.activityIssues15Label}: ${activityDigest.issues15}`,
      `${t.dashboard.activityIssues60Label}: ${activityDigest.issues60}`,
      `${t.dashboard.errorCountLabel}: ${activityDigest.errors}`,
      `${t.dashboard.warningCountLabel}: ${activityDigest.warnings}`,
      `${t.dashboard.debugCountLabel}: ${activityDigest.debugs}`,
      `${t.dashboard.infoCountLabel}: ${activityDigest.infos}`,
      `${t.dashboard.issueRatioLabel}: ${activityDigest.issueRatio}%`,
      `${t.dashboard.activitySignalModeLabel}: ${activityDigest.activitySignalMode.label}`,
      `${t.dashboard.activitySignalHintLabel}: ${activityDigest.activitySignalMode.hint}`,
      `${t.dashboard.activityFreshnessLabel}: ${activityDigest.activityFreshness.label}`,
      `${t.dashboard.latestActivityLevelLabel}: ${activityDigest.latestActivityLevel.label}`,
      activityDigest.topSource ? `${t.dashboard.topActivitySourceDigestLabel}: ${activityDigest.topSource[0]} (${activityDigest.topSource[1]})` : null,
      activityDigest.topSourceLatestEntry
        ? `${t.dashboard.topActivitySourceLatestDigestLabel}: ${formatActivitySummary(activityDigest.topSourceLatestEntry)}`
        : null,
      activityDigest.topSourceLatestEntry ? `${t.dashboard.topActivitySourceFreshnessDigestLabel}: ${activityDigest.topSourceLatestFreshness.label}` : null,
      activityDigest.topSourceLatestEntry ? `${t.dashboard.topActivitySourceLatestLevelDigestLabel}: ${activityDigest.topSourceLatestLevel.label}` : null,
      activityDigest.topSourceLatestEntry ? `${t.dashboard.topActivitySourceLatestMessageDigestLabel}: ${activityDigest.topSourceLatestEntry.message}` : null,
      `${t.dashboard.topActivitySourceShareLabel}: ${activityDigest.topSourceShare}%`,
      `${t.dashboard.topActivitySourcesConcentrationLabel}: ${activityDigest.topSourcesConcentration}%`,
      `${t.dashboard.activitySourceModeLabel}: ${activityDigest.activitySourceMode.label}`,
      `${t.dashboard.activitySourceModeHintLabel}: ${activityDigest.activitySourceMode.hint}`,
      activityDigest.hottestRecentIssue ? `${t.dashboard.hottestIssueRepeatsDigestLabel}: ${activityDigest.hottestRecentIssue.count}` : null,
      activityDigest.hottestRecentIssue ? `${t.dashboard.hottestIssueFreshnessLabel}: ${activityDigest.hottestIssueFreshness.label}` : null,
      activityDigest.hottestRecentIssue ? `${t.dashboard.hottestIssueLevelLabel}: ${activityDigest.hottestIssueLevel.label}` : null,
      `${t.dashboard.latestActivityDigestLabel}: ${formatActivitySummary(activityDigest.latestEntry)}`,
      `${t.dashboard.latestMessageLabel}: ${activityDigest.latestEntry.message}`,
      activityDigest.latestEntry.source ? `${t.dashboard.latestSourceDigestLabel}: ${activityDigest.latestEntry.source}` : null,
      activityDigest.topRecentIssues.length
        ? `${t.dashboard.topIssuesDigestLabel}: ${activityDigest.topRecentIssues.map((issue) => `${issue.entry.message} (${issue.count})`).join(', ')}`
        : null,
      activityDigest.topSources.length
        ? `${t.dashboard.topActivitySourcesDigestLabel}: ${activityDigest.topSources.map(([source, count]) => `${source} (${count})`).join(', ')}`
        : null,
    ].filter(Boolean) as string[];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.activityDigestCopied);
    } catch {
      void message.error(t.dashboard.activityDigestCopyFailed);
    } finally {
      setCopyingActivityDigest(false);
    }
  }, [activityDigest, formatActivitySummary, logHeat.label, t.dashboard]);

  const handleCopyLatestActivity = useCallback(async () => {
    if (!activityDigest?.latestEntry) {
      void message.warning(t.dashboard.latestActivityUnavailable);
      return;
    }

    setCopyingLatestActivity(true);
    const latestEntry = activityDigest.latestEntry;
    const summaryLines = [
      t.dashboard.latestActivityDigestTitle,
      `${t.dashboard.levelLabel}: ${getLogLevelLabel(latestEntry.level)}`,
      `${t.dashboard.timestampLabel}: ${formatTime(latestEntry.timestamp)}`,
      `${t.dashboard.messageLabel}: ${latestEntry.message}`,
      `${t.dashboard.rawLabel}: ${latestEntry.raw}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.latestActivityCopied);
    } catch {
      void message.error(t.dashboard.latestActivityCopyFailed);
    } finally {
      setCopyingLatestActivity(false);
    }
  }, [activityDigest, getLogLevelLabel, t.dashboard]);

  const handleCopyTopActivityIssues = useCallback(async () => {
    if (!activityDigest?.topRecentIssues.length) {
      void message.warning(t.dashboard.topActivityIssuesUnavailable);
      return;
    }

    setCopyingTopActivityIssues(true);
    const summaryLines = [
      t.dashboard.topActivityIssuesDigestTitle,
      `${t.dashboard.logHeatLabel}: ${logHeat.label}`,
      ...activityDigest.topRecentIssues.map((issue, index) => `${index + 1}. ${issue.entry.message} (${issue.count})`),
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topActivityIssuesCopied);
    } catch {
      void message.error(t.dashboard.topActivityIssuesCopyFailed);
    } finally {
      setCopyingTopActivityIssues(false);
    }
  }, [activityDigest, logHeat.label, t.dashboard]);

  const handleCopyTopActivitySourceLatest = useCallback(async () => {
    if (!activityDigest?.topSourceLatestEntry || !activityDigest.topSource) {
      void message.warning(t.dashboard.topActivitySourceLatestUnavailable);
      return;
    }

    setCopyingTopActivitySourceLatest(true);
    const entry = activityDigest.topSourceLatestEntry;
    const summaryLines = [
      t.dashboard.topActivitySourceLatestDigestTitle,
      `${t.dashboard.sourceLabel}: ${activityDigest.topSource[0]}`,
      `${t.dashboard.countLabel}: ${activityDigest.topSource[1]}`,
      `${t.dashboard.levelLabel}: ${getLogLevelLabel(entry.level)}`,
      `${t.dashboard.timestampLabel}: ${formatTime(entry.timestamp)}`,
      `${t.dashboard.freshnessLabel}: ${activityDigest.topSourceLatestFreshness.label}`,
      `${t.dashboard.levelTextLabel}: ${activityDigest.topSourceLatestLevel.label}`,
      `${t.dashboard.messageLabel}: ${entry.message}`,
      `${t.dashboard.rawLabel}: ${entry.raw}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topActivitySourceLatestCopied);
    } catch {
      void message.error(t.dashboard.topActivitySourceLatestCopyFailed);
    } finally {
      setCopyingTopActivitySourceLatest(false);
    }
  }, [activityDigest, getLogLevelLabel, t.dashboard]);

  const handleCopyTopActivitySources = useCallback(async () => {
    if (!activityDigest?.topSources.length) {
      void message.warning(t.dashboard.topActivitySourcesUnavailable);
      return;
    }

    setCopyingTopActivitySources(true);
    const summaryLines = [
      t.dashboard.topActivitySourcesDigestTitle,
      `${t.dashboard.activitySourceModeLabel}: ${activityDigest.activitySourceMode.label}`,
      `${t.dashboard.topActivitySourceShareLabel}: ${activityDigest.topSourceShare}%`,
      `${t.dashboard.topActivitySourcesConcentrationLabel}: ${activityDigest.topSourcesConcentration}%`,
      ...activityDigest.topSources.map(([source, count], index) => `${index + 1}. ${source} (${count})`),
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topActivitySourcesCopied);
    } catch {
      void message.error(t.dashboard.topActivitySourcesCopyFailed);
    } finally {
      setCopyingTopActivitySources(false);
    }
  }, [activityDigest, t.dashboard]);

  const handleOpenActivityIssue = useCallback((messageText?: string | null) => {
    if (!messageText) return;
    navigate('/logs', {
      state: {
        presetQuery: messageText,
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

  return {
    logHeat,
    topRecentIssues,
    hottestRecentIssue,
    activityDigest,
    copyingActivityDigest,
    copyingLatestActivity,
    copyingTopActivityIssues,
    copyingTopActivitySourceLatest,
    copyingTopActivitySources,
    handleOpenActivitySource,
    handleOpenTopActivitySourceLatest,
    handleOpenHottestIssueLogs,
    handleOpenRecentLogs,
    handleOpenLatestActivity,
    handleActivitySuggestedAction,
    activitySuggestedActionLabel,
    handleCopyHottestIssue,
    handleCopyActivityDigest,
    handleCopyLatestActivity,
    handleCopyTopActivityIssues,
    handleCopyTopActivitySourceLatest,
    handleCopyTopActivitySources,
    handleOpenActivityIssue
  };
}
