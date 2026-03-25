import React from 'react';
import { Alert, Button, Card, Col, Empty, Form, Input, List, Progress, Row, Select, Space, Statistic, Tag, Typography, message } from 'antd';
import { ApiOutlined, ArrowRightOutlined, CopyOutlined, DownloadOutlined, PlayCircleOutlined, ReloadOutlined, SettingOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { DashboardState } from '../useDashboardState';
import { formatTime, summarizeIssueMessage } from '../useDashboardState';
import { buildApiUrl } from '../../../api/client';

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

export const StatsOverview: React.FC<{ state: DashboardState; t: any }> = ({ state, t }) => {
  const { navigate, profiles, proxies, instances, support, incidents, selfTest, feedbackEntries, backups, runtimes, logs, loading, startingProfileId, startingAllReady, stoppingProfileId, stoppingAllRunning, retestingProfileId, retestingAll, runningSelfTest, submittingFeedback, creatingBackup, copyingSummary, copyingIncidentDigest, copyingActivityDigest, copyingLatestIncident, copyingTopIncidentSource, copyingTopIncidentSources, copyingTopSourceLatestIncident, copyingLatestActivity, copyingTopActivityIssues, copyingTopActivitySourceLatest, copyingTopActivitySources, onboardingOpen, feedbackForm, getFeedbackCategoryLabel, getFeedbackSentimentLabel, getOnboardingStatusLabel, getIncidentLevelLabel, getLogLevelLabel, getSelfTestStatusLabel, formatMaybeValue, formatIncidentSummary, formatActivitySummary, loadDashboard, runningProfiles, healthyProxies, availableRuntimes, profilesNeedingAttention, recentProfiles, activeProfiles, launchReadyProfiles, failingProxyIds, logHeat, topRecentIssues, incidentDigest, activityDigest, handleStartProfile, handleStopProfile, handleStartAllReadyProfiles, handleStopAllRunningProfiles, handleRetestProxy, handleRetestAllFailingProxies, handleRunSelfTest, handleExportDiagnostics, handleCopySupportSummary, handleOpenCreateProfile, handleOpenLogEntry, handleOpenActivitySource, handleOpenTopActivitySourceLatest, handleOpenIncidentInLogs, handleOpenIncidentSource, handleOpenTopIncidentSource, handleOpenLatestIncident, handleOpenTopSourceLatestIncident, handleOpenRecentLogs, handleIncidentSuggestedAction, incidentSuggestedActionLabel, handleOpenHottestIssueLogs, handleCopyHottestIssue, handleCopyIncidentDigest, handleCopyLatestIncident, handleCopyTopIncidentSource, handleCopyTopIncidentSources, handleCopyTopSourceLatestIncident, handleCopyActivityDigest, handleCopyLatestActivity, handleCopyTopActivityIssues, handleCopyTopActivitySourceLatest, handleCopyTopActivitySources, handleOpenLatestActivity, handleActivitySuggestedAction, activitySuggestedActionLabel, handleOpenActivityIssue, handleCreateBackup, handleOpenOnboarding, handleSubmitFeedback, setupChecklist, nextStep, readinessPercent, readinessStatus } = state;

  return (
    <>
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
    </>
  );
};
