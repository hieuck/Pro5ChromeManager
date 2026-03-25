import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Progress, Row, Select, Space, Statistic, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowRightOutlined, CopyOutlined, DownloadOutlined, PlayCircleOutlined, ReloadOutlined, SettingOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient, buildApiUrl } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
import { useWebSocket } from '../hooks/useWebSocket';
import OnboardingWizard from '../components/OnboardingWizard';

interface DashboardProfile {
  id: string;
  name: string;
  proxy?: {
    id: string;
    label?: string;
    type: string;
    host: string;
    port: number;
    lastCheckStatus?: 'healthy' | 'failing';
    lastCheckAt?: string;
    lastCheckError?: string;
  } | null;
  runtime?: string;
  group?: string | null;
  tags: string[];
  lastUsedAt?: string | null;
}

interface DashboardProxy {
  id: string;
  label?: string;
  type: string;
  host: string;
  port: number;
  lastCheckStatus?: 'healthy' | 'failing';
  lastCheckAt?: string;
}

interface DashboardInstance {
  profileId: string;
  status: 'running' | 'unreachable' | 'stopped';
}

interface SupportStatus {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  dataDir: string;
  diagnosticsReady: boolean;
  warnings: string[];
  profileCount: number;
  proxyCount: number;
  recentIncidentCount: number;
  recentErrorCount: number;
  onboardingCompleted: boolean;
  onboardingState: {
    status: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
    selectedRuntime: string | null;
    draftProfileName: string | null;
  };
  usageMetrics: {
    profileLaunches: number;
    lastProfileLaunchAt: string | null;
  };
}

interface IncidentEntry {
  timestamp: string;
  level: 'warn' | 'error';
  source: string;
  message: string;
}

interface SelfTestCheck {
  key: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface SelfTestResult {
  status: 'pass' | 'warn' | 'fail';
  checkedAt: string;
  checks: SelfTestCheck[];
}

interface FeedbackEntry {
  id: string;
  createdAt: string;
  category: 'bug' | 'feedback' | 'question';
  sentiment: 'negative' | 'neutral' | 'positive';
  message: string;
  email: string | null;
  appVersion: string | null;
}

interface BackupEntry {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

interface RuntimeEntry {
  key: string;
  name?: string;
  label?: string;
  available: boolean;
  executablePath?: string | null;
}

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  raw: string;
  source: string | null;
}

interface SetupChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}

interface NextStepAction {
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

function formatTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
}

function minutesSince(value?: string | null): number | null {
  if (!value) return null;
  const diffMs = Date.now() - new Date(value).getTime();
  if (diffMs < 0) return 0;
  return Math.round(diffMs / 60_000);
}

function isWithinLastMinutes(value?: string | null, minutes = 60): boolean {
  if (!value) return false;
  const diffMs = Date.now() - new Date(value).getTime();
  return diffMs >= 0 && diffMs <= minutes * 60_000;
}

