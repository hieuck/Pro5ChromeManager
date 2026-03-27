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

export const ActivityDigest: React.FC<{ state: DashboardState; t: any }> = ({ state, t }) => {
  const showDebugSurface = import.meta.env.DEV;
  const { navigate, profiles, proxies, instances, support, incidents, selfTest, feedbackEntries, backups, runtimes, logs, loading, startingProfileId, startingAllReady, stoppingProfileId, stoppingAllRunning, retestingProfileId, retestingAll, runningSelfTest, submittingFeedback, creatingBackup, copyingSummary, copyingIncidentDigest, copyingActivityDigest, copyingLatestIncident, copyingTopIncidentSource, copyingTopIncidentSources, copyingTopSourceLatestIncident, copyingLatestActivity, copyingTopActivityIssues, copyingTopActivitySourceLatest, copyingTopActivitySources, onboardingOpen, feedbackForm, getFeedbackCategoryLabel, getFeedbackSentimentLabel, getOnboardingStatusLabel, getIncidentLevelLabel, getLogLevelLabel, getSelfTestStatusLabel, formatMaybeValue, formatIncidentSummary, formatActivitySummary, loadDashboard, runningProfiles, healthyProxies, availableRuntimes, profilesNeedingAttention, recentProfiles, activeProfiles, launchReadyProfiles, failingProxyIds, logHeat, topRecentIssues, hottestRecentIssue, incidentDigest, activityDigest, handleStartProfile, handleStopProfile, handleStartAllReadyProfiles, handleStopAllRunningProfiles, handleRetestProxy, handleRetestAllFailingProxies, handleRunSelfTest, handleExportDiagnostics, handleCopySupportSummary, handleOpenCreateProfile, handleOpenLogEntry, handleOpenActivitySource, handleOpenTopActivitySourceLatest, handleOpenIncidentInLogs, handleOpenIncidentSource, handleOpenTopIncidentSource, handleOpenLatestIncident, handleOpenTopSourceLatestIncident, handleOpenRecentLogs, handleIncidentSuggestedAction, incidentSuggestedActionLabel, handleOpenHottestIssueLogs, handleCopyHottestIssue, handleCopyIncidentDigest, handleCopyLatestIncident, handleCopyTopIncidentSource, handleCopyTopIncidentSources, handleCopyTopSourceLatestIncident, handleCopyActivityDigest, handleCopyLatestActivity, handleCopyTopActivityIssues, handleCopyTopActivitySourceLatest, handleCopyTopActivitySources, handleOpenLatestActivity, handleActivitySuggestedAction, activitySuggestedActionLabel, handleOpenActivityIssue, handleCreateBackup, handleOpenOnboarding, handleSubmitFeedback, setupChecklist, nextStep, readinessPercent, readinessStatus } = state;

  return (
    <>
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
                    {showDebugSurface ? (
                      <Tag color="cyan">{`${t.dashboard.debugCountLabel}: ${activityDigest.debugs}`}</Tag>
                    ) : null}
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
    </>
  );
};
