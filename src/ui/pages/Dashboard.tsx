import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Progress, Row, Select, Space, Statistic, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowRightOutlined, CopyOutlined, DownloadOutlined, PlayCircleOutlined, ReloadOutlined, SettingOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
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
  name: string;
  available: boolean;
  executablePath?: string | null;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  raw: string;
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
  const [copyingLatestActivity, setCopyingLatestActivity] = useState(false);
  const [copyingTopActivityIssues, setCopyingTopActivityIssues] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [feedbackForm] = Form.useForm();

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
      apiClient.get<string[]>('/api/logs'),
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
          .slice(-8)
          .reverse()
          .map((line) => {
            const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(.*)$/);
            if (!match) {
              return {
                timestamp: '',
                level: 'info',
                message: line,
                raw: line,
              };
            }
            return {
              timestamp: match[1],
              level: match[2].toLowerCase(),
              message: match[3],
              raw: line,
            };
          }),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

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
    const incidents15 = incidents.filter((incident) => isWithinLastMinutes(incident.timestamp, 15)).length;
    const incidents60 = incidents.filter((incident) => isWithinLastMinutes(incident.timestamp, 60)).length;
    const heat =
      incidents15 >= 3
        ? { color: 'red', label: t.dashboard.logHeatHot }
        : incidents15 > 0 || incidents60 >= 5
          ? { color: 'gold', label: t.dashboard.logHeatElevated }
          : { color: 'green', label: t.dashboard.logHeatCalm };

    return {
      total: incidents.length,
      errors: incidents.filter((incident) => incident.level === 'error').length,
      warnings: incidents.filter((incident) => incident.level === 'warn').length,
      incidents15,
      incidents60,
      heat,
      errorRatio: incidents.length ? Math.round((incidents.filter((incident) => incident.level === 'error').length / incidents.length) * 100) : 0,
      latestIncident,
      topSource,
      topSourceRatio: topSource ? Math.round((topSource[1] / incidents.length) * 100) : 0,
      topSources: topSources.slice(0, 3),
    };
  }, [incidents, t.dashboard.logHeatCalm, t.dashboard.logHeatElevated, t.dashboard.logHeatHot]);

  const activityDigest = useMemo(() => {
    if (!logs.length) {
      return null;
    }

    const latestEntry = logs
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    return {
      total: logs.length,
      issues15: logHeat.incidents15,
      issues60: logHeat.incidents60,
      errors: logs.filter((entry) => entry.level === 'error').length,
      warnings: logs.filter((entry) => entry.level === 'warn').length,
      infos: logs.filter((entry) => entry.level === 'info').length,
      issueRatio: logs.length ? Math.round(((logs.filter((entry) => entry.level === 'error' || entry.level === 'warn').length) / logs.length) * 100) : 0,
      latestEntry,
      hottestRecentIssue,
      topRecentIssues,
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
    window.open('http://127.0.0.1:3210/api/support/diagnostics', '_blank');
    void message.success(t.dashboard.diagnosticsExportStarted);
  }, [t.dashboard.diagnosticsExportStarted]);

  const handleCopySupportSummary = useCallback(async () => {
    if (!support) {
      void message.warning(t.dashboard.supportSummaryUnavailable);
      return;
    }

    setCopyingSummary(true);
    const summaryLines = [
      'Pro5 support summary',
      `App version: ${support.appVersion}`,
      `Node: ${support.nodeVersion}`,
      `Platform: ${support.platform}/${support.arch}`,
      `Uptime: ${Math.round(support.uptimeSeconds)}s`,
      `Profiles: ${support.profileCount}`,
      `Proxies: ${support.proxyCount}`,
      `Recent incidents: ${support.recentIncidentCount} (${support.recentErrorCount} errors)`,
      `Diagnostics ready: ${support.diagnosticsReady ? 'yes' : 'no'}`,
      `Data dir: ${support.dataDir}`,
      `Onboarding: ${support.onboardingState.status}`,
      `Last launch: ${support.usageMetrics.lastProfileLaunchAt ?? 'never'}`,
      support.warnings.length ? `Warnings: ${support.warnings.join(' | ')}` : 'Warnings: none',
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
    navigate('/profiles', { state: { openCreate: true } });
  }, [navigate]);

  const handleOpenLogEntry = useCallback((entry: LogEntry) => {
    navigate('/logs', {
      state: {
        presetQuery: entry.message,
        presetFilter: entry.level === 'error' || entry.level === 'warn' ? 'issues' : 'all',
        presetRecentWindowOnly: entry.level === 'error' || entry.level === 'warn',
      },
    });
  }, [navigate]);

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
        presetQuery: source,
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

  const handleOpenRecentLogs = useCallback(() => {
    navigate('/logs', {
      state: {
        presetFilter: 'issues',
        presetRecentWindowOnly: true,
        presetSortOrder: 'newest',
      },
    });
  }, [navigate]);

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
      'Pro5 hottest dashboard issue',
      `Heat: ${logHeat.label}`,
      `Repeats (60m): ${hottestRecentIssue.count}`,
      `Level: ${hottestRecentIssue.entry.level.toUpperCase()}`,
      `Timestamp: ${formatTime(hottestRecentIssue.entry.timestamp)}`,
      `Message: ${hottestRecentIssue.entry.message}`,
      `Raw: ${hottestRecentIssue.entry.raw}`,
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
    t.dashboard.hottestIssueCopied,
    t.dashboard.hottestIssueCopyFailed,
    t.dashboard.hottestIssueUnavailable,
  ]);

  const handleCopyIncidentDigest = useCallback(async () => {
    if (!incidentDigest) {
      void message.warning(t.dashboard.incidentDigestUnavailable);
      return;
    }

    setCopyingIncidentDigest(true);
    const summaryLines = [
      'Pro5 recent incident digest',
      `Incident heat: ${incidentDigest.heat.label}`,
      `Total incidents: ${incidentDigest.total}`,
      `Incidents (15m): ${incidentDigest.incidents15}`,
      `Incidents (60m): ${incidentDigest.incidents60}`,
      `Errors: ${incidentDigest.errors}`,
      `Warnings: ${incidentDigest.warnings}`,
      `Error ratio: ${incidentDigest.errorRatio}%`,
      incidentDigest.topSource ? `Top source share: ${incidentDigest.topSource[0]} (${incidentDigest.topSourceRatio}%)` : null,
      `Latest incident: ${incidentDigest.latestIncident.level.toUpperCase()} @ ${formatTime(incidentDigest.latestIncident.timestamp)}`,
      `Latest source: ${incidentDigest.latestIncident.source}`,
      `Latest message: ${incidentDigest.latestIncident.message}`,
      incidentDigest.topSources.length
        ? `Top sources: ${incidentDigest.topSources.map(([source, count]) => `${source} (${count})`).join(', ')}`
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
    t.dashboard.incidentDigestCopied,
    t.dashboard.incidentDigestCopyFailed,
    t.dashboard.incidentDigestUnavailable,
  ]);

  const handleCopyLatestIncident = useCallback(async () => {
    if (!incidentDigest?.latestIncident) {
      void message.warning(t.dashboard.latestIncidentUnavailable);
      return;
    }

    setCopyingLatestIncident(true);
    const latestIncident = incidentDigest.latestIncident;
    const summaryLines = [
      'Pro5 latest dashboard incident',
      `Level: ${latestIncident.level.toUpperCase()}`,
      `Timestamp: ${formatTime(latestIncident.timestamp)}`,
      `Source: ${latestIncident.source}`,
      `Message: ${latestIncident.message}`,
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
    t.dashboard.latestIncidentCopied,
    t.dashboard.latestIncidentCopyFailed,
    t.dashboard.latestIncidentUnavailable,
  ]);

  const handleCopyTopIncidentSource = useCallback(async () => {
    if (!incidentDigest?.topSource) {
      void message.warning(t.dashboard.topIncidentSourceUnavailable);
      return;
    }

    setCopyingTopIncidentSource(true);
    const summaryLines = [
      'Pro5 top incident source',
      `Source: ${incidentDigest.topSource[0]}`,
      `Count (recent incidents): ${incidentDigest.topSource[1]}`,
      `Latest incident: ${incidentDigest.latestIncident.level.toUpperCase()} @ ${formatTime(incidentDigest.latestIncident.timestamp)}`,
      `Latest message: ${incidentDigest.latestIncident.message}`,
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
    t.dashboard.topIncidentSourceCopied,
    t.dashboard.topIncidentSourceCopyFailed,
    t.dashboard.topIncidentSourceUnavailable,
  ]);

  const handleCopyTopIncidentSources = useCallback(async () => {
    if (!incidentDigest?.topSources.length) {
      void message.warning(t.dashboard.topIncidentSourcesUnavailable);
      return;
    }

    setCopyingTopIncidentSources(true);
    const summaryLines = [
      'Pro5 top dashboard incident sources',
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
    t.dashboard.topIncidentSourcesUnavailable,
  ]);

  const handleCopyActivityDigest = useCallback(async () => {
    if (!activityDigest) {
      void message.warning(t.dashboard.activityDigestUnavailable);
      return;
    }

    setCopyingActivityDigest(true);
    const summaryLines = [
      'Pro5 dashboard activity digest',
      `Log heat: ${logHeat.label}`,
      `Visible activity entries: ${activityDigest.total}`,
      `Issues (15m): ${activityDigest.issues15}`,
      `Issues (60m): ${activityDigest.issues60}`,
      `Errors: ${activityDigest.errors}`,
      `Warnings: ${activityDigest.warnings}`,
      `Info: ${activityDigest.infos}`,
      `Issue ratio: ${activityDigest.issueRatio}%`,
      `Latest activity: ${activityDigest.latestEntry.level.toUpperCase()} @ ${formatTime(activityDigest.latestEntry.timestamp)}`,
      `Latest message: ${activityDigest.latestEntry.message}`,
      activityDigest.topRecentIssues.length
        ? `Top issues: ${activityDigest.topRecentIssues.map((issue) => `${issue.entry.message} (${issue.count})`).join(', ')}`
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
    logHeat.label,
    t.dashboard.activityDigestCopied,
    t.dashboard.activityDigestCopyFailed,
    t.dashboard.activityDigestUnavailable,
  ]);

  const handleCopyLatestActivity = useCallback(async () => {
    if (!activityDigest?.latestEntry) {
      void message.warning(t.dashboard.latestActivityUnavailable);
      return;
    }

    setCopyingLatestActivity(true);
    const latestEntry = activityDigest.latestEntry;
    const summaryLines = [
      'Pro5 latest dashboard activity',
      `Level: ${latestEntry.level.toUpperCase()}`,
      `Timestamp: ${formatTime(latestEntry.timestamp)}`,
      `Message: ${latestEntry.message}`,
      `Raw: ${latestEntry.raw}`,
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
    t.dashboard.latestActivityCopied,
    t.dashboard.latestActivityCopyFailed,
    t.dashboard.latestActivityUnavailable,
  ]);

  const handleCopyTopActivityIssues = useCallback(async () => {
    if (!activityDigest?.topRecentIssues.length) {
      void message.warning(t.dashboard.topActivityIssuesUnavailable);
      return;
    }

    setCopyingTopActivityIssues(true);
    const summaryLines = [
      'Pro5 top dashboard activity issues',
      `Log heat: ${logHeat.label}`,
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
    t.dashboard.topActivityIssuesUnavailable,
  ]);

  const handleOpenLatestActivity = useCallback(() => {
    if (!activityDigest?.latestEntry) {
      return;
    }

    handleOpenLogEntry(activityDigest.latestEntry);
  }, [activityDigest, handleOpenLogEntry]);

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
                  {`${runtime.name}: ${runtime.available ? t.dashboard.runtimeReady : t.dashboard.runtimeMissing}`}
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
                          <Tag color={incident.level === 'error' ? 'red' : 'gold'}>{incident.level.toUpperCase()}</Tag>
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
                    <Tag color="red">{`${t.dashboard.errorCountLabel}: ${activityDigest.errors}`}</Tag>
                    <Tag color="gold">{`${t.dashboard.warningCountLabel}: ${activityDigest.warnings}`}</Tag>
                    <Tag color="blue">{`${t.dashboard.infoCountLabel}: ${activityDigest.infos}`}</Tag>
                    <Tag color={activityDigest.issueRatio >= 60 ? 'red' : activityDigest.issueRatio >= 30 ? 'gold' : 'green'}>
                      {`${t.dashboard.issueRatioLabel}: ${activityDigest.issueRatio}%`}
                    </Tag>
                    <Tag color="gold">{`${t.dashboard.activityIssues15Label}: ${activityDigest.issues15}`}</Tag>
                    <Tag color="orange">{`${t.dashboard.activityIssues60Label}: ${activityDigest.issues60}`}</Tag>
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
                    <Typography.Text type="secondary">
                      {`${t.dashboard.hottestPatternLabel}: ${summarizeIssueMessage(activityDigest.topRecentIssues[0].entry.message, 120)}`}
                    </Typography.Text>
                  ) : null}
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
                            {entry.level.toUpperCase()}
                          </Tag>
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
                  {selfTest.status.toUpperCase()}
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
                            {check.status.toUpperCase()}
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
                      onClick={() => window.open(`http://127.0.0.1:3210/api/backups/export/${encodeURIComponent(backup.filename)}`, '_blank')}
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
                          { label: 'Feedback', value: 'feedback' },
                          { label: 'Bug', value: 'bug' },
                          { label: 'Question', value: 'question' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="sentiment" label={t.dashboard.feedbackSentiment} initialValue="neutral" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: 'Neutral', value: 'neutral' },
                          { label: 'Positive', value: 'positive' },
                          { label: 'Negative', value: 'negative' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="message" label={t.dashboard.feedbackMessage} rules={[{ required: true, min: 10 }]}>
                  <Input.TextArea rows={4} placeholder={t.dashboard.feedbackPlaceholder} />
                </Form.Item>
                <Form.Item name="email" label={t.dashboard.feedbackEmail} rules={[{ type: 'email' }]}>
                  <Input placeholder="you@example.com" />
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
                            <Tag>{entry.category.toUpperCase()}</Tag>
                            <Tag color={entry.sentiment === 'negative' ? 'red' : entry.sentiment === 'positive' ? 'green' : 'default'}>
                              {entry.sentiment.toUpperCase()}
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
              {`${t.dashboard.onboardingStatus}: ${support?.onboardingState.status ?? 'not_started'}`}
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
