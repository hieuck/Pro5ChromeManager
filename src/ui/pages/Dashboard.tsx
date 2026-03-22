import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowRightOutlined, PlayCircleOutlined, ReloadOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
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
  const [loading, setLoading] = useState(false);
  const [startingProfileId, setStartingProfileId] = useState<string | null>(null);
  const [retestingProfileId, setRetestingProfileId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [profilesRes, proxiesRes, instancesRes, supportRes] = await Promise.all([
      apiClient.get<DashboardProfile[]>('/api/profiles'),
      apiClient.get<DashboardProxy[]>('/api/proxies'),
      apiClient.get<DashboardInstance[]>('/api/instances'),
      apiClient.get<SupportStatus>('/api/support/status'),
    ]);

    if (profilesRes.success) setProfiles(profilesRes.data);
    if (proxiesRes.success) setProxies(proxiesRes.data);
    if (instancesRes.success) {
      setInstances(Object.fromEntries(instancesRes.data.map((instance) => [instance.profileId, instance])));
    }
    if (supportRes.success) setSupport(supportRes.data);
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
          <Col xs={24} xl={12}>
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
          <Col xs={24} xl={12}>
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
