import { useCallback, useMemo, useState } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  buildActivityDigestText,
  buildHottestIssueDigestText,
  buildLatestActivityDigestText,
  buildTopActivityIssuesText,
  buildTopActivitySourceLatestText,
  buildTopActivitySourcesText,
  type DashboardActivityCopyContext,
} from './dashboardActivityCopyText';
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

  const copyTextContext = useMemo<DashboardActivityCopyContext>(() => ({
    labels: {
      logHeatLabel: t.dashboard.logHeatLabel,
      hottestIssueDigestTitle: t.dashboard.hottestIssueDigestTitle,
      hottestIssueRepeatsDigestLabel: t.dashboard.hottestIssueRepeatsDigestLabel,
      levelLabel: t.dashboard.levelLabel,
      timestampLabel: t.dashboard.timestampLabel,
      messageLabel: t.dashboard.messageLabel,
      rawLabel: t.dashboard.rawLabel,
      activityDigestTitle: t.dashboard.activityDigestTitle,
      activityEntriesDigestLabel: t.dashboard.activityEntriesDigestLabel,
      activityIssues15Label: t.dashboard.activityIssues15Label,
      activityIssues60Label: t.dashboard.activityIssues60Label,
      errorCountLabel: t.dashboard.errorCountLabel,
      warningCountLabel: t.dashboard.warningCountLabel,
      debugCountLabel: t.dashboard.debugCountLabel,
      infoCountLabel: t.dashboard.infoCountLabel,
      issueRatioLabel: t.dashboard.issueRatioLabel,
      activitySignalModeLabel: t.dashboard.activitySignalModeLabel,
      activitySignalHintLabel: t.dashboard.activitySignalHintLabel,
      activityFreshnessLabel: t.dashboard.activityFreshnessLabel,
      latestActivityLevelLabel: t.dashboard.latestActivityLevelLabel,
      topActivitySourceDigestLabel: t.dashboard.topActivitySourceDigestLabel,
      topActivitySourceLatestDigestLabel: t.dashboard.topActivitySourceLatestDigestLabel,
      topActivitySourceFreshnessDigestLabel: t.dashboard.topActivitySourceFreshnessDigestLabel,
      topActivitySourceLatestLevelDigestLabel: t.dashboard.topActivitySourceLatestLevelDigestLabel,
      topActivitySourceLatestMessageDigestLabel: t.dashboard.topActivitySourceLatestMessageDigestLabel,
      topActivitySourceShareLabel: t.dashboard.topActivitySourceShareLabel,
      topActivitySourcesConcentrationLabel: t.dashboard.topActivitySourcesConcentrationLabel,
      activitySourceModeLabel: t.dashboard.activitySourceModeLabel,
      activitySourceModeHintLabel: t.dashboard.activitySourceModeHintLabel,
      hottestIssueFreshnessLabel: t.dashboard.hottestIssueFreshnessLabel,
      hottestIssueLevelLabel: t.dashboard.hottestIssueLevelLabel,
      latestActivityDigestLabel: t.dashboard.latestActivityDigestLabel,
      latestMessageLabel: t.dashboard.latestMessageLabel,
      latestSourceDigestLabel: t.dashboard.latestSourceDigestLabel,
      topIssuesDigestLabel: t.dashboard.topIssuesDigestLabel,
      topActivitySourcesDigestLabel: t.dashboard.topActivitySourcesDigestLabel,
      latestActivityDigestTitle: t.dashboard.latestActivityDigestTitle,
      topActivityIssuesDigestTitle: t.dashboard.topActivityIssuesDigestTitle,
      topActivitySourceLatestDigestTitle: t.dashboard.topActivitySourceLatestDigestTitle,
      sourceLabel: t.dashboard.sourceLabel,
      countLabel: t.dashboard.countLabel,
      freshnessLabel: t.dashboard.freshnessLabel,
      levelTextLabel: t.dashboard.levelTextLabel,
      topActivitySourcesDigestTitle: t.dashboard.topActivitySourcesDigestTitle,
    },
    formatters: {
      formatActivitySummary,
      formatTimestamp: formatTime,
      getLogLevelLabel,
    },
  }), [formatActivitySummary, getLogLevelLabel, t.dashboard]);

  const copyText = useCallback(async (content: string, successMessage: string, errorMessage: string) => {
    try {
      await navigator.clipboard.writeText(content);
      void message.success(successMessage);
    } catch {
      void message.error(errorMessage);
    }
  }, []);

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
    await copyText(
      buildHottestIssueDigestText(copyTextContext, {
        logHeatLabel: logHeat.label,
        count: hottestRecentIssue.count,
        entry: hottestRecentIssue.entry,
      }),
      t.dashboard.hottestIssueCopied,
      t.dashboard.hottestIssueCopyFailed,
    );
  }, [copyText, copyTextContext, hottestRecentIssue, logHeat.label, t.dashboard]);

  const handleCopyActivityDigest = useCallback(async () => {
    if (!activityDigest) {
      void message.warning(t.dashboard.activityDigestUnavailable);
      return;
    }

    setCopyingActivityDigest(true);
    try {
      await copyText(
        buildActivityDigestText(copyTextContext, {
          logHeatLabel: logHeat.label,
          total: activityDigest.total,
          issues15: activityDigest.issues15,
          issues60: activityDigest.issues60,
          errors: activityDigest.errors,
          warnings: activityDigest.warnings,
          debugs: activityDigest.debugs,
          infos: activityDigest.infos,
          issueRatio: activityDigest.issueRatio,
          activitySignalMode: activityDigest.activitySignalMode,
          activityFreshness: activityDigest.activityFreshness,
          latestActivityLevel: activityDigest.latestActivityLevel,
          topSource: activityDigest.topSource,
          topSourceLatestEntry: activityDigest.topSourceLatestEntry,
          topSourceLatestFreshness: activityDigest.topSourceLatestFreshness,
          topSourceLatestLevel: activityDigest.topSourceLatestLevel,
          topSourceShare: activityDigest.topSourceShare,
          topSourcesConcentration: activityDigest.topSourcesConcentration,
          activitySourceMode: activityDigest.activitySourceMode,
          hottestRecentIssue: activityDigest.hottestRecentIssue,
          hottestIssueFreshness: activityDigest.hottestIssueFreshness,
          hottestIssueLevel: activityDigest.hottestIssueLevel,
          latestEntry: activityDigest.latestEntry,
          topRecentIssues: activityDigest.topRecentIssues,
          topSources: activityDigest.topSources,
        }),
        t.dashboard.activityDigestCopied,
        t.dashboard.activityDigestCopyFailed,
      );
    } finally {
      setCopyingActivityDigest(false);
    }
  }, [activityDigest, copyText, copyTextContext, logHeat.label, t.dashboard]);

  const handleCopyLatestActivity = useCallback(async () => {
    if (!activityDigest?.latestEntry) {
      void message.warning(t.dashboard.latestActivityUnavailable);
      return;
    }

    setCopyingLatestActivity(true);
    try {
      await copyText(
        buildLatestActivityDigestText(copyTextContext, activityDigest.latestEntry),
        t.dashboard.latestActivityCopied,
        t.dashboard.latestActivityCopyFailed,
      );
    } finally {
      setCopyingLatestActivity(false);
    }
  }, [activityDigest, copyText, copyTextContext, t.dashboard]);

  const handleCopyTopActivityIssues = useCallback(async () => {
    if (!activityDigest?.topRecentIssues.length) {
      void message.warning(t.dashboard.topActivityIssuesUnavailable);
      return;
    }

    setCopyingTopActivityIssues(true);
    try {
      await copyText(
        buildTopActivityIssuesText(copyTextContext, logHeat.label, activityDigest.topRecentIssues),
        t.dashboard.topActivityIssuesCopied,
        t.dashboard.topActivityIssuesCopyFailed,
      );
    } finally {
      setCopyingTopActivityIssues(false);
    }
  }, [activityDigest, copyText, copyTextContext, logHeat.label, t.dashboard]);

  const handleCopyTopActivitySourceLatest = useCallback(async () => {
    if (!activityDigest?.topSourceLatestEntry || !activityDigest.topSource) {
      void message.warning(t.dashboard.topActivitySourceLatestUnavailable);
      return;
    }

    setCopyingTopActivitySourceLatest(true);
    try {
      await copyText(
        buildTopActivitySourceLatestText(copyTextContext, {
          source: activityDigest.topSource,
          entry: activityDigest.topSourceLatestEntry,
          freshnessLabel: activityDigest.topSourceLatestFreshness.label,
          levelText: activityDigest.topSourceLatestLevel.label,
        }),
        t.dashboard.topActivitySourceLatestCopied,
        t.dashboard.topActivitySourceLatestCopyFailed,
      );
    } finally {
      setCopyingTopActivitySourceLatest(false);
    }
  }, [activityDigest, copyText, copyTextContext, t.dashboard]);

  const handleCopyTopActivitySources = useCallback(async () => {
    if (!activityDigest?.topSources.length) {
      void message.warning(t.dashboard.topActivitySourcesUnavailable);
      return;
    }

    setCopyingTopActivitySources(true);
    try {
      await copyText(
        buildTopActivitySourcesText(copyTextContext, {
          modeLabel: activityDigest.activitySourceMode.label,
          topSourceShare: activityDigest.topSourceShare,
          topSourcesConcentration: activityDigest.topSourcesConcentration,
          topSources: activityDigest.topSources,
        }),
        t.dashboard.topActivitySourcesCopied,
        t.dashboard.topActivitySourcesCopyFailed,
      );
    } finally {
      setCopyingTopActivitySources(false);
    }
  }, [activityDigest, copyText, copyTextContext, t.dashboard]);

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
