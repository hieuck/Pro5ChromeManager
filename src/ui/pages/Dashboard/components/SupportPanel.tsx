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

export const SupportPanel: React.FC<{ state: DashboardState; t: any }> = ({ state, t }) => {
  const { navigate, profiles, proxies, instances, support, incidents, selfTest, feedbackEntries, backups, runtimes, logs, loading, startingProfileId, startingAllReady, stoppingProfileId, stoppingAllRunning, retestingProfileId, retestingAll, runningSelfTest, submittingFeedback, creatingBackup, copyingSummary, copyingIncidentDigest, copyingActivityDigest, copyingLatestIncident, copyingTopIncidentSource, copyingTopIncidentSources, copyingTopSourceLatestIncident, copyingLatestActivity, copyingTopActivityIssues, copyingTopActivitySourceLatest, copyingTopActivitySources, onboardingOpen, feedbackForm, getFeedbackCategoryLabel, getFeedbackSentimentLabel, getOnboardingStatusLabel, getIncidentLevelLabel, getLogLevelLabel, getSelfTestStatusLabel, formatMaybeValue, formatIncidentSummary, formatActivitySummary, loadDashboard, runningProfiles, healthyProxies, availableRuntimes, profilesNeedingAttention, recentProfiles, activeProfiles, launchReadyProfiles, failingProxyIds, logHeat, topRecentIssues, incidentDigest, activityDigest, handleStartProfile, handleStopProfile, handleStartAllReadyProfiles, handleStopAllRunningProfiles, handleRetestProxy, handleRetestAllFailingProxies, handleRunSelfTest, handleExportDiagnostics, handleCopySupportSummary, handleOpenCreateProfile, handleOpenLogEntry, handleOpenActivitySource, handleOpenTopActivitySourceLatest, handleOpenIncidentInLogs, handleOpenIncidentSource, handleOpenTopIncidentSource, handleOpenLatestIncident, handleOpenTopSourceLatestIncident, handleOpenRecentLogs, handleIncidentSuggestedAction, incidentSuggestedActionLabel, handleOpenHottestIssueLogs, handleCopyHottestIssue, handleCopyIncidentDigest, handleCopyLatestIncident, handleCopyTopIncidentSource, handleCopyTopIncidentSources, handleCopyTopSourceLatestIncident, handleCopyActivityDigest, handleCopyLatestActivity, handleCopyTopActivityIssues, handleCopyTopActivitySourceLatest, handleCopyTopActivitySources, handleOpenLatestActivity, handleActivitySuggestedAction, activitySuggestedActionLabel, handleOpenActivityIssue, handleCreateBackup, handleOpenOnboarding, handleSubmitFeedback, setupChecklist, nextStep, readinessPercent, readinessStatus } = state;

  return (
    <>
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
                  {getSelfTestStatusLabel(selfTest.status)}
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
                            {getSelfTestStatusLabel(check.status)}
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
                      onClick={() => window.open(buildApiUrl(`/api/backups/export/${encodeURIComponent(backup.filename)}`), '_blank')}
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
                          { label: t.settings.feedbackCategoryFeedback, value: 'feedback' },
                          { label: t.settings.feedbackCategoryBug, value: 'bug' },
                          { label: t.settings.feedbackCategoryQuestion, value: 'question' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="sentiment" label={t.dashboard.feedbackSentiment} initialValue="neutral" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: t.settings.feedbackSentimentNeutral, value: 'neutral' },
                          { label: t.settings.feedbackSentimentPositive, value: 'positive' },
                          { label: t.settings.feedbackSentimentNegative, value: 'negative' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="message" label={t.dashboard.feedbackMessage} rules={[{ required: true, min: 10 }]}>
                  <Input.TextArea rows={4} placeholder={t.dashboard.feedbackPlaceholder} />
                </Form.Item>
                <Form.Item name="email" label={t.dashboard.feedbackEmail} rules={[{ type: 'email' }]}>
                  <Input placeholder={t.settings.feedbackEmailPlaceholder} />
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
                            <Tag>{getFeedbackCategoryLabel(entry.category)}</Tag>
                            <Tag color={entry.sentiment === 'negative' ? 'red' : entry.sentiment === 'positive' ? 'green' : 'default'}>
                              {getFeedbackSentimentLabel(entry.sentiment)}
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
              {`${t.dashboard.onboardingStatus}: ${getOnboardingStatusLabel(support?.onboardingState.status)}`}
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
    </>
  );
};
