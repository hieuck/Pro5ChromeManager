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

export const IncidentDigest: React.FC<{ state: DashboardState; t: any }> = ({ state, t }) => {
  const { navigate, profiles, proxies, instances, support, incidents, selfTest, feedbackEntries, backups, runtimes, logs, loading, startingProfileId, startingAllReady, stoppingProfileId, stoppingAllRunning, retestingProfileId, retestingAll, runningSelfTest, submittingFeedback, creatingBackup, copyingSummary, copyingIncidentDigest, copyingActivityDigest, copyingLatestIncident, copyingTopIncidentSource, copyingTopIncidentSources, copyingTopSourceLatestIncident, copyingLatestActivity, copyingTopActivityIssues, copyingTopActivitySourceLatest, copyingTopActivitySources, onboardingOpen, feedbackForm, getFeedbackCategoryLabel, getFeedbackSentimentLabel, getOnboardingStatusLabel, getIncidentLevelLabel, getLogLevelLabel, getSelfTestStatusLabel, formatMaybeValue, formatIncidentSummary, formatActivitySummary, loadDashboard, runningProfiles, healthyProxies, availableRuntimes, profilesNeedingAttention, recentProfiles, activeProfiles, launchReadyProfiles, failingProxyIds, logHeat, topRecentIssues, incidentDigest, activityDigest, handleStartProfile, handleStopProfile, handleStartAllReadyProfiles, handleStopAllRunningProfiles, handleRetestProxy, handleRetestAllFailingProxies, handleRunSelfTest, handleExportDiagnostics, handleCopySupportSummary, handleOpenCreateProfile, handleOpenLogEntry, handleOpenActivitySource, handleOpenTopActivitySourceLatest, handleOpenIncidentInLogs, handleOpenIncidentSource, handleOpenTopIncidentSource, handleOpenLatestIncident, handleOpenTopSourceLatestIncident, handleOpenRecentLogs, handleIncidentSuggestedAction, incidentSuggestedActionLabel, handleOpenHottestIssueLogs, handleCopyHottestIssue, handleCopyIncidentDigest, handleCopyLatestIncident, handleCopyTopIncidentSource, handleCopyTopIncidentSources, handleCopyTopSourceLatestIncident, handleCopyActivityDigest, handleCopyLatestActivity, handleCopyTopActivityIssues, handleCopyTopActivitySourceLatest, handleCopyTopActivitySources, handleOpenLatestActivity, handleActivitySuggestedAction, activitySuggestedActionLabel, handleOpenActivityIssue, handleCreateBackup, handleOpenOnboarding, handleSubmitFeedback, setupChecklist, nextStep, readinessPercent, readinessStatus } = state;

  return (
    <>
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
    </>
  );
};
