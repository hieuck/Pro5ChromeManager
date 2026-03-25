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

export const ProfileQuickActions: React.FC<{ state: DashboardState; t: any }> = ({ state, t }) => {
  const { navigate, profiles, proxies, instances, support, incidents, selfTest, feedbackEntries, backups, runtimes, logs, loading, startingProfileId, startingAllReady, stoppingProfileId, stoppingAllRunning, retestingProfileId, retestingAll, runningSelfTest, submittingFeedback, creatingBackup, copyingSummary, copyingIncidentDigest, copyingActivityDigest, copyingLatestIncident, copyingTopIncidentSource, copyingTopIncidentSources, copyingTopSourceLatestIncident, copyingLatestActivity, copyingTopActivityIssues, copyingTopActivitySourceLatest, copyingTopActivitySources, onboardingOpen, feedbackForm, getFeedbackCategoryLabel, getFeedbackSentimentLabel, getOnboardingStatusLabel, getIncidentLevelLabel, getLogLevelLabel, getSelfTestStatusLabel, formatMaybeValue, formatIncidentSummary, formatActivitySummary, loadDashboard, runningProfiles, healthyProxies, availableRuntimes, profilesNeedingAttention, recentProfiles, activeProfiles, launchReadyProfiles, failingProxyIds, logHeat, topRecentIssues, incidentDigest, activityDigest, handleStartProfile, handleStopProfile, handleStartAllReadyProfiles, handleStopAllRunningProfiles, handleRetestProxy, handleRetestAllFailingProxies, handleRunSelfTest, handleExportDiagnostics, handleCopySupportSummary, handleOpenCreateProfile, handleOpenLogEntry, handleOpenActivitySource, handleOpenTopActivitySourceLatest, handleOpenIncidentInLogs, handleOpenIncidentSource, handleOpenTopIncidentSource, handleOpenLatestIncident, handleOpenTopSourceLatestIncident, handleOpenRecentLogs, handleIncidentSuggestedAction, incidentSuggestedActionLabel, handleOpenHottestIssueLogs, handleCopyHottestIssue, handleCopyIncidentDigest, handleCopyLatestIncident, handleCopyTopIncidentSource, handleCopyTopIncidentSources, handleCopyTopSourceLatestIncident, handleCopyActivityDigest, handleCopyLatestActivity, handleCopyTopActivityIssues, handleCopyTopActivitySourceLatest, handleCopyTopActivitySources, handleOpenLatestActivity, handleActivitySuggestedAction, activitySuggestedActionLabel, handleOpenActivityIssue, handleCreateBackup, handleOpenOnboarding, handleSubmitFeedback, setupChecklist, nextStep, readinessPercent, readinessStatus } = state;

  return (
    <>
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
    </>
  );
};
