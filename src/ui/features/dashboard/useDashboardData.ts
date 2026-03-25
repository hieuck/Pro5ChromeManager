import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { useWebSocket } from '../../shared/hooks/useWebSocket';
import { DashboardProfile, DashboardProxy, DashboardInstance, SupportStatus, IncidentEntry, FeedbackEntry, BackupEntry, RuntimeEntry, LogEntry } from './types';

export function useDashboardData() {
  const [profiles, setProfiles] = useState<DashboardProfile[]>([]);
  const [proxies, setProxies] = useState<DashboardProxy[]>([]);
  const [instances, setInstances] = useState<Record<string, DashboardInstance>>({});
  const [support, setSupport] = useState<SupportStatus | null>(null);
  const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

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

  useWebSocket((event) => {
    if (
      event.type === 'instance:started'
      || event.type === 'instance:stopped'
      || event.type === 'instance:status-changed'
    ) {
      void loadDashboard();
    }
  });

  return {
    profiles, setProfiles,
    proxies, setProxies,
    instances, setInstances,
    support, setSupport,
    incidents, setIncidents,
    feedbackEntries, setFeedbackEntries,
    backups, setBackups,
    runtimes, setRuntimes,
    logs, setLogs,
    loading, setLoading,
    loadDashboard
  };
}
