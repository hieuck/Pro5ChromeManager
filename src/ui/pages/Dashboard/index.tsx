import React from 'react';
import { StatsOverview } from './components/StatsOverview';
import { ProfileQuickActions } from './components/ProfileQuickActions';
import { IncidentDigest } from './components/IncidentDigest';
import { ActivityDigest } from './components/ActivityDigest';
import { SupportPanel } from './components/SupportPanel';

import { useDashboardState, formatTime, summarizeIssueMessage } from './useDashboardState';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Progress, Row, Select, Space, Statistic, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowRightOutlined, CopyOutlined, DownloadOutlined, PlayCircleOutlined, ReloadOutlined, SettingOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient, buildApiUrl } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
import { useWebSocket } from '../hooks/useWebSocket';
import OnboardingWizard from '../components/OnboardingWizard';

import { DashboardProfile, DashboardProxy, DashboardInstance, SupportStatus, IncidentEntry, SelfTestCheck, SelfTestResult, FeedbackEntry, BackupEntry, RuntimeEntry, LogEntry, SetupChecklistItem, NextStepAction } from './types';

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
  const state = useDashboardState();
  const { navigate, profiles, proxies, instances, support, incidents, selfTest, feedbackEntries, backups, runtimes, logs, loading, startingProfileId, startingAllReady, stoppingProfileId, stoppingAllRunning, retestingProfileId, retestingAll, runningSelfTest, submittingFeedback, creatingBackup, copyingSummary, copyingIncidentDigest, copyingActivityDigest, copyingLatestIncident, copyingTopIncidentSource, copyingTopIncidentSources, copyingTopSourceLatestIncident, copyingLatestActivity, copyingTopActivityIssues, copyingTopActivitySourceLatest, copyingTopActivitySources, onboardingOpen, feedbackForm, getFeedbackCategoryLabel, getFeedbackSentimentLabel, getOnboardingStatusLabel, getIncidentLevelLabel, getLogLevelLabel, getSelfTestStatusLabel, formatMaybeValue, formatIncidentSummary, formatActivitySummary, loadDashboard, runningProfiles, healthyProxies, availableRuntimes, profilesNeedingAttention, recentProfiles, activeProfiles, launchReadyProfiles, failingProxyIds, logHeat, topRecentIssues, incidentDigest, activityDigest, handleStartProfile, handleStopProfile, handleStartAllReadyProfiles, handleStopAllRunningProfiles, handleRetestProxy, handleRetestAllFailingProxies, handleRunSelfTest, handleExportDiagnostics, handleCopySupportSummary, handleOpenCreateProfile, handleOpenLogEntry, handleOpenActivitySource, handleOpenTopActivitySourceLatest, handleOpenIncidentInLogs, handleOpenIncidentSource, handleOpenTopIncidentSource, handleOpenLatestIncident, handleOpenTopSourceLatestIncident, handleOpenRecentLogs, handleIncidentSuggestedAction, incidentSuggestedActionLabel, handleOpenHottestIssueLogs, handleCopyHottestIssue, handleCopyIncidentDigest, handleCopyLatestIncident, handleCopyTopIncidentSource, handleCopyTopIncidentSources, handleCopyTopSourceLatestIncident, handleCopyActivityDigest, handleCopyLatestActivity, handleCopyTopActivityIssues, handleCopyTopActivitySourceLatest, handleCopyTopActivitySources, handleOpenLatestActivity, handleActivitySuggestedAction, activitySuggestedActionLabel, handleOpenActivityIssue, handleCreateBackup, handleOpenOnboarding, handleSubmitFeedback, setupChecklist, nextStep, readinessPercent, readinessStatus } = state;

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

                <StatsOverview state={state} t={t} />
        <ProfileQuickActions state={state} t={t} />
        <IncidentDigest state={state} t={t} />
        <ActivityDigest state={state} t={t} />
        <SupportPanel state={state} t={t} />

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
