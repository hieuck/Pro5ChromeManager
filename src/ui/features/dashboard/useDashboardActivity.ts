import { useCallback, useMemo, useState } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { TranslationKeys } from '../../i18n';
import {
  buildActivityDigestText,
  buildHottestIssueDigestText,
  buildLatestActivityDigestText,
  buildTopActivityIssuesText,
  buildTopActivitySourceLatestText,
  buildTopActivitySourcesText,
  type DashboardActivityCopyContext,
} from './dashboardActivityCopyText';
import { buildDashboardActivityInsights } from './insights';
import type { LogEntry } from './types';
import { formatTime } from './utils';

const ACTIVITY_ACTION_LABELS = {
  hottest: 'openHottestIssue',
  source: 'openTopActivitySource',
  recent: 'openRecentLogs',
  latest: 'openLatestActivity',
} as const;

export function useDashboardActivity(
  logs: LogEntry[],
  t: TranslationKeys,
  getLogLevelLabel: (level: 'debug' | 'info' | 'warn' | 'error') => string,
  formatActivitySummary: (entry?: LogEntry | null) => string,
  handleOpenLogEntry: (entry: LogEntry) => void,
) {
  const navigate = useNavigate();
  const dashboard = t.dashboard;
  const [copyingActivityDigest, setCopyingActivityDigest] = useState(false);
  const [copyingLatestActivity, setCopyingLatestActivity] = useState(false);
  const [copyingTopActivityIssues, setCopyingTopActivityIssues] = useState(false);
  const [copyingTopActivitySourceLatest, setCopyingTopActivitySourceLatest] = useState(false);
  const [copyingTopActivitySources, setCopyingTopActivitySources] = useState(false);

  const { logHeat, topRecentIssues, hottestRecentIssue, activityDigest } = useMemo(
    () => buildDashboardActivityInsights(logs, dashboard),
    [dashboard, logs],
  );

  const copyTextContext = useMemo<DashboardActivityCopyContext>(() => ({
    labels: {
      logHeatLabel: dashboard.logHeatLabel,
      hottestIssueDigestTitle: dashboard.hottestIssueDigestTitle,
      hottestIssueRepeatsDigestLabel: dashboard.hottestIssueRepeatsDigestLabel,
      levelLabel: dashboard.levelLabel,
      timestampLabel: dashboard.timestampLabel,
      messageLabel: dashboard.messageLabel,
      rawLabel: dashboard.rawLabel,
      activityDigestTitle: dashboard.activityDigestTitle,
      activityEntriesDigestLabel: dashboard.activityEntriesDigestLabel,
      activityIssues15Label: dashboard.activityIssues15Label,
      activityIssues60Label: dashboard.activityIssues60Label,
      errorCountLabel: dashboard.errorCountLabel,
      warningCountLabel: dashboard.warningCountLabel,
      debugCountLabel: dashboard.debugCountLabel,
      infoCountLabel: dashboard.infoCountLabel,
      issueRatioLabel: dashboard.issueRatioLabel,
      activitySignalModeLabel: dashboard.activitySignalModeLabel,
      activitySignalHintLabel: dashboard.activitySignalHintLabel,
      activityFreshnessLabel: dashboard.activityFreshnessLabel,
      latestActivityLevelLabel: dashboard.latestActivityLevelLabel,
      topActivitySourceDigestLabel: dashboard.topActivitySourceDigestLabel,
      topActivitySourceLatestDigestLabel: dashboard.topActivitySourceLatestDigestLabel,
      topActivitySourceFreshnessDigestLabel: dashboard.topActivitySourceFreshnessDigestLabel,
      topActivitySourceLatestLevelDigestLabel: dashboard.topActivitySourceLatestLevelDigestLabel,
      topActivitySourceLatestMessageDigestLabel: dashboard.topActivitySourceLatestMessageDigestLabel,
      topActivitySourceShareLabel: dashboard.topActivitySourceShareLabel,
      topActivitySourcesConcentrationLabel: dashboard.topActivitySourcesConcentrationLabel,
      activitySourceModeLabel: dashboard.activitySourceModeLabel,
      activitySourceModeHintLabel: dashboard.activitySourceModeHintLabel,
      hottestIssueFreshnessLabel: dashboard.hottestIssueFreshnessLabel,
      hottestIssueLevelLabel: dashboard.hottestIssueLevelLabel,
      latestActivityDigestLabel: dashboard.latestActivityDigestLabel,
      latestMessageLabel: dashboard.latestMessageLabel,
      latestSourceDigestLabel: dashboard.latestSourceDigestLabel,
      topIssuesDigestLabel: dashboard.topIssuesDigestLabel,
      topActivitySourcesDigestLabel: dashboard.topActivitySourcesDigestLabel,
      latestActivityDigestTitle: dashboard.latestActivityDigestTitle,
      topActivityIssuesDigestTitle: dashboard.topActivityIssuesDigestTitle,
      topActivitySourceLatestDigestTitle: dashboard.topActivitySourceLatestDigestTitle,
      sourceLabel: dashboard.sourceLabel,
      countLabel: dashboard.countLabel,
      freshnessLabel: dashboard.freshnessLabel,
      levelTextLabel: dashboard.levelTextLabel,
      topActivitySourcesDigestTitle: dashboard.topActivitySourcesDigestTitle,
    },
    formatters: {
      formatActivitySummary,
      formatTimestamp: formatTime,
      getLogLevelLabel,
    },
  }), [dashboard, formatActivitySummary, getLogLevelLabel]);

  const copyText = useCallback(async (content: string, successMessage: string, errorMessage: string) => {
    try {
      await navigator.clipboard.writeText(content);
      void message.success(successMessage);
    } catch {
      void message.error(errorMessage);
    }
  }, []);

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
  }, [handleOpenLogEntry, hottestRecentIssue]);

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

    switch (activityDigest.activityAction) {
      case 'hottest':
        handleOpenHottestIssueLogs();
        return;
      case 'source':
        handleOpenActivitySource(activityDigest.topSource?.[0] ?? null);
        return;
      case 'recent':
        handleOpenRecentLogs();
        return;
      case 'latest':
      default:
        handleOpenLatestActivity();
    }
  }, [
    activityDigest,
    handleOpenActivitySource,
    handleOpenHottestIssueLogs,
    handleOpenLatestActivity,
    handleOpenRecentLogs,
  ]);

  const activitySuggestedActionLabel = useMemo(() => {
    if (!activityDigest) {
      return dashboard.openLatestActivity;
    }

    const labelKey = ACTIVITY_ACTION_LABELS[activityDigest.activityAction];
    return dashboard[labelKey];
  }, [activityDigest, dashboard]);

  const handleCopyHottestIssue = useCallback(async () => {
    if (!hottestRecentIssue) {
      void message.warning(dashboard.hottestIssueUnavailable);
      return;
    }

    await copyText(
      buildHottestIssueDigestText(copyTextContext, {
        logHeatLabel: logHeat.label,
        count: hottestRecentIssue.count,
        entry: hottestRecentIssue.entry,
      }),
      dashboard.hottestIssueCopied,
      dashboard.hottestIssueCopyFailed,
    );
  }, [copyText, copyTextContext, dashboard, hottestRecentIssue, logHeat.label]);

  const handleCopyActivityDigest = useCallback(async () => {
    if (!activityDigest) {
      void message.warning(dashboard.activityDigestUnavailable);
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
        dashboard.activityDigestCopied,
        dashboard.activityDigestCopyFailed,
      );
    } finally {
      setCopyingActivityDigest(false);
    }
  }, [activityDigest, copyText, copyTextContext, dashboard, logHeat.label]);

  const handleCopyLatestActivity = useCallback(async () => {
    if (!activityDigest?.latestEntry) {
      void message.warning(dashboard.latestActivityUnavailable);
      return;
    }

    setCopyingLatestActivity(true);
    try {
      await copyText(
        buildLatestActivityDigestText(copyTextContext, activityDigest.latestEntry),
        dashboard.latestActivityCopied,
        dashboard.latestActivityCopyFailed,
      );
    } finally {
      setCopyingLatestActivity(false);
    }
  }, [activityDigest, copyText, copyTextContext, dashboard]);

  const handleCopyTopActivityIssues = useCallback(async () => {
    if (!activityDigest?.topRecentIssues.length) {
      void message.warning(dashboard.topActivityIssuesUnavailable);
      return;
    }

    setCopyingTopActivityIssues(true);
    try {
      await copyText(
        buildTopActivityIssuesText(copyTextContext, logHeat.label, activityDigest.topRecentIssues),
        dashboard.topActivityIssuesCopied,
        dashboard.topActivityIssuesCopyFailed,
      );
    } finally {
      setCopyingTopActivityIssues(false);
    }
  }, [activityDigest, copyText, copyTextContext, dashboard, logHeat.label]);

  const handleCopyTopActivitySourceLatest = useCallback(async () => {
    if (!activityDigest?.topSourceLatestEntry || !activityDigest.topSource) {
      void message.warning(dashboard.topActivitySourceLatestUnavailable);
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
        dashboard.topActivitySourceLatestCopied,
        dashboard.topActivitySourceLatestCopyFailed,
      );
    } finally {
      setCopyingTopActivitySourceLatest(false);
    }
  }, [activityDigest, copyText, copyTextContext, dashboard]);

  const handleCopyTopActivitySources = useCallback(async () => {
    if (!activityDigest?.topSources.length) {
      void message.warning(dashboard.topActivitySourcesUnavailable);
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
        dashboard.topActivitySourcesCopied,
        dashboard.topActivitySourcesCopyFailed,
      );
    } finally {
      setCopyingTopActivitySources(false);
    }
  }, [activityDigest, copyText, copyTextContext, dashboard]);

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
    handleOpenActivityIssue,
  };
}
