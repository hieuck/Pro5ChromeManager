import React from 'react';
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import { ApiOutlined, CopyOutlined, DownloadOutlined, ReloadOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { StatsOverview } from './components/StatsOverview';
import { ProfileQuickActions } from './components/ProfileQuickActions';
import { IncidentDigest } from './components/IncidentDigest';
import { ActivityDigest } from './components/ActivityDigest';
import { SupportPanel } from './components/SupportPanel';
import { useDashboardState, formatTime } from './useDashboardState';
import OnboardingWizard from '../onboarding/components/OnboardingWizard';
import { RenderBoundary } from '../../shared/components/RenderBoundary';

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

const DashboardPage: React.FC = () => {
  const state = useDashboardState();
  const {
    t,
    navigate,
    profiles,
    support,
    loading,
    copyingSummary,
    creatingBackup,
    onboardingOpen,
    setOnboardingOpen,
    loadDashboard,
    handleExportDiagnostics,
    handleCopySupportSummary,
    handleOpenCreateProfile,
    handleCreateBackup,
    handleOpenOnboarding,
    nextStep,
  } = state;

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
            description={(
              <Space direction="vertical" size={2}>
                {support.warnings.map((warning) => (
                  <Typography.Text key={warning}>{warning}</Typography.Text>
                ))}
              </Space>
            )}
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

        <RenderBoundary title={t.dashboard.readinessTitle}>
          <StatsOverview state={state} t={t} />
        </RenderBoundary>
        <RenderBoundary title={t.dashboard.quickActionsTitle}>
          <ProfileQuickActions state={state} t={t} />
        </RenderBoundary>
        <RenderBoundary title={t.dashboard.incidentsTitle}>
          <IncidentDigest state={state} t={t} />
        </RenderBoundary>
        <RenderBoundary title={t.dashboard.activityTitle}>
          <ActivityDigest state={state} t={t} />
        </RenderBoundary>
        <RenderBoundary title={t.settings.support}>
          <SupportPanel state={state} t={t} />
        </RenderBoundary>

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

export default DashboardPage;
