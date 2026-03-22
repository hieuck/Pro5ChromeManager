import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowRightOutlined, DownloadOutlined, PlayCircleOutlined, ReloadOutlined, SettingOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
import { useWebSocket } from '../hooks/useWebSocket';

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

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

function formatTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
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
  const [loading, setLoading] = useState(false);
  const [startingProfileId, setStartingProfileId] = useState<string | null>(null);
  const [startingAllReady, setStartingAllReady] = useState(false);
  const [stoppingProfileId, setStoppingProfileId] = useState<string | null>(null);
  const [stoppingAllRunning, setStoppingAllRunning] = useState(false);
  const [retestingProfileId, setRetestingProfileId] = useState<string | null>(null);
  const [retestingAll, setRetestingAll] = useState(false);
  const [runningSelfTest, setRunningSelfTest] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [profilesRes, proxiesRes, instancesRes, supportRes, incidentsRes] = await Promise.all([
      apiClient.get<DashboardProfile[]>('/api/profiles'),
      apiClient.get<DashboardProxy[]>('/api/proxies'),
      apiClient.get<DashboardInstance[]>('/api/instances'),
      apiClient.get<SupportStatus>('/api/support/status'),
      apiClient.get<{ count: number; incidents: IncidentEntry[] }>('/api/support/incidents?limit=5'),
    ]);

    if (profilesRes.success) setProfiles(profilesRes.data);
    if (proxiesRes.success) setProxies(proxiesRes.data);
    if (instancesRes.success) {
      setInstances(Object.fromEntries(instancesRes.data.map((instance) => [instance.profileId, instance])));
    }
    if (supportRes.success) setSupport(supportRes.data);
    if (incidentsRes.success) setIncidents(incidentsRes.data.incidents);
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
                <Button type="primary" icon={<UserOutlined />} onClick={() => navigate('/profiles')}>
                  {t.dashboard.openProfiles}
                </Button>
                <Button icon={<ApiOutlined />} onClick={() => navigate('/proxies')}>
                  {t.dashboard.openProxies}
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportDiagnostics}>
                  {t.dashboard.exportDiagnostics}
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

        <Row gutter={[16, 16]}>
          <Col xs={24} xl={8}>
            <Card
              title={t.dashboard.quickActionsTitle}
              style={cardStyle}
              extra={<Button type="link" onClick={() => navigate('/profiles')}>{t.dashboard.review}</Button>}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Button type="primary" block icon={<UserOutlined />} onClick={() => navigate('/profiles')}>
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
          extra={<Button type="link" onClick={() => navigate('/settings')}>{t.dashboard.openSettings}</Button>}
        >
          {incidents.length ? (
            <List
              dataSource={incidents}
              renderItem={(incident) => (
                <List.Item>
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
          ) : (
            <Empty description={t.dashboard.noIncidents} />
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
          </Space>
        </Card>
      </Space>
    </div>
  );
};

export default Dashboard;
