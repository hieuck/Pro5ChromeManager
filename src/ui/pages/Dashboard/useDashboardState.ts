import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { useDashboardData } from './useDashboardData';
import { useDashboardIncidents } from './useDashboardIncidents';
import { useDashboardActivity } from './useDashboardActivity';
import { useDashboardActions } from './useDashboardActions';
import { useDashboardSetup } from './useDashboardSetup';
import { LogEntry, IncidentEntry } from './types';
import { formatTime, formatMaybeValue } from './utils';

export { formatTime, minutesSince, isWithinLastMinutes, summarizeIssueMessage } from './utils';

export function useDashboardState() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // 1. Core Data & State
  const data = useDashboardData();
  const { 
    profiles, proxies, instances, support, incidents, 
    logs, runtimes, loadDashboard 
  } = data;

  // 2. Initial derived data for other hooks
  const availableRuntimes = useMemo(() => runtimes.filter((r) => r.available), [runtimes]);
  const healthyProxies = useMemo(() => proxies.filter((p) => p.lastCheckStatus === 'healthy').length, [proxies]);
  const activeProfiles = useMemo(() => profiles.filter((p) => instances[p.id]?.status === 'running').sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime()).slice(0, 5), [instances, profiles]);
  const launchReadyProfiles = useMemo(() => profiles.filter((p) => (instances[p.id]?.status ?? 'stopped') !== 'running' && p.proxy?.lastCheckStatus !== 'failing').sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime()).slice(0, 5), [instances, profiles]);
  const failingProxyIds = useMemo(() => Array.from(new Set(profiles.filter((p) => p.proxy?.lastCheckStatus === 'failing').map((p) => p.proxy?.id).filter((id): id is string => Boolean(id)))), [profiles]);
  const recentProfiles = useMemo(() => [...profiles].sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime()).slice(0, 5), [profiles]);
  const profilesNeedingAttention = useMemo(() => profiles.filter((p) => instances[p.id]?.status === 'unreachable' || p.proxy?.lastCheckStatus === 'failing').slice(0, 5), [instances, profiles]);

  // 3. Helper labels
  const getIncidentLevelLabel = useCallback((level: 'warn' | 'error') => (level === 'error' ? t.settings.incidentLevelError : t.settings.incidentLevelWarn), [t.settings]);
  const getLogLevelLabel = useCallback((level: 'debug' | 'info' | 'warn' | 'error') => {
    switch (level) {
      case 'debug': return t.logs.filterDebug;
      case 'info': return t.logs.filterInfo;
      case 'warn': return t.logs.filterWarn;
      case 'error':
      default: return t.logs.filterError;
    }
  }, [t.logs]);
  const getFeedbackCategoryLabel = useCallback((category: any) => {
    if (category === 'bug') return t.settings.feedbackCategoryBug;
    if (category === 'question') return t.settings.feedbackCategoryQuestion;
    return t.settings.feedbackCategoryFeedback;
  }, [t.settings]);
  const getFeedbackSentimentLabel = useCallback((sentiment: any) => {
    if (sentiment === 'positive') return t.settings.feedbackSentimentPositive;
    if (sentiment === 'negative') return t.settings.feedbackSentimentNegative;
    return t.settings.feedbackSentimentNeutral;
  }, [t.settings]);
  const getOnboardingStatusLabel = useCallback((statusValue?: any) => {
    if (statusValue === 'in_progress') return t.settings.onboardingStateInProgress;
    if (statusValue === 'profile_created') return t.settings.onboardingStateProfileCreated;
    if (statusValue === 'completed') return t.settings.onboardingStateCompleted;
    if (statusValue === 'skipped') return t.settings.onboardingStateSkipped;
    return t.settings.onboardingStateNotStarted;
  }, [t.settings]);
  const getSelfTestStatusLabel = useCallback((status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass': return t.settings.statusPass;
      case 'warn': return t.settings.statusWarn;
      case 'fail':
      default: return t.settings.statusFail;
    }
  }, [t.settings]);

  const formatMaybeValueBound = useCallback((value?: string | null, fallback = t.settings.noneValue) => formatMaybeValue(value, fallback), [t.settings.noneValue]);
  const formatIncidentSummary = useCallback((entry?: IncidentEntry | null) => (entry ? `${getIncidentLevelLabel(entry.level)} @ ${formatTime(entry.timestamp)}` : t.settings.noneValue), [getIncidentLevelLabel, t.settings.noneValue]);
  const formatActivitySummary = useCallback((entry?: LogEntry | null) => (entry ? `${getLogLevelLabel(entry.level)} @ ${formatTime(entry.timestamp)}` : t.settings.noneValue), [getLogLevelLabel, t.settings.noneValue]);

  // 4. Common navigation helpers
  const handleOpenLogEntry = useCallback((entry: LogEntry) => {
    navigate('/logs', {
      state: {
        presetQuery: entry.message,
        presetFilter: entry.level === 'error' || entry.level === 'warn' ? 'issues' : 'all',
        presetRecentWindowOnly: entry.level === 'error' || entry.level === 'warn',
      },
    });
  }, [navigate]);

  const handleOpenCreateProfile = useCallback(() => {
    if (!availableRuntimes.length) {
      actions.setOnboardingOpen(true);
      return;
    }
    navigate('/profiles', { state: { openCreate: true } });
  }, [availableRuntimes.length, navigate]);


  // 5. Hooks orchestration
  const actions = useDashboardActions(loadDashboard, t, launchReadyProfiles, activeProfiles, failingProxyIds);
  const setup = useDashboardSetup(
    availableRuntimes, runtimes, profiles, healthyProxies, proxies, 
    failingProxyIds, launchReadyProfiles, activeProfiles, support, t, 
    actions.handleOpenOnboarding, handleOpenCreateProfile, actions.handleRetestAllFailingProxies, 
    actions.handleStartAllReadyProfiles
  );
  const incidentPanel = useDashboardIncidents(incidents, logs, t, getIncidentLevelLabel, formatIncidentSummary);
  const activityPanel = useDashboardActivity(logs, t, getLogLevelLabel, formatActivitySummary, handleOpenLogEntry);

  // Return unified state
  return {
    t,
    navigate,
    ...data,
    ...actions,
    ...setup,
    ...incidentPanel,
    ...activityPanel,
    runningProfiles,
    healthyProxies,
    availableRuntimes,
    profilesNeedingAttention,
    recentProfiles,
    activeProfiles,
    launchReadyProfiles,
    failingProxyIds,
    getFeedbackCategoryLabel,
    getFeedbackSentimentLabel,
    getOnboardingStatusLabel,
    getIncidentLevelLabel,
    getLogLevelLabel,
    getSelfTestStatusLabel,
    formatMaybeValue: formatMaybeValueBound,
    formatIncidentSummary,
    formatActivitySummary,
    handleOpenCreateProfile,
    handleOpenLogEntry
  };
}