function summarizeIssueMessage(message: string, maxLength = 44): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);
  const [proxies, setProxies] = useState<DashboardProxy[]>([]);
  const [instances, setInstances] = useState<Record<string, DashboardInstance>>({});
  const [support, setSupport] = useState<SupportStatus | null>(null);
  const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
  const [selfTest, setSelfTest] = useState<SelfTestResult | null>(null);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingProfileId, setStartingProfileId] = useState<string | null>(null);
  const [startingAllReady, setStartingAllReady] = useState(false);
  const [stoppingProfileId, setStoppingProfileId] = useState<string | null>(null);
  const [stoppingAllRunning, setStoppingAllRunning] = useState(false);
  const [retestingProfileId, setRetestingProfileId] = useState<string | null>(null);
  const [retestingAll, setRetestingAll] = useState(false);
  const [runningSelfTest, setRunningSelfTest] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [copyingSummary, setCopyingSummary] = useState(false);
  const [copyingIncidentDigest, setCopyingIncidentDigest] = useState(false);
  const [copyingActivityDigest, setCopyingActivityDigest] = useState(false);
  const [copyingLatestIncident, setCopyingLatestIncident] = useState(false);
  const [copyingTopIncidentSource, setCopyingTopIncidentSource] = useState(false);
  const [copyingTopIncidentSources, setCopyingTopIncidentSources] = useState(false);
  const [copyingTopSourceLatestIncident, setCopyingTopSourceLatestIncident] = useState(false);
  const [copyingLatestActivity, setCopyingLatestActivity] = useState(false);
  const [copyingTopActivityIssues, setCopyingTopActivityIssues] = useState(false);
  const [copyingTopActivitySourceLatest, setCopyingTopActivitySourceLatest] = useState(false);
  const [copyingTopActivitySources, setCopyingTopActivitySources] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [feedbackForm] = Form.useForm();

  const getFeedbackCategoryLabel = useCallback((category: FeedbackEntry['category']): string => {
    if (category === 'bug') return t.settings.feedbackCategoryBug;
    if (category === 'question') return t.settings.feedbackCategoryQuestion;
    return t.settings.feedbackCategoryFeedback;
  }, [t.settings.feedbackCategoryBug, t.settings.feedbackCategoryFeedback, t.settings.feedbackCategoryQuestion]);

  const getFeedbackSentimentLabel = useCallback((sentiment: FeedbackEntry['sentiment']): string => {
    if (sentiment === 'positive') return t.settings.feedbackSentimentPositive;
    if (sentiment === 'negative') return t.settings.feedbackSentimentNegative;
    return t.settings.feedbackSentimentNeutral;
  }, [t.settings.feedbackSentimentNegative, t.settings.feedbackSentimentNeutral, t.settings.feedbackSentimentPositive]);

  const getOnboardingStatusLabel = useCallback((statusValue?: SupportStatus['onboardingState']['status'] | null): string => {
    if (statusValue === 'in_progress') return t.settings.onboardingStateInProgress;
    if (statusValue === 'profile_created') return t.settings.onboardingStateProfileCreated;
    if (statusValue === 'completed') return t.settings.onboardingStateCompleted;
    if (statusValue === 'skipped') return t.settings.onboardingStateSkipped;
    return t.settings.onboardingStateNotStarted;
  }, [
    t.settings.onboardingStateCompleted,
    t.settings.onboardingStateInProgress,
    t.settings.onboardingStateNotStarted,
    t.settings.onboardingStateProfileCreated,
    t.settings.onboardingStateSkipped,
  ]);

  const getIncidentLevelLabel = useCallback((level: 'warn' | 'error') => (
    level === 'error' ? t.settings.incidentLevelError : t.settings.incidentLevelWarn
  ), [t.settings.incidentLevelError, t.settings.incidentLevelWarn]);

  const getLogLevelLabel = useCallback((level: 'debug' | 'info' | 'warn' | 'error') => {
    switch (level) {
      case 'debug':
        return t.logs.filterDebug;
      case 'info':
        return t.logs.filterInfo;
      case 'warn':
        return t.logs.filterWarn;
      case 'error':
      default:
        return t.logs.filterError;
    }
  }, [t.logs.filterDebug, t.logs.filterError, t.logs.filterInfo, t.logs.filterWarn]);

  const getSelfTestStatusLabel = useCallback((status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return t.settings.statusPass;
      case 'warn':
        return t.settings.statusWarn;
      case 'fail':
      default:
        return t.settings.statusFail;
    }
  }, [t.settings.statusFail, t.settings.statusPass, t.settings.statusWarn]);

  const formatMaybeValue = useCallback((value?: string | null, fallback = t.settings.noneValue) => (
    value && value.trim() ? value : fallback
  ), [t.settings.noneValue]);

  const formatIncidentSummary = useCallback((entry?: IncidentEntry | null) => (
    entry
      ? `${getIncidentLevelLabel(entry.level)} @ ${formatTime(entry.timestamp)}`
      : t.settings.noneValue
  ), [getIncidentLevelLabel, t.settings.noneValue]);

  const formatActivitySummary = useCallback((entry?: LogEntry | null) => (
    entry
      ? `${getLogLevelLabel(entry.level)} @ ${formatTime(entry.timestamp)}`
      : t.settings.noneValue
  ), [getLogLevelLabel, t.settings.noneValue]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [profilesRes, proxiesRes, instancesRes, supportRes, incidentsRes, feedbackRes, backupsRes, runtimesRes, logsRes] = await Promise.all([
      apiClient.get<DashboardProfile[]>('/api/profiles'),
      apiClient.get<DashboardProxy[]>('/api/proxies'),
      apiClient.get<DashboardInstance[]>('/api/instances'),
      apiClient.get<SupportStatus>('/api/support/status'),
      apiClient.get<{ count: number; incidents: IncidentEntry[] }>('/api/support/incidents?limit=5'),
      apiClient.get<{ count: number; entries: FeedbackEntry[] }>('/api/support/feedback?limit=3'),
      apiClient.get<BackupEntry[]>('/api/backups'),
      apiClient.get<RuntimeEntry[]>('/api/runtimes'),
      apiClient.get<LogEntry[]>('/api/logs'),
    ]);

    if (profilesRes.success) setProfiles(profilesRes.data);
    if (proxiesRes.success) setProxies(proxiesRes.data);
    if (instancesRes.success) {
      setInstances(Object.fromEntries(instancesRes.data.map((instance) => [instance.profileId, instance])));
    }
    if (supportRes.success) setSupport(supportRes.data);
    if (incidentsRes.success) setIncidents(incidentsRes.data.incidents);
    if (feedbackRes.success) setFeedbackEntries(feedbackRes.data.entries);
    if (backupsRes.success) setBackups(backupsRes.data.slice(0, 3));
    if (runtimesRes.success) setRuntimes(runtimesRes.data);
    if (logsRes.success) {
      setLogs(
        logsRes.data
          .slice(0, 8)
          .map((entry) => ({
            ...entry,
            timestamp: entry.timestamp ?? '',
          })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!support || loading || onboardingOpen) {
      return;
    }

    if (!support.onboardingCompleted && profiles.length === 0) {
      setOnboardingOpen(true);
    }
  }, [loading, onboardingOpen, profiles.length, support]);

  useWebSocket((event) => {
    if (
      event.type === 'instance:started'
      || event.type === 'instance:stopped'
      || event.type === 'instance:status-changed'
    ) {
      void loadDashboard();
    }
  });

  const runningProfiles = useMemo(
    () => profiles.filter((profile) => instances[profile.id]?.status === 'running').length,
    [instances, profiles],
  );

  const healthyProxies = useMemo(
    () => proxies.filter((proxy) => proxy.lastCheckStatus === 'healthy').length,
    [proxies],
  );

  const availableRuntimes = useMemo(
    () => runtimes.filter((runtime) => runtime.available),
    [runtimes],
  );

  const profilesNeedingAttention = useMemo(
    () => profiles.filter((profile) =>
      instances[profile.id]?.status === 'unreachable' || profile.proxy?.lastCheckStatus === 'failing').slice(0, 5),
    [instances, profiles],
  );

  const recentProfiles = useMemo(
    () => [...profiles]
      .sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime())
      .slice(0, 5),
    [profiles],
  );

  const activeProfiles = useMemo(
    () => profiles
      .filter((profile) => instances[profile.id]?.status === 'running')
      .sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime())
      .slice(0, 5),
    [instances, profiles],
  );

  const launchReadyProfiles = useMemo(
    () => profiles
      .filter((profile) => {
        const instanceStatus = instances[profile.id]?.status ?? 'stopped';
        const proxyStatus = profile.proxy?.lastCheckStatus;
        return instanceStatus !== 'running' && proxyStatus !== 'failing';
      })
      .sort((a, b) => new Date(b.lastUsedAt ?? 0).getTime() - new Date(a.lastUsedAt ?? 0).getTime())
      .slice(0, 5),
    [instances, profiles],
  );

  const failingProxyIds = useMemo(
    () => Array.from(new Set(
      profiles
        .filter((profile) => profile.proxy?.lastCheckStatus === 'failing')
        .map((profile) => profile.proxy?.id)
        .filter((proxyId): proxyId is string => Boolean(proxyId)),
    )),
    [profiles],
  );

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
  }, [logs, t.dashboard.logHeatCalm, t.dashboard.logHeatElevated, t.dashboard.logHeatHot]);

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
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return new Date(b.entry.timestamp).getTime() - new Date(a.entry.timestamp).getTime();
      })
      .slice(0, 3);
  }, [logs]);

  const hottestRecentIssue = topRecentIssues[0] ?? null;

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
  }, [incidents, t.dashboard.logHeatCalm, t.dashboard.logHeatElevated, t.dashboard.logHeatHot]);

  const activityDigest = useMemo(() => {
    if (!logs.length) {
      return null;
    }

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
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
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
  }, [hottestRecentIssue, logHeat.incidents15, logHeat.incidents60, logs, topRecentIssues]);

  const handleStartProfile = useCallback(async (profileId: string) => {
    setStartingProfileId(profileId);
    const res = await apiClient.post(`/api/profiles/${profileId}/start`);
    setStartingProfileId(null);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.dashboard.profileStarted);
    await loadDashboard();
  }, [loadDashboard, t.dashboard.profileStarted]);

  const handleStopProfile = useCallback(async (profileId: string) => {
    setStoppingProfileId(profileId);
    const res = await apiClient.post(`/api/profiles/${profileId}/stop`);
    setStoppingProfileId(null);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(t.dashboard.profileStopped);
    await loadDashboard();
  }, [loadDashboard, t.dashboard.profileStopped]);

  const handleStartAllReadyProfiles = useCallback(async () => {
    if (!launchReadyProfiles.length) {
      return;
    }
    setStartingAllReady(true);
    const results = await Promise.all(
      launchReadyProfiles.map(async (profile) => ({
        id: profile.id,
        res: await apiClient.post(`/api/profiles/${profile.id}/start`),
      })),
    );
    setStartingAllReady(false);

    const failures = results.filter(({ res }) => !res.success);
    if (failures.length) {
      void message.warning(`${t.dashboard.bulkStartReadyResult}: ${results.length - failures.length}/${results.length}`);
    } else {
      void message.success(`${t.dashboard.bulkStartReadyResult}: ${results.length}/${results.length}`);
    }
    await loadDashboard();
  }, [launchReadyProfiles, loadDashboard, t.dashboard.bulkStartReadyResult]);

  const handleStopAllRunningProfiles = useCallback(async () => {
    if (!activeProfiles.length) {
      return;
    }
    setStoppingAllRunning(true);
    const results = await Promise.all(
      activeProfiles.map(async (profile) => ({
        id: profile.id,
        res: await apiClient.post(`/api/profiles/${profile.id}/stop`),
      })),
    );
    setStoppingAllRunning(false);

    const failures = results.filter(({ res }) => !res.success);
    if (failures.length) {
      void message.warning(`${t.dashboard.bulkStopRunningResult}: ${results.length - failures.length}/${results.length}`);
    } else {
      void message.success(`${t.dashboard.bulkStopRunningResult}: ${results.length}/${results.length}`);
    }
    await loadDashboard();
  }, [activeProfiles, loadDashboard, t.dashboard.bulkStopRunningResult]);

  const handleRetestProxy = useCallback(async (profile: DashboardProfile) => {
    if (!profile.proxy?.id) {
      return;
    }
    setRetestingProfileId(profile.id);
    const res = await apiClient.post<{
      total: number;
      healthy: number;
      failing: number;
    }>('/api/proxies/test-bulk', { ids: [profile.proxy.id] });
    setRetestingProfileId(null);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(
      `${t.dashboard.proxyRetested}: OK ${res.data.healthy} · FAIL ${res.data.failing}`,
    );
    await loadDashboard();
  }, [loadDashboard, t.dashboard.proxyRetested]);

  const handleRetestAllFailingProxies = useCallback(async () => {
    if (!failingProxyIds.length) {
      return;
    }
    setRetestingAll(true);
    const res = await apiClient.post<{
      total: number;
      healthy: number;
      failing: number;
    }>('/api/proxies/test-bulk', { ids: failingProxyIds });
    setRetestingAll(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(
      `${t.dashboard.proxyRetested}: OK ${res.data.healthy} · FAIL ${res.data.failing}`,
    );
    await loadDashboard();
  }, [failingProxyIds, loadDashboard, t.dashboard.proxyRetested]);

  const handleRunSelfTest = useCallback(async () => {
    setRunningSelfTest(true);
    const res = await apiClient.post<SelfTestResult>('/api/support/self-test');
    setRunningSelfTest(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    setSelfTest(res.data);
    void message.success(t.dashboard.selfTestRan);
  }, [t.dashboard.selfTestRan]);

  const handleExportDiagnostics = useCallback(() => {
    window.open(buildApiUrl('/api/support/diagnostics'), '_blank');
    void message.success(t.dashboard.diagnosticsExportStarted);
  }, [t.dashboard.diagnosticsExportStarted]);

  const handleCopySupportSummary = useCallback(async () => {
    if (!support) {
      void message.warning(t.dashboard.supportSummaryUnavailable);
      return;
    }

    setCopyingSummary(true);
    const summaryLines = [
      t.settings.supportSummaryTitle,
      `${t.settings.appVersionLabel}: ${support.appVersion}`,
      `${t.settings.nodeVersionLabel}: ${support.nodeVersion}`,
      `${t.settings.platformLabel}: ${support.platform}/${support.arch}`,
      `${t.settings.uptimeLabel}: ${Math.round(support.uptimeSeconds)}s`,
      `${t.settings.profilesLabel}: ${support.profileCount}`,
      `${t.settings.proxiesLabel}: ${support.proxyCount}`,
      `${t.settings.recentIncidentsLabel}: ${support.recentIncidentCount} (${support.recentErrorCount} ${t.settings.errorsLabel})`,
      `${t.settings.diagnosticsLabel}: ${support.diagnosticsReady ? t.common.yes : t.common.no}`,
      `${t.settings.dataDirLabel}: ${support.dataDir}`,
      `${t.settings.onboardingLabel}: ${getOnboardingStatusLabel(support.onboardingState.status)}`,
      `${t.settings.lastLaunchLabel}: ${support.usageMetrics.lastProfileLaunchAt ?? t.settings.noneValue}`,
      support.warnings.length ? `${t.settings.warningsLabel}: ${support.warnings.join(' | ')}` : `${t.settings.warningsLabel}: ${t.settings.noneValue}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.supportSummaryCopied);
    } catch {
      void message.error(t.dashboard.supportSummaryCopyFailed);
    } finally {
      setCopyingSummary(false);
    }
  }, [support, t.dashboard.supportSummaryCopied, t.dashboard.supportSummaryCopyFailed, t.dashboard.supportSummaryUnavailable]);

  const handleOpenCreateProfile = useCallback(() => {
    if (!availableRuntimes.length) {
      setOnboardingOpen(true);
      return;
    }

    navigate('/profiles', { state: { openCreate: true } });
  }, [availableRuntimes.length, navigate]);

  const handleOpenLogEntry = useCallback((entry: LogEntry) => {
    navigate('/logs', {
      state: {
        presetQuery: entry.message,
        presetFilter: entry.level === 'error' || entry.level === 'warn' ? 'issues' : 'all',
        presetRecentWindowOnly: entry.level === 'error' || entry.level === 'warn',
      },
    });
  }, [navigate]);

  const handleOpenActivitySource = useCallback((source?: string | null) => {
    if (!source) {
      return;
    }

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
    if (!activityDigest?.topSourceLatestEntry) {
      return;
    }

    handleOpenLogEntry(activityDigest.topSourceLatestEntry);
  }, [activityDigest, handleOpenLogEntry]);

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
    if (!source) {
      return;
    }

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
    if (!incidentDigest?.latestIncident) {
      return;
    }

    handleOpenIncidentInLogs(incidentDigest.latestIncident);
  }, [handleOpenIncidentInLogs, incidentDigest]);

  const handleOpenTopSourceLatestIncident = useCallback(() => {
    if (!incidentDigest?.topSourceLatestIncident) {
      return;
    }

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
    if (!incidentDigest) {
      return;
    }

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
  }, [
    handleOpenLatestIncident,
    handleOpenRecentLogs,
    handleOpenTopIncidentSource,
    incidentDigest,
    t.dashboard.incidentActionDistributed,
    t.dashboard.incidentActionFocused,
    t.dashboard.incidentActionImmediate,
  ]);

  const incidentSuggestedActionLabel = useMemo(() => {
    if (!incidentDigest) {
      return t.dashboard.openLatestIncident;
    }

    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionImmediate) {
      return t.dashboard.openLatestIncident;
    }

    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionFocused) {
      return t.dashboard.openTopSource;
    }

    if (incidentDigest.incidentActionHint === t.dashboard.incidentActionDistributed) {
      return t.dashboard.openRecentLogs;
    }

    return t.dashboard.openLatestIncident;
  }, [
    incidentDigest,
    t.dashboard.incidentActionDistributed,
    t.dashboard.incidentActionFocused,
    t.dashboard.incidentActionImmediate,
    t.dashboard.openLatestIncident,
    t.dashboard.openRecentLogs,
    t.dashboard.openTopSource,
  ]);

  const handleOpenHottestIssueLogs = useCallback(() => {
    if (!hottestRecentIssue) {
      return;
    }

    navigate('/logs', {
      state: {
        presetQuery: hottestRecentIssue.entry.message,
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [hottestRecentIssue, navigate]);

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
  }, [
    hottestRecentIssue,
    logHeat.label,
    getLogLevelLabel,
    t.dashboard.hottestIssueCopied,
    t.dashboard.hottestIssueCopyFailed,
    t.dashboard.hottestIssueDigestTitle,
    t.dashboard.hottestIssueRepeatsDigestLabel,
    t.dashboard.hottestIssueUnavailable,
    t.dashboard.levelLabel,
    t.dashboard.logHeatLabel,
    t.dashboard.messageLabel,
    t.dashboard.rawLabel,
    t.dashboard.timestampLabel,
  ]);

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
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.incidentDigestCopied);
    } catch {
      void message.error(t.dashboard.incidentDigestCopyFailed);
    } finally {
      setCopyingIncidentDigest(false);
    }
  }, [
    incidentDigest,
    formatIncidentSummary,
    formatMaybeValue,
    getIncidentLevelLabel,
    t.dashboard.incidentDigestCopied,
    t.dashboard.incidentDigestCopyFailed,
    t.dashboard.incidentDigestTitle,
    t.dashboard.incidentDigestUnavailable,
    t.dashboard.topSourceLatestDigestLabel,
    t.dashboard.topSourceLatestLevelDigestLabel,
    t.dashboard.topSourceMessageDigestLabel,
    t.dashboard.topSourceShareDigestLabel,
    t.dashboard.totalIncidentsLabel,
    t.dashboard.latestIncidentDigestLabel,
    t.dashboard.latestSourceDigestLabel,
    t.dashboard.topSourcesDigestLabel,
  ]);

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
  }, [
    incidentDigest,
    formatMaybeValue,
    getIncidentLevelLabel,
    t.dashboard.latestIncidentCopied,
    t.dashboard.latestIncidentCopyFailed,
    t.dashboard.latestIncidentDigestTitle,
    t.dashboard.latestIncidentUnavailable,
    t.dashboard.levelLabel,
    t.dashboard.messageLabel,
    t.dashboard.sourceLabel,
    t.dashboard.timestampLabel,
  ]);

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
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.topIncidentSourceCopied);
    } catch {
      void message.error(t.dashboard.topIncidentSourceCopyFailed);
    } finally {
      setCopyingTopIncidentSource(false);
    }
  }, [
    incidentDigest,
    formatIncidentSummary,
    t.dashboard.topIncidentSourceCopied,
    t.dashboard.topIncidentSourceCopyFailed,
    t.dashboard.topIncidentSourceCountLabel,
    t.dashboard.topIncidentSourceDigestTitle,
    t.dashboard.topIncidentSourceUnavailable,
    t.dashboard.sourceLabel,
  ]);

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
  }, [
    incidentDigest,
    t.dashboard.topIncidentSourcesCopied,
    t.dashboard.topIncidentSourcesCopyFailed,
    t.dashboard.topIncidentSourcesDigestTitle,
    t.dashboard.topIncidentSourcesUnavailable,
  ]);

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
  }, [
    incidentDigest,
    formatMaybeValue,
    getIncidentLevelLabel,
    t.dashboard.topSourceLatestIncidentCopied,
    t.dashboard.topSourceLatestIncidentCopyFailed,
    t.dashboard.topSourceLatestIncidentDigestTitle,
    t.dashboard.topSourceLatestIncidentUnavailable,
    t.dashboard.levelLabel,
    t.dashboard.messageLabel,
    t.dashboard.sourceLabel,
    t.dashboard.timestampLabel,
  ]);

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
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      void message.success(t.dashboard.activityDigestCopied);
    } catch {
      void message.error(t.dashboard.activityDigestCopyFailed);
    } finally {
      setCopyingActivityDigest(false);
    }
  }, [
    activityDigest,
    formatActivitySummary,
    logHeat.label,
    t.dashboard.activityDigestCopied,
    t.dashboard.activityDigestCopyFailed,
    t.dashboard.activityDigestTitle,
    t.dashboard.activityDigestUnavailable,
    t.dashboard.activityEntriesDigestLabel,
    t.dashboard.topActivitySourceDigestLabel,
    t.dashboard.topActivitySourceLatestDigestLabel,
    t.dashboard.topActivitySourceFreshnessDigestLabel,
    t.dashboard.topActivitySourceLatestLevelDigestLabel,
    t.dashboard.topActivitySourceLatestMessageDigestLabel,
    t.dashboard.hottestIssueRepeatsDigestLabel,
    t.dashboard.latestActivityDigestLabel,
    t.dashboard.latestSourceDigestLabel,
    t.dashboard.topIssuesDigestLabel,
    t.dashboard.topActivitySourcesDigestLabel,
  ]);

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
  }, [
    activityDigest,
    getLogLevelLabel,
    t.dashboard.latestActivityCopied,
    t.dashboard.latestActivityCopyFailed,
    t.dashboard.latestActivityDigestTitle,
    t.dashboard.latestActivityUnavailable,
    t.dashboard.levelLabel,
    t.dashboard.messageLabel,
    t.dashboard.rawLabel,
    t.dashboard.timestampLabel,
  ]);

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
  }, [
    activityDigest,
    logHeat.label,
    t.dashboard.topActivityIssuesCopied,
    t.dashboard.topActivityIssuesCopyFailed,
    t.dashboard.topActivityIssuesDigestTitle,
    t.dashboard.topActivityIssuesUnavailable,
  ]);

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
  }, [
    activityDigest,
    getLogLevelLabel,
    t.dashboard.countLabel,
    t.dashboard.freshnessLabel,
    t.dashboard.levelLabel,
    t.dashboard.levelTextLabel,
    t.dashboard.topActivitySourceLatestCopied,
    t.dashboard.topActivitySourceLatestCopyFailed,
    t.dashboard.topActivitySourceLatestDigestTitle,
    t.dashboard.topActivitySourceLatestUnavailable,
    t.dashboard.messageLabel,
    t.dashboard.rawLabel,
    t.dashboard.sourceLabel,
    t.dashboard.timestampLabel,
  ]);

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
  }, [
    activityDigest,
    t.dashboard.topActivitySourcesCopied,
    t.dashboard.topActivitySourcesCopyFailed,
    t.dashboard.topActivitySourcesDigestTitle,
    t.dashboard.topActivitySourcesUnavailable,
  ]);

  const handleOpenLatestActivity = useCallback(() => {
    if (!activityDigest?.latestEntry) {
      return;
    }

    handleOpenLogEntry(activityDigest.latestEntry);
  }, [activityDigest, handleOpenLogEntry]);

  const handleActivitySuggestedAction = useCallback(() => {
    if (!activityDigest) {
      return;
    }

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
  }, [
    activityDigest,
    handleOpenActivitySource,
    handleOpenHottestIssueLogs,
    handleOpenLatestActivity,
    handleOpenRecentLogs,
    t.dashboard.activityActionSource,
    hottestRecentIssue,
    t.dashboard.activityActionHottest,
    t.dashboard.activityActionRecent,
  ]);

  const activitySuggestedActionLabel = useMemo(() => {
    if (!activityDigest) {
      return t.dashboard.openLatestActivity;
    }

    if (activityDigest.activityActionHint === t.dashboard.activityActionHottest && hottestRecentIssue) {
      return t.dashboard.openHottestIssue;
    }

    if (activityDigest.activityActionHint === t.dashboard.activityActionSource && activityDigest.topSource) {
      return t.dashboard.openTopActivitySource;
    }

    if (activityDigest.activityActionHint === t.dashboard.activityActionRecent) {
      return t.dashboard.openRecentLogs;
    }

    return t.dashboard.openLatestActivity;
  }, [
    activityDigest,
    hottestRecentIssue,
    t.dashboard.activityActionSource,
    t.dashboard.activityActionHottest,
    t.dashboard.activityActionRecent,
    t.dashboard.openHottestIssue,
    t.dashboard.openLatestActivity,
    t.dashboard.openTopActivitySource,
    t.dashboard.openRecentLogs,
  ]);

  const handleOpenActivityIssue = useCallback((messageText?: string | null) => {
    if (!messageText) {
      return;
    }

    navigate('/logs', {
      state: {
        presetQuery: messageText,
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

  const handleCreateBackup = useCallback(async () => {
    setCreatingBackup(true);
    const res = await apiClient.post<BackupEntry>('/api/backups');
    setCreatingBackup(false);
    if (!res.success) {
      void message.error(res.error);
      return;
    }
    void message.success(`${t.dashboard.backupCreated}: ${res.data.filename}`);
    await loadDashboard();
  }, [loadDashboard, t.dashboard.backupCreated]);

  const handleOpenOnboarding = useCallback(async () => {
    await apiClient.put('/api/config', { onboardingCompleted: false });
    setOnboardingOpen(true);
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    const values = await feedbackForm.validateFields() as {
      category: 'bug' | 'feedback' | 'question';
      sentiment: 'negative' | 'neutral' | 'positive';
      message: string;
      email?: string;
    };

    setSubmittingFeedback(true);
    const res = await apiClient.post<FeedbackEntry>('/api/support/feedback', {
      ...values,
      appVersion: '',
    });
    setSubmittingFeedback(false);

    if (!res.success) {
      void message.error(res.error);
      return;
    }

    feedbackForm.resetFields();
    void message.success(t.dashboard.feedbackSaved);
    await loadDashboard();
  }, [feedbackForm, loadDashboard, t.dashboard.feedbackSaved]);

  const setupChecklist = useMemo<SetupChecklistItem[]>(() => [
    {
      key: 'runtime',
      label: t.dashboard.checkRuntime,
      done: availableRuntimes.length > 0,
      detail: availableRuntimes.length
        ? `${t.dashboard.runtimeReadyCount}: ${availableRuntimes.length}/${runtimes.length}`
        : t.dashboard.runtimeActionHint,
      actionLabel: availableRuntimes.length ? t.dashboard.reviewOnboarding : t.dashboard.fixRuntimeSetup,
      onAction: () => { void handleOpenOnboarding(); },
    },
    {
      key: 'profile',
      label: t.dashboard.checkProfile,
      done: profiles.length > 0,
      detail: profiles.length
        ? `${t.dashboard.totalProfiles}: ${profiles.length}`
        : t.dashboard.checkProfileHint,
      actionLabel: profiles.length ? t.dashboard.openProfiles : t.dashboard.createFirstProfile,
      onAction: () => { profiles.length ? navigate('/profiles') : handleOpenCreateProfile(); },
    },
    {
      key: 'proxy',
      label: t.dashboard.checkProxy,
      done: healthyProxies > 0,
      detail: healthyProxies
        ? `${t.dashboard.healthyProxies}: ${healthyProxies}/${proxies.length}`
        : t.dashboard.checkProxyHint,
      actionLabel: failingProxyIds.length ? t.dashboard.retestAllFailing : t.dashboard.openProxies,
      onAction: () => {
        if (failingProxyIds.length) {
          void handleRetestAllFailingProxies();
          return;
        }
        navigate('/proxies');
      },
    },
  ], [
    availableRuntimes.length,
    failingProxyIds.length,
    handleOpenCreateProfile,
    handleOpenOnboarding,
    handleRetestAllFailingProxies,
    healthyProxies,
    navigate,
    profiles.length,
    proxies.length,
    runtimes.length,
    t.dashboard.checkProfile,
    t.dashboard.checkProfileHint,
    t.dashboard.checkProxy,
    t.dashboard.checkProxyHint,
    t.dashboard.checkRuntime,
    t.dashboard.createFirstProfile,
    t.dashboard.fixRuntimeSetup,
    t.dashboard.healthyProxies,
    t.dashboard.openProfiles,
    t.dashboard.openProxies,
    t.dashboard.reviewOnboarding,
    t.dashboard.retestAllFailing,
    t.dashboard.runtimeActionHint,
    t.dashboard.runtimeReadyCount,
    t.dashboard.totalProfiles,
  ]);

  const nextStep = useMemo<NextStepAction | null>(() => {
    const pendingSetup = setupChecklist.find((item) => !item.done);
    if (pendingSetup) {
      return {
        title: pendingSetup.label,
        detail: pendingSetup.detail,
        actionLabel: pendingSetup.actionLabel,
        onAction: pendingSetup.onAction,
      };
    }

    if (failingProxyIds.length) {
      return {
        title: t.dashboard.nextStepProxyTitle,
        detail: `${t.dashboard.nextStepProxyHint}: ${failingProxyIds.length}`,
        actionLabel: t.dashboard.retestAllFailing,
        onAction: () => { void handleRetestAllFailingProxies(); },
      };
    }

    if (launchReadyProfiles.length) {
      return {
        title: t.dashboard.nextStepLaunchTitle,
        detail: `${t.dashboard.launchReadyTitle}: ${launchReadyProfiles.length}`,
        actionLabel: t.dashboard.startAllReady,
        onAction: () => { void handleStartAllReadyProfiles(); },
      };
    }

    if (activeProfiles.length) {
      return {
        title: t.dashboard.nextStepObserveTitle,
        detail: `${t.dashboard.runningNowTitle}: ${activeProfiles.length}`,
        actionLabel: t.dashboard.openProfiles,
        onAction: () => navigate('/profiles'),
      };
    }

    return null;
  }, [
    activeProfiles.length,
    failingProxyIds.length,
    handleRetestAllFailingProxies,
    handleStartAllReadyProfiles,
    launchReadyProfiles.length,
    navigate,
    setupChecklist,
    t.dashboard.launchReadyTitle,
    t.dashboard.nextStepLaunchTitle,
    t.dashboard.nextStepObserveTitle,
    t.dashboard.nextStepProxyHint,
    t.dashboard.nextStepProxyTitle,
    t.dashboard.openProfiles,
    t.dashboard.retestAllFailing,
    t.dashboard.runningNowTitle,
    t.dashboard.startAllReady,
  ]);

  const readinessPercent = useMemo(() => {
    if (!setupChecklist.length) return 0;
    const completed = setupChecklist.filter((item) => item.done).length;
    const setupWeight = (completed / setupChecklist.length) * 80;
    const diagnosticsWeight = support?.diagnosticsReady ? 10 : 0;
    const warningsPenalty = Math.min(10, (support?.warnings.length ?? 0) * 5);
    return Math.max(0, Math.min(100, Math.round(setupWeight + diagnosticsWeight - warningsPenalty)));
  }, [setupChecklist, support?.diagnosticsReady, support?.warnings.length]);

  const readinessStatus = useMemo(() => {
    if (readinessPercent >= 90) {
      return {
        strokeColor: '#52c41a',
        label: t.dashboard.readinessReady,
      };
    }
    if (readinessPercent >= 60) {
      return {
        strokeColor: '#1677ff',
        label: t.dashboard.readinessAlmost,
      };
    }
    return {
      strokeColor: '#faad14',
      label: t.dashboard.readinessNeedsSetup,
    };
  }, [readinessPercent, t.dashboard.readinessAlmost, t.dashboard.readinessNeedsSetup, t.dashboard.readinessReady]);

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <Card style={cardStyle} bodyStyle={{ padding: 24 }}>
          <Row gutter={[24, 24]} align="middle" justify="space-between">
            <Col xs={24} lg={16}>
              <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
                {t.dashboard.title}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                {t.dashboard.subtitle}
              </Typography.Paragraph>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<UserOutlined />}
                  onClick={profiles.length ? () => navigate('/profiles') : handleOpenCreateProfile}
                >
                  {t.dashboard.openProfiles}
                </Button>
                <Button icon={<ApiOutlined />} onClick={() => navigate('/proxies')}>
                  {t.dashboard.openProxies}
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportDiagnostics}>
                  {t.dashboard.exportDiagnostics}
                </Button>
                <Button
                  icon={<CopyOutlined />}
                  loading={copyingSummary}
                  onClick={() => { void handleCopySupportSummary(); }}
                >
                  {t.dashboard.copySupportSummary}
                </Button>
                <Button loading={creatingBackup} onClick={() => { void handleCreateBackup(); }}>
                  {t.dashboard.createBackup}
                </Button>
                <Button onClick={() => { void handleOpenOnboarding(); }}>
                  {support?.onboardingCompleted ? t.dashboard.reviewOnboarding : t.dashboard.continueOnboarding}
                </Button>
                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => { void loadDashboard(); }}>
                  {t.dashboard.refresh}
                </Button>
                <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>
                  {t.dashboard.openSettings}
                </Button>
              </Space>
            </Col>
            <Col xs={24} lg={8}>
              <Card bordered={false} style={{ background: '#f8fafc' }}>
                <Space direction="vertical" size={8}>
                  <Typography.Text strong>{t.dashboard.launchSnapshot}</Typography.Text>
                  <Typography.Text type="secondary">
                    {support?.usageMetrics.lastProfileLaunchAt
                      ? `${t.dashboard.lastLaunch}: ${formatTime(support.usageMetrics.lastProfileLaunchAt)}`
                      : t.dashboard.noLaunchYet}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {`${t.dashboard.totalLaunches}: ${support?.usageMetrics.profileLaunches ?? 0}`}
                  </Typography.Text>
                </Space>
              </Card>
            </Col>
          </Row>
        </Card>

        {support?.warnings.length ? (
          <Alert
            type="warning"
            showIcon
            message={t.dashboard.opsWarnings}
            description={
              <Space direction="vertical" size={2}>
                {support.warnings.map((warning) => (
                  <Typography.Text key={warning}>{warning}</Typography.Text>
                ))}
              </Space>
            }
          />
        ) : null}

        {nextStep ? (
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Typography.Text type="secondary">{t.dashboard.nextStepLabel}</Typography.Text>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {nextStep.title}
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                {nextStep.detail}
              </Typography.Paragraph>
              <Space>
                <Button type="primary" onClick={nextStep.onAction}>
                  {nextStep.actionLabel}
                </Button>
                <Button onClick={() => navigate('/profiles')}>{t.dashboard.openProfiles}</Button>
              </Space>
            </Space>
          </Card>
        ) : null}

        <Card style={cardStyle} title={t.dashboard.readinessTitle}>
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={10}>
              <Progress
                type="circle"
                percent={readinessPercent}
                strokeColor={readinessStatus.strokeColor}
                format={(percent) => `${percent ?? 0}%`}
              />
            </Col>
            <Col xs={24} md={14}>
              <Space direction="vertical" size={8}>
                <Tag color={readinessStatus.strokeColor === '#52c41a' ? 'green' : readinessStatus.strokeColor === '#1677ff' ? 'blue' : 'gold'}>
                  {readinessStatus.label}
                </Tag>
                <Typography.Text type="secondary">
                  {`${t.dashboard.readinessChecklist}: ${setupChecklist.filter((item) => item.done).length}/${setupChecklist.length}`}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {`${t.dashboard.readinessDiagnostics}: ${support?.diagnosticsReady ? t.dashboard.checkDone : t.dashboard.checkPending}`}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {`${t.dashboard.opsWarnings}: ${support?.warnings.length ?? 0}`}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {`${t.dashboard.healthyProxies}: ${healthyProxies}/${support?.proxyCount ?? proxies.length}`}
                </Typography.Text>
              </Space>
            </Col>
          </Row>
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card style={cardStyle} loading={loading}>
              <Statistic title={t.dashboard.totalProfiles} value={support?.profileCount ?? profiles.length} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card style={cardStyle} loading={loading}>
              <Statistic title={t.dashboard.runningProfiles} value={runningProfiles} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card style={cardStyle} loading={loading}>
              <Statistic title={t.dashboard.healthyProxies} value={healthyProxies} suffix={`/ ${support?.proxyCount ?? proxies.length}`} />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card style={cardStyle} loading={loading}>
              <Statistic title={t.dashboard.incidents} value={support?.recentIncidentCount ?? 0} suffix={`${support?.recentErrorCount ?? 0} err`} />
            </Card>
          </Col>
        </Row>

        <Card
          style={cardStyle}
          title={t.dashboard.runtimeTitle}
          extra={<Button type="link" onClick={() => navigate('/settings')}>{t.dashboard.openSettings}</Button>}
        >
          {runtimes.length ? (
            <Space wrap>
              {runtimes.map((runtime) => (
                <Tag key={runtime.key} color={runtime.available ? 'green' : 'default'}>
                  {`${runtime.label ?? runtime.name ?? runtime.key}: ${runtime.available ? t.dashboard.runtimeReady : t.dashboard.runtimeMissing}`}
                </Tag>
              ))}
            </Space>
          ) : (
            <Empty description={t.dashboard.noRuntimeConfigured} />
          )}
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            {availableRuntimes.length
              ? `${t.dashboard.runtimeReadyCount}: ${availableRuntimes.length}/${runtimes.length}`
              : t.dashboard.runtimeActionHint}
          </Typography.Paragraph>
          {!availableRuntimes.length ? (
            <Button style={{ marginTop: 12 }} onClick={() => { void handleOpenOnboarding(); }}>
              {t.dashboard.fixRuntimeSetup}
            </Button>
          ) : null}
        </Card>

        <Card style={cardStyle} title={t.dashboard.setupChecklistTitle}>
          <List
            dataSource={setupChecklist}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button key={`${item.key}-action`} type="link" onClick={item.onAction}>
                    {item.actionLabel}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={(
                    <Space wrap>
                      <Tag color={item.done ? 'green' : 'gold'}>
                        {item.done ? t.dashboard.checkDone : t.dashboard.checkPending}
                      </Tag>
                      <Typography.Text strong>{item.label}</Typography.Text>
                    </Space>
                  )}
                  description={item.detail}
                />
              </List.Item>
            )}
          />
        </Card>

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={8}>
            <Card
              title={t.dashboard.quickActionsTitle}
              style={cardStyle}
              extra={<Button type="link" onClick={() => navigate('/profiles')}>{t.dashboard.review}</Button>}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Button
                  type="primary"
                  block
                  icon={<UserOutlined />}
                  onClick={profiles.length ? () => navigate('/profiles') : handleOpenCreateProfile}
                >
                  {profiles.length ? t.dashboard.openProfiles : t.dashboard.createFirstProfile}
                </Button>
                <Button
                  block
                  icon={<ReloadOutlined />}
                  disabled={!failingProxyIds.length}
                  loading={retestingAll}
                  onClick={() => { void handleRetestAllFailingProxies(); }}
                >
                  {failingProxyIds.length
                    ? `${t.dashboard.retestAllFailing} (${failingProxyIds.length})`
                    : t.dashboard.noFailingProxies}
                </Button>
                <Button block icon={<ApiOutlined />} onClick={() => navigate('/proxies')}>
                  {t.dashboard.openProxies}
                </Button>
              </Space>
            </Card>
          </Col>
          <Col xs={24} xl={8}>
            <Card
              title={t.dashboard.attentionTitle}
              style={cardStyle}
              extra={<Button type="link" onClick={() => navigate('/profiles')}>{t.dashboard.openProfiles}</Button>}
            >
              {profilesNeedingAttention.length ? (
                <List
                  dataSource={profilesNeedingAttention}
                  renderItem={(profile) => (
                    <List.Item
                      actions={[
                        <Button
                          key="retest"
                          type="link"
                          icon={<ReloadOutlined />}
                          loading={retestingProfileId === profile.id}
                          onClick={() => { void handleRetestProxy(profile); }}
                        >
                          {t.dashboard.retestProxy}
                        </Button>,
                        <Button key="open" type="link" icon={<ArrowRightOutlined />} onClick={() => navigate('/profiles')}>
                          {t.dashboard.review}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={profile.name}
                        description={(
                          <Space wrap>
                            {instances[profile.id]?.status === 'unreachable' ? (
                              <Tag color="red">{t.dashboard.runtimeIssue}</Tag>
                            ) : null}
                            {profile.proxy?.lastCheckStatus === 'failing' ? (
                              <Tag color="orange">{t.dashboard.proxyNeedsCheck}</Tag>
                            ) : null}
                            {profile.group ? <Tag>{profile.group}</Tag> : null}
                          </Space>
                        )}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description={t.dashboard.noAttention} />
              )}
            </Card>
          </Col>
          <Col xs={24} xl={8}>
            <Card
              title={t.dashboard.recentTitle}
              style={cardStyle}
              extra={<Button type="link" onClick={() => navigate('/profiles')}>{t.dashboard.openProfiles}</Button>}
            >
              {recentProfiles.length ? (
                <List
                  dataSource={recentProfiles}
                  renderItem={(profile) => (
                    <List.Item
                      actions={[
                        <Button
                          key="start"
                          type="link"
                          icon={<PlayCircleOutlined />}
                          loading={startingProfileId === profile.id}
                          onClick={() => { void handleStartProfile(profile.id); }}
                        >
                          {t.profile.startProfile}
                        </Button>,
                        <Button
                          key="open"
                          type="link"
                          icon={<ArrowRightOutlined />}
                          onClick={() => navigate('/profiles')}
                        >
                          {t.dashboard.review}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={profile.name}
                        description={(
                          <Space direction="vertical" size={0}>
                            <Typography.Text type="secondary">
                              {`${t.dashboard.lastLaunch}: ${formatTime(profile.lastUsedAt)}`}
                            </Typography.Text>
                            <Space wrap>
                              {profile.runtime ? <Tag>{profile.runtime}</Tag> : null}
                              {profile.tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                            </Space>
                          </Space>
                        )}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description={t.dashboard.noRecentProfiles} />
              )}
            </Card>
          </Col>
        </Row>

        <Card
          style={cardStyle}
          title={t.dashboard.incidentsTitle}
          extra={(
            <Space size={8}>
              {incidentDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingTopSourceLatestIncident}
                  onClick={() => { void handleCopyTopSourceLatestIncident(); }}
                >
                  {t.dashboard.copyTopSourceLatestIncident}
                </Button>
              ) : null}
              {incidentDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingTopIncidentSources}
                  onClick={() => { void handleCopyTopIncidentSources(); }}
                >
                  {t.dashboard.copyTopIncidentSources}
                </Button>
              ) : null}
              {incidentDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingTopIncidentSource}
                  onClick={() => { void handleCopyTopIncidentSource(); }}
                >
                  {t.dashboard.copyTopIncidentSource}
                </Button>
              ) : null}
              {incidentDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingLatestIncident}
                  onClick={() => { void handleCopyLatestIncident(); }}
                >
                  {t.dashboard.copyLatestIncident}
                </Button>
              ) : null}
              {incidentDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingIncidentDigest}
                  onClick={() => { void handleCopyIncidentDigest(); }}
                >
                  {t.dashboard.copyIncidentDigest}
                </Button>
              ) : null}
              <Button type="link" onClick={() => navigate('/settings')}>{t.dashboard.openSettings}</Button>
            </Space>
          )}
        >
          {incidents.length ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {incidentDigest ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color="blue">{`${t.dashboard.incidentsTitle}: ${incidentDigest.total}`}</Tag>
                    <Tag color={incidentDigest.heat.color}>{`${t.dashboard.incidentHeatLabel}: ${incidentDigest.heat.label}`}</Tag>
                    <Tag color={incidentDigest.trend.color}>{`${t.dashboard.incidentTrendLabel}: ${incidentDigest.trend.label}`}</Tag>
                    <Tag color={incidentDigest.freshness.color}>{`${t.dashboard.incidentFreshnessLabel}: ${incidentDigest.freshness.label}`}</Tag>
                    <Tag color="gold">{`${t.dashboard.incidentIssues15Label}: ${incidentDigest.incidents15}`}</Tag>
                    <Tag color="orange">{`${t.dashboard.incidentIssues60Label}: ${incidentDigest.incidents60}`}</Tag>
                    <Tag color="red">{`${t.dashboard.errorCountLabel}: ${incidentDigest.errors}`}</Tag>
                    <Tag color="gold">{`${t.dashboard.warningCountLabel}: ${incidentDigest.warnings}`}</Tag>
                    <Tag color={incidentDigest.errorRatio >= 60 ? 'red' : incidentDigest.errorRatio >= 30 ? 'gold' : 'green'}>
                      {`${t.dashboard.errorRatioLabel}: ${incidentDigest.errorRatio}%`}
                    </Tag>
                    {incidentDigest.topSource ? (
                      <Tag color={incidentDigest.topSourceRatio >= 60 ? 'volcano' : incidentDigest.topSourceRatio >= 35 ? 'gold' : 'geekblue'}>
                        {`${t.dashboard.topSourceShareLabel}: ${incidentDigest.topSourceRatio}%`}
                      </Tag>
                    ) : null}
                    <Tag color={incidentDigest.topSourcesConcentration >= 80 ? 'volcano' : incidentDigest.topSourcesConcentration >= 60 ? 'gold' : 'green'}>
                      {`${t.dashboard.topSourcesConcentrationLabel}: ${incidentDigest.topSourcesConcentration}%`}
                    </Tag>
                    <Tag color={incidentDigest.sourceMode.color}>
                      {`${t.dashboard.incidentSourceModeLabel}: ${incidentDigest.sourceMode.label}`}
                    </Tag>
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      onClick={handleOpenLatestIncident}
                    >
                      <Tag color={incidentDigest.latestIncident.level === 'error' ? 'red' : 'orange'}>
                        {`${t.dashboard.latestIncidentLabel}: ${formatTime(incidentDigest.latestIncident.timestamp)}`}
                      </Tag>
                    </Button>
                    {incidentDigest.topSources.map(([source, count], index) => (
                      <Button
                        key={`${source}-${count}`}
                        type="link"
                        size="small"
                        title={source}
                        style={{ paddingInline: 0 }}
                        onClick={() => handleOpenIncidentSource(source)}
                      >
                        <Tag color={index === 0 ? 'purple' : 'geekblue'}>
                          {`${index === 0 ? t.dashboard.topSourceLabel : t.dashboard.topSourcesLabel}: ${source} ×${count}`}
                        </Tag>
                      </Button>
                    ))}
                  </Space>
                  <Typography.Text type="secondary">
                    {`${t.dashboard.latestMessageLabel}: ${summarizeIssueMessage(incidentDigest.latestIncident.message, 120)}`}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {`${t.dashboard.incidentSourceModeHintLabel}: ${incidentDigest.sourceModeHint}`}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {`${t.dashboard.incidentActionHintLabel}: ${incidentDigest.incidentActionHint}`}
                  </Typography.Text>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0, justifyContent: 'flex-start' }}
                    onClick={handleIncidentSuggestedAction}
                  >
                    {`${t.dashboard.incidentActionButtonLabel}: ${incidentSuggestedActionLabel}`}
                  </Button>
                  {incidentDigest.topSourceLatestIncident ? (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color={incidentDigest.topSourceFreshness.color}>
                          {`${t.dashboard.topSourceFreshnessLabel}: ${incidentDigest.topSourceFreshness.label}`}
                        </Tag>
                        <Tag color={incidentDigest.topSourceLatestLevel.color}>
                          {`${t.dashboard.topSourceLatestLevelLabel}: ${incidentDigest.topSourceLatestLevel.label}`}
                        </Tag>
                      </Space>
                      <Button
                        type="link"
                        size="small"
                        style={{ paddingInline: 0, justifyContent: 'flex-start' }}
                        onClick={handleOpenTopSourceLatestIncident}
                      >
                        {`${t.dashboard.topSourceLatestMessageLabel}: ${summarizeIssueMessage(incidentDigest.topSourceLatestIncident.message, 120)}`}
                      </Button>
                    </Space>
                  ) : null}
                </Space>
              ) : null}
              <List
                dataSource={incidents}
                renderItem={(incident) => (
                  <List.Item
                    actions={[
                      <Button key={`${incident.timestamp}-${incident.message}`} type="link" onClick={() => handleOpenIncidentInLogs(incident)}>
                        {t.dashboard.openInLogs}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={(
                        <Space wrap>
                          <Tag color={incident.level === 'error' ? 'red' : 'gold'}>{getIncidentLevelLabel(incident.level)}</Tag>
                          <Typography.Text strong>{incident.source}</Typography.Text>
                        </Space>
                      )}
                      description={(
                        <Space direction="vertical" size={0}>
                          <Typography.Text>{incident.message}</Typography.Text>
                          <Typography.Text type="secondary">{formatTime(incident.timestamp)}</Typography.Text>
                        </Space>
                      )}
                    />
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Empty description={t.dashboard.noIncidents} />
          )}
        </Card>

        <Card
          style={cardStyle}
          title={t.dashboard.activityTitle}
          extra={(
            <Space size={8}>
              <Tag color={logHeat.color}>{`${t.dashboard.logHeatLabel}: ${logHeat.label}`}</Tag>
              {activityDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingLatestActivity}
                  onClick={() => { void handleCopyLatestActivity(); }}
                >
                  {t.dashboard.copyLatestActivity}
                </Button>
              ) : null}
              {activityDigest?.topRecentIssues.length ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingTopActivityIssues}
                  onClick={() => { void handleCopyTopActivityIssues(); }}
                >
                  {t.dashboard.copyTopActivityIssues}
                </Button>
              ) : null}
              {activityDigest?.topSources.length ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingTopActivitySources}
                  onClick={() => { void handleCopyTopActivitySources(); }}
                >
                  {t.dashboard.copyTopActivitySources}
                </Button>
              ) : null}
              {activityDigest ? (
                <Button
                  type="link"
                  icon={<CopyOutlined />}
                  loading={copyingActivityDigest}
                  onClick={() => { void handleCopyActivityDigest(); }}
                >
                  {t.dashboard.copyActivityDigest}
                </Button>
              ) : null}
              {hottestRecentIssue ? (
                <Tag color="magenta" title={hottestRecentIssue.entry.message}>
                  {`${t.dashboard.hottestIssueLabel}: ${summarizeIssueMessage(hottestRecentIssue.entry.message)} ×${hottestRecentIssue.count}`}
                </Tag>
              ) : null}
              {hottestRecentIssue ? (
                <Button type="link" onClick={handleOpenHottestIssueLogs}>
                  {t.dashboard.openHottestIssue}
                </Button>
              ) : null}
              {hottestRecentIssue ? (
                <Button type="link" icon={<CopyOutlined />} onClick={() => { void handleCopyHottestIssue(); }}>
                  {t.dashboard.copyHottestIssue}
                </Button>
              ) : null}
              <Button type="link" onClick={handleOpenRecentLogs}>{t.dashboard.openRecentLogs}</Button>
              <Button type="link" onClick={() => navigate('/logs')}>{t.nav.logs}</Button>
            </Space>
          )}
        >
          {logs.length ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {activityDigest ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color="blue">{`${t.dashboard.activityEntriesLabel}: ${activityDigest.total}`}</Tag>
                    <Tag color={activityDigest.activityFreshness.color}>{`${t.dashboard.activityFreshnessLabel}: ${activityDigest.activityFreshness.label}`}</Tag>
                    <Tag color={activityDigest.latestActivityLevel.color}>{`${t.dashboard.latestActivityLevelLabel}: ${activityDigest.latestActivityLevel.label}`}</Tag>
                    <Tag color={activityDigest.activitySignalMode.color}>{`${t.dashboard.activitySignalModeLabel}: ${activityDigest.activitySignalMode.label}`}</Tag>
                    <Tag color="red">{`${t.dashboard.errorCountLabel}: ${activityDigest.errors}`}</Tag>
                    <Tag color="gold">{`${t.dashboard.warningCountLabel}: ${activityDigest.warnings}`}</Tag>
                    <Tag color="cyan">{`${t.dashboard.debugCountLabel}: ${activityDigest.debugs}`}</Tag>
                    <Tag color="blue">{`${t.dashboard.infoCountLabel}: ${activityDigest.infos}`}</Tag>
                    <Tag color={activityDigest.issueRatio >= 60 ? 'red' : activityDigest.issueRatio >= 30 ? 'gold' : 'green'}>
                      {`${t.dashboard.issueRatioLabel}: ${activityDigest.issueRatio}%`}
                    </Tag>
                    <Tag color="gold">{`${t.dashboard.activityIssues15Label}: ${activityDigest.issues15}`}</Tag>
                    <Tag color="orange">{`${t.dashboard.activityIssues60Label}: ${activityDigest.issues60}`}</Tag>
                    <Tag color={activityDigest.topSourceShare >= 50 ? 'cyan' : 'blue'}>
                      {`${t.dashboard.topActivitySourceShareLabel}: ${activityDigest.topSourceShare}%`}
                    </Tag>
                    <Tag color={activityDigest.topSourcesConcentration >= 80 ? 'cyan' : activityDigest.topSourcesConcentration >= 50 ? 'blue' : 'green'}>
                      {`${t.dashboard.topActivitySourcesConcentrationLabel}: ${activityDigest.topSourcesConcentration}%`}
                    </Tag>
                    <Tag color={activityDigest.activitySourceMode.color}>
                      {`${t.dashboard.activitySourceModeLabel}: ${activityDigest.activitySourceMode.label}`}
                    </Tag>
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 0 }}
                      onClick={handleOpenLatestActivity}
                    >
                      <Tag color={activityDigest.latestEntry.level === 'error' ? 'red' : activityDigest.latestEntry.level === 'warn' ? 'gold' : 'blue'}>
                        {`${t.dashboard.latestActivityLabel}: ${formatTime(activityDigest.latestEntry.timestamp)}`}
                      </Tag>
                    </Button>
                    {activityDigest.topSources.map(([source, count], index) => (
                      <Button
                        key={`${source}-${count}`}
                        type="link"
                        size="small"
                        title={source}
                        style={{ paddingInline: 0 }}
                        onClick={() => handleOpenActivitySource(source)}
                      >
                        <Tag color={index === 0 ? 'cyan' : 'blue'}>
                          {`${index === 0 ? t.dashboard.topActivitySourceLabel : t.dashboard.topActivitySourcesLabel}: ${summarizeIssueMessage(source)} ×${count}`}
                        </Tag>
                      </Button>
                    ))}
                    {activityDigest.topRecentIssues.map((issue, index) => (
                      <Button
                        key={`${issue.entry.message}-${issue.count}`}
                        type="link"
                        size="small"
                        title={issue.entry.message}
                        style={{ paddingInline: 0 }}
                        onClick={() => handleOpenActivityIssue(issue.entry.message)}
                      >
                        <Tag color={index === 0 ? 'magenta' : 'purple'}>
                          {`${index === 0 ? t.dashboard.hottestIssueLabel : t.dashboard.topIssuesLabel}: ${summarizeIssueMessage(issue.entry.message)} ×${issue.count}`}
                        </Tag>
                      </Button>
                    ))}
                  </Space>
                  {activityDigest.topRecentIssues[0] ? (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Typography.Text type="secondary">
                        {`${t.dashboard.hottestPatternLabel}: ${summarizeIssueMessage(activityDigest.topRecentIssues[0].entry.message, 120)}`}
                      </Typography.Text>
                      <Space wrap>
                        <Tag color="magenta">
                          {`${t.dashboard.hottestIssueRepeatsLabel}: ${activityDigest.topRecentIssues[0].count}`}
                        </Tag>
                        <Tag color={activityDigest.hottestIssueFreshness.color}>
                          {`${t.dashboard.hottestIssueFreshnessLabel}: ${activityDigest.hottestIssueFreshness.label}`}
                        </Tag>
                        <Tag color={activityDigest.hottestIssueLevel.color}>
                          {`${t.dashboard.hottestIssueLevelLabel}: ${activityDigest.hottestIssueLevel.label}`}
                        </Tag>
                      </Space>
                    </Space>
                  ) : null}
                  <Typography.Text type="secondary">
                    {`${t.dashboard.activitySignalHintLabel}: ${activityDigest.activitySignalMode.hint}`}
                  </Typography.Text>
                  {activityDigest.latestEntry.source ? (
                    <Typography.Text type="secondary">
                      {`${t.dashboard.topActivitySourceLabel}: ${activityDigest.latestEntry.source}`}
                    </Typography.Text>
                  ) : null}
                  {activityDigest.topSourceLatestEntry ? (
                    <Space wrap>
                      <Tag color={activityDigest.topSourceLatestFreshness.color}>
                        {`${t.dashboard.topActivitySourceFreshnessLabel}: ${activityDigest.topSourceLatestFreshness.label}`}
                      </Tag>
                      <Tag color={activityDigest.topSourceLatestLevel.color}>
                        {`${t.dashboard.topActivitySourceLatestLevelLabel}: ${activityDigest.topSourceLatestLevel.label}`}
                      </Tag>
                      <Button
                        type="link"
                        size="small"
                        style={{ paddingInline: 0 }}
                        onClick={handleOpenTopActivitySourceLatest}
                      >
                        {`${t.dashboard.topActivitySourceLatestLabel}: ${summarizeIssueMessage(activityDigest.topSourceLatestEntry.message, 120)}`}
                      </Button>
                      <Button
                        type="link"
                        icon={<CopyOutlined />}
                        size="small"
                        loading={copyingTopActivitySourceLatest}
                        onClick={() => { void handleCopyTopActivitySourceLatest(); }}
                      >
                        {t.dashboard.copyTopActivitySourceLatest}
                      </Button>
                    </Space>
                  ) : null}
                  <Typography.Text type="secondary">
                    {`${t.dashboard.activitySourceModeHintLabel}: ${activityDigest.activitySourceMode.hint}`}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {`${t.dashboard.activityActionHintLabel}: ${activityDigest.activityActionHint}`}
                  </Typography.Text>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0, justifyContent: 'flex-start' }}
                    onClick={handleActivitySuggestedAction}
                  >
                    {`${t.dashboard.activityActionButtonLabel}: ${activitySuggestedActionLabel}`}
                  </Button>
                </Space>
              ) : null}
              <List
                dataSource={logs}
                renderItem={(entry) => (
                  <List.Item
                    actions={[
                      <Button key={`${entry.timestamp}-${entry.message}`} type="link" onClick={() => handleOpenLogEntry(entry)}>
                        {t.dashboard.openInLogs}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={(
                        <Space wrap>
                        <Tag color={entry.level === 'error' ? 'red' : entry.level === 'warn' ? 'gold' : 'blue'}>
                          {getLogLevelLabel(entry.level)}
                        </Tag>
                        {entry.source ? <Tag color="cyan">{entry.source}</Tag> : null}
                        {entry.timestamp ? (
                          <Typography.Text type="secondary">{formatTime(entry.timestamp)}</Typography.Text>
                        ) : null}
                        </Space>
                      )}
                      description={entry.message}
                    />
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Empty description={t.dashboard.noActivity} />
          )}
        </Card>

        <Card
          style={cardStyle}
          title={t.dashboard.selfTestTitle}
          extra={(
            <Button type="link" loading={runningSelfTest} onClick={() => { void handleRunSelfTest(); }}>
              {t.dashboard.runSelfTest}
            </Button>
          )}
        >
          {selfTest ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={selfTest.status === 'pass' ? 'green' : selfTest.status === 'warn' ? 'gold' : 'red'}>
                  {getSelfTestStatusLabel(selfTest.status)}
                </Tag>
                <Typography.Text type="secondary">
                  {`${t.dashboard.lastSelfTest}: ${formatTime(selfTest.checkedAt)}`}
                </Typography.Text>
              </Space>
              <List
                size="small"
                dataSource={selfTest.checks.slice(0, 5)}
                renderItem={(check) => (
                  <List.Item>
                    <List.Item.Meta
                      title={(
                        <Space wrap>
                          <Tag color={check.status === 'pass' ? 'green' : check.status === 'warn' ? 'gold' : 'red'}>
                            {getSelfTestStatusLabel(check.status)}
                          </Tag>
                          <Typography.Text strong>{check.label}</Typography.Text>
                        </Space>
                      )}
                      description={check.detail}
                    />
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Empty description={t.dashboard.selfTestEmpty} />
          )}
        </Card>

        <Card
          style={cardStyle}
          title={t.dashboard.backupTitle}
          extra={(
            <Space>
              <Button loading={creatingBackup} onClick={() => { void handleCreateBackup(); }}>
                {t.dashboard.createBackup}
              </Button>
              <Button type="link" onClick={() => navigate('/settings')}>{t.dashboard.openSettings}</Button>
            </Space>
          )}
        >
          {backups.length ? (
            <List
              dataSource={backups}
              renderItem={(backup) => (
                <List.Item
                  actions={[
                    <Button
                      key="download"
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => window.open(buildApiUrl(`/api/backups/export/${encodeURIComponent(backup.filename)}`), '_blank')}
                      >
                      {t.dashboard.downloadBackup}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={backup.filename}
                    description={(
                      <Space wrap>
                        <Typography.Text type="secondary">{formatTime(backup.timestamp)}</Typography.Text>
                        <Tag>{`${Math.max(1, Math.round(backup.sizeBytes / 1024))} KB`}</Tag>
                      </Space>
                    )}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description={t.dashboard.noBackupsYet} />
          )}
        </Card>

        <Card
          style={cardStyle}
          title={t.dashboard.launchReadyTitle}
          extra={(
            <Space>
              <Button
                type="link"
                loading={startingAllReady}
                disabled={!launchReadyProfiles.length}
                onClick={() => { void handleStartAllReadyProfiles(); }}
              >
                {t.dashboard.startAllReady}
              </Button>
              <Button type="link" onClick={() => navigate('/profiles')}>{t.dashboard.openProfiles}</Button>
            </Space>
          )}
        >
          {launchReadyProfiles.length ? (
            <List
              dataSource={launchReadyProfiles}
              renderItem={(profile) => (
                <List.Item
                  actions={[
                    <Button
                      key="start"
                      type="link"
                      icon={<PlayCircleOutlined />}
                      loading={startingProfileId === profile.id}
                      onClick={() => { void handleStartProfile(profile.id); }}
                    >
                      {t.profile.startProfile}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={profile.name}
                    description={(
                      <Space wrap>
                        <Tag color="green">{t.dashboard.readyTag}</Tag>
                        {profile.proxy ? (
                          <Tag color={profile.proxy.lastCheckStatus === 'healthy' ? 'blue' : 'default'}>
                            {profile.proxy.label ?? `${profile.proxy.host}:${profile.proxy.port}`}
                          </Tag>
                        ) : (
                          <Tag>{t.dashboard.noProxyTag}</Tag>
                        )}
                        {profile.runtime ? <Tag>{profile.runtime}</Tag> : null}
                      </Space>
                    )}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description={t.dashboard.noLaunchReadyProfiles} />
          )}
        </Card>

        <Card
          style={cardStyle}
          title={t.dashboard.runningNowTitle}
          extra={(
            <Space>
              <Button
                type="link"
                loading={stoppingAllRunning}
                disabled={!activeProfiles.length}
                onClick={() => { void handleStopAllRunningProfiles(); }}
              >
                {t.dashboard.stopAllRunning}
              </Button>
              <Button type="link" onClick={() => navigate('/profiles')}>{t.dashboard.openProfiles}</Button>
            </Space>
          )}
        >
          {activeProfiles.length ? (
            <List
              dataSource={activeProfiles}
              renderItem={(profile) => (
                <List.Item
                  actions={[
                    <Button
                      key="stop"
                      type="link"
                      icon={<StopOutlined />}
                      loading={stoppingProfileId === profile.id}
                      onClick={() => { void handleStopProfile(profile.id); }}
                    >
                      {t.profile.stopProfile}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={profile.name}
                    description={(
                      <Space wrap>
                        <Tag color="green">{t.dashboard.runningTag}</Tag>
                        {profile.group ? <Tag>{profile.group}</Tag> : null}
                        {profile.runtime ? <Tag>{profile.runtime}</Tag> : null}
                      </Space>
                    )}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description={t.dashboard.noRunningProfiles} />
          )}
        </Card>

        <Card
          style={cardStyle}
          title={t.dashboard.feedbackTitle}
          extra={<Button type="link" onClick={() => navigate('/settings')}>{t.dashboard.openSettings}</Button>}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Form form={feedbackForm} layout="vertical">
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item name="category" label={t.dashboard.feedbackCategory} initialValue="feedback" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: t.settings.feedbackCategoryFeedback, value: 'feedback' },
                          { label: t.settings.feedbackCategoryBug, value: 'bug' },
                          { label: t.settings.feedbackCategoryQuestion, value: 'question' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="sentiment" label={t.dashboard.feedbackSentiment} initialValue="neutral" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: t.settings.feedbackSentimentNeutral, value: 'neutral' },
                          { label: t.settings.feedbackSentimentPositive, value: 'positive' },
                          { label: t.settings.feedbackSentimentNegative, value: 'negative' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="message" label={t.dashboard.feedbackMessage} rules={[{ required: true, min: 10 }]}>
                  <Input.TextArea rows={4} placeholder={t.dashboard.feedbackPlaceholder} />
                </Form.Item>
                <Form.Item name="email" label={t.dashboard.feedbackEmail} rules={[{ type: 'email' }]}>
                  <Input placeholder={t.settings.feedbackEmailPlaceholder} />
                </Form.Item>
                <Button type="primary" loading={submittingFeedback} onClick={() => { void handleSubmitFeedback(); }}>
                  {t.dashboard.submitFeedback}
                </Button>
              </Form>
            </Col>
            <Col xs={24} xl={12}>
              {feedbackEntries.length ? (
                <List
                  dataSource={feedbackEntries}
                  renderItem={(entry) => (
                    <List.Item>
                      <List.Item.Meta
                        title={(
                          <Space wrap>
                            <Tag>{getFeedbackCategoryLabel(entry.category)}</Tag>
                            <Tag color={entry.sentiment === 'negative' ? 'red' : entry.sentiment === 'positive' ? 'green' : 'default'}>
                              {getFeedbackSentimentLabel(entry.sentiment)}
                            </Tag>
                            <Typography.Text type="secondary">{formatTime(entry.createdAt)}</Typography.Text>
                          </Space>
                        )}
                        description={entry.message}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description={t.dashboard.noFeedbackYet} />
              )}
            </Col>
          </Row>
        </Card>

        <Card style={cardStyle} title={t.dashboard.onboardingTitle}>
          <Space direction="vertical" size={8}>
            <Typography.Text>
              {support?.onboardingCompleted ? t.dashboard.onboardingDone : t.dashboard.onboardingPending}
            </Typography.Text>
            <Typography.Text type="secondary">
              {`${t.dashboard.onboardingStatus}: ${getOnboardingStatusLabel(support?.onboardingState.status)}`}
            </Typography.Text>
            {support?.onboardingState.selectedRuntime ? (
              <Typography.Text type="secondary">
                {`${t.dashboard.selectedRuntime}: ${support.onboardingState.selectedRuntime}`}
              </Typography.Text>
            ) : null}
            {support?.onboardingState.draftProfileName ? (
              <Typography.Text type="secondary">
                {`${t.dashboard.draftProfile}: ${support.onboardingState.draftProfileName}`}
              </Typography.Text>
            ) : null}
            <Button type="primary" onClick={() => { void handleOpenOnboarding(); }}>
              {support?.onboardingCompleted ? t.dashboard.reviewOnboarding : t.dashboard.continueOnboarding}
            </Button>
          </Space>
        </Card>
        <OnboardingWizard
          open={onboardingOpen}
          onFinish={() => {
            setOnboardingOpen(false);
            void loadDashboard();
          }}
        />
      </Space>
    </div>
  );
};

export default Dashboard;
