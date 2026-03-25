import React from 'react';
import { Row, Space, Button, Typography, Tag, Form, Col, Select, Input } from 'antd';
import { CopyOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';
import type { SupportFeedbackEntry, IncidentEntry } from '../../../../server/shared/types';

interface SupportTabProps {
  state: SettingsState;
}

export const SupportTab: React.FC<SupportTabProps> = ({ state }) => {
  const {
    t,
    supportStatus,
    selfTestResult,
    incidentState,
    feedbackState,
    loadingSupport,
    selfTesting,
    incidentLoading,
    feedbackLoading,
    submittingFeedback,
    feedbackForm,
    runSelfTest,
    handleSubmitFeedback,
    handleCopySupportSummary,
    fetchSupportStatus,
    fetchIncidents,
    fetchFeedback,
    
    // Helpers
    formatUptime,
    getSelfTestStatusLabel,
    getFeedbackCategoryLabel,
    getFeedbackSentimentLabel,
    getIncidentLevelLabel,
    getIncidentCategoryColor,
    getOnboardingStateLabel
  } = state;

  return (
    <div>
      <Row justify="end" className="mb-12">
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => void handleCopySupportSummary()}>
            {t.settings.copySupportSummary}
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => window.open('/api/support/diagnostics', '_blank')}>
            {t.settings.exportDiagnostics}
          </Button>
          <Button onClick={() => void fetchIncidents()} loading={incidentLoading}>
            {t.settings.refreshIncidents}
          </Button>
          <Button onClick={() => void runSelfTest()} loading={selfTesting}>
            {t.settings.runSelfTest}
          </Button>
          <Button icon={<ReloadOutlined />} loading={loadingSupport} onClick={() => void fetchSupportStatus()}>
            {t.settings.refresh}
          </Button>
        </Space>
      </Row>
      
      {supportStatus ? (
        <Space direction="vertical" size={12} className="w-full">
          <Typography.Text><strong>{t.settings.appVersionLabel}:</strong> {supportStatus.appVersion}</Typography.Text>
          <Typography.Text><strong>{t.settings.nodeVersionLabel}:</strong> {supportStatus.nodeVersion}</Typography.Text>
          <Typography.Text><strong>{t.settings.platformLabel}:</strong> {supportStatus.platform} / {supportStatus.arch}</Typography.Text>
          <Typography.Text><strong>{t.settings.uptimeLabel}:</strong> {formatUptime(supportStatus.uptimeSeconds)}</Typography.Text>
          <Typography.Text><strong>{t.settings.dataDirLabel}:</strong> {supportStatus.dataDir}</Typography.Text>
          <Typography.Text><strong>{t.settings.logFilesLabel}:</strong> {supportStatus.logFileCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingLabel}:</strong> {supportStatus.onboardingCompleted ? t.settings.statusCompleted : t.settings.statusPending}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingStateLabel}:</strong> {getOnboardingStateLabel(supportStatus.onboardingState.status)} / {t.settings.stepLabel} {supportStatus.onboardingState.currentStep}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingRuntimeLabel}:</strong> {supportStatus.onboardingState.selectedRuntime ?? t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.onboardingDraftProfileLabel}:</strong> {supportStatus.onboardingState.draftProfileName ?? t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.lastOnboardingOpenLabel}:</strong> {supportStatus.onboardingState.lastOpenedAt ? new Date(supportStatus.onboardingState.lastOpenedAt).toLocaleString() : t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.profilesLabel}:</strong> {supportStatus.profileCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.proxiesLabel}:</strong> {supportStatus.proxyCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.backupsLabel}:</strong> {supportStatus.backupCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.feedbackInboxLabel}:</strong> {supportStatus.feedbackCount}</Typography.Text>
          <Typography.Text><strong>{t.settings.lastFeedbackLabel}:</strong> {supportStatus.lastFeedbackAt ? new Date(supportStatus.lastFeedbackAt).toLocaleString() : t.settings.noneValue}</Typography.Text>
          <Typography.Text>
            <strong>{t.settings.usageLabel}:</strong> {supportStatus.usageMetrics.profileCreates} {t.settings.createdLabel} / {supportStatus.usageMetrics.profileImports} {t.settings.importedLabel} / {supportStatus.usageMetrics.profileLaunches} {t.settings.launchesLabel}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.sessionChecksLabel}:</strong> {supportStatus.usageMetrics.sessionChecks} {t.settings.totalLabel} / {supportStatus.usageMetrics.sessionCheckLoggedIn} {t.settings.loggedInLabel} / {supportStatus.usageMetrics.sessionCheckLoggedOut} {t.settings.loggedOutLabel} / {supportStatus.usageMetrics.sessionCheckErrors} {t.settings.errorsLabel}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.lastUsageLabel}:</strong>{' '}
            {supportStatus.usageMetrics.lastProfileLaunchAt
              ? `${t.settings.lastUsageLaunch} ${new Date(supportStatus.usageMetrics.lastProfileLaunchAt).toLocaleString()}`
              : supportStatus.usageMetrics.lastProfileCreatedAt
                ? `${t.settings.lastUsageCreate} ${new Date(supportStatus.usageMetrics.lastProfileCreatedAt).toLocaleString()}`
                : supportStatus.usageMetrics.lastProfileImportedAt
                  ? `${t.settings.lastUsageImport} ${new Date(supportStatus.usageMetrics.lastProfileImportedAt).toLocaleString()}`
                  : supportStatus.usageMetrics.lastSessionCheckAt
                    ? `${t.settings.lastUsageSessionCheck} ${new Date(supportStatus.usageMetrics.lastSessionCheckAt).toLocaleString()}`
                    : t.settings.noneValue}
          </Typography.Text>
          <Typography.Text><strong>{t.settings.recentIncidentsLabel}:</strong> {supportStatus.recentIncidentCount} {t.settings.totalLabel} / {supportStatus.recentErrorCount} {t.settings.errorsLabel}</Typography.Text>
          <Typography.Text><strong>{t.settings.lastIncidentLabel}:</strong> {supportStatus.lastIncidentAt ? new Date(supportStatus.lastIncidentAt).toLocaleString() : t.settings.noneValue}</Typography.Text>
          <Typography.Text><strong>{t.settings.topIncidentCategoryLabel}:</strong> {supportStatus.recentIncidentCategories[0]?.label ?? t.settings.noneValue}</Typography.Text>
          <Typography.Text>
            <strong>{t.settings.diagnosticsLabel}:</strong> {supportStatus.diagnosticsReady ? t.settings.diagnosticsReadyState : t.settings.diagnosticsMissingState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.offlineSecretLabel}:</strong> {supportStatus.offlineSecretConfigured ? t.settings.configuredState : t.settings.missingState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.codeSigningLabel}:</strong> {supportStatus.codeSigningConfigured ? t.settings.configuredState : t.settings.missingState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.supportPagesLabel}:</strong> {supportStatus.supportPagesReady ? t.settings.readyState : t.settings.missingPagesState}
          </Typography.Text>
          <Typography.Text>
            <strong>{t.settings.releaseReadinessLabel}:</strong> {supportStatus.releaseReady ? t.settings.readyState : t.settings.needsAttentionState}
          </Typography.Text>
          
          {supportStatus.warnings.length > 0 ? (
            <div>
              <Typography.Text strong className="d-block mb-4">{t.settings.warningsLabel}</Typography.Text>
              {supportStatus.warnings.map((warning) => (
                <Tag key={warning} color="warning" className="mb-8">
                  {warning}
                </Tag>
              ))}
            </div>
          ) : (
            <Tag color="success">{t.settings.operationallyReady}</Tag>
          )}

          {selfTestResult ? (
            <div className="mt-8">
              <Typography.Text strong className="d-block mb-4">
                {t.settings.selfTestLabel} ({new Date(selfTestResult.checkedAt).toLocaleString()})
              </Typography.Text>
              <Tag color={selfTestResult.status === 'pass' ? 'success' : selfTestResult.status === 'warn' ? 'warning' : 'error'}>
                {getSelfTestStatusLabel(selfTestResult.status)}
              </Tag>
              <div className="mt-8">
                {selfTestResult.checks.map((check) => (
                  <div key={check.key} className="mb-8">
                    <Tag color={check.status === 'pass' ? 'success' : check.status === 'warn' ? 'warning' : 'error'}>
                      {getSelfTestStatusLabel(check.status)}
                    </Tag>
                    <Typography.Text strong>{check.label}:</Typography.Text>{' '}
                    <Typography.Text type="secondary">{check.detail}</Typography.Text>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-8">
            <Typography.Text strong className="d-block mb-8">
              {t.settings.feedbackInbox}
            </Typography.Text>
            <Form form={feedbackForm} layout="vertical">
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="category" label={t.settings.feedbackCategoryLabel} initialValue="feedback" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { label: t.settings.feedbackCategoryFeedback, value: 'feedback' },
                        { label: t.settings.feedbackCategoryBug, value: 'bug' },
                        { label: t.settings.feedbackCategoryQuestion, value: 'question' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="sentiment" label={t.settings.feedbackSentimentLabel} initialValue="neutral" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { label: t.settings.feedbackSentimentNeutral, value: 'neutral' },
                        { label: t.settings.feedbackSentimentPositive, value: 'positive' },
                        { label: t.settings.feedbackSentimentNegative, value: 'negative' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="email" label={t.settings.feedbackEmailLabel}>
                    <Input placeholder={t.settings.feedbackEmailPlaceholder} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="message"
                label={t.settings.feedbackMessageLabel}
                rules={[{ required: true, min: 10, message: t.settings.feedbackMessageMin }]}
              >
                <Input.TextArea rows={4} placeholder={t.settings.feedbackMessagePlaceholder} />
              </Form.Item>
              <Space className="mb-12">
                <Button type="primary" loading={submittingFeedback} onClick={() => void handleSubmitFeedback()}>
                  {t.settings.saveFeedback}
                </Button>
                <Button loading={feedbackLoading} onClick={() => void fetchFeedback()}>
                  {t.settings.refreshFeedback}
                </Button>
              </Space>
            </Form>

            {feedbackState && feedbackState.entries.length > 0 ? (
              <div className="mb-12">
                {feedbackState.entries.map((entry: SupportFeedbackEntry) => (
                  <div key={entry.id} className="mb-10">
                    <Tag color={entry.category === 'bug' ? 'error' : entry.category === 'question' ? 'processing' : 'default'}>
                      {getFeedbackCategoryLabel(entry.category)}
                    </Tag>
                    <Tag color={entry.sentiment === 'negative' ? 'error' : entry.sentiment === 'positive' ? 'success' : 'default'}>
                      {getFeedbackSentimentLabel(entry.sentiment)}
                    </Tag>
                    <Typography.Text type="secondary">{new Date(entry.createdAt).toLocaleString()}</Typography.Text>
                    <div>
                      <Typography.Text>{entry.message}</Typography.Text>
                    </div>
                    <Typography.Text type="secondary">
                      {entry.email ? `${t.settings.feedbackContactPrefix}: ${entry.email}` : t.settings.feedbackNoContactEmail}{entry.appVersion ? ` | ${t.settings.feedbackAppPrefix} ${entry.appVersion}` : ''}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary" className="d-block mb-12">
                {feedbackLoading ? t.settings.loadingFeedback : t.settings.noFeedbackSaved}
              </Typography.Text>
            )}
          </div>

          <div className="mt-8">
            <Typography.Text strong className="d-block mb-4">
              {t.settings.recentIncidents}
            </Typography.Text>
            {incidentState && incidentState.incidents.length > 0 ? (
              <div>
                {incidentState.summary.categories.length > 0 ? (
                  <div className="mb-12">
                    <Typography.Text strong className="d-block mb-6">
                      {t.settings.incidentCategoriesLabel}
                    </Typography.Text>
                    {incidentState.summary.categories.map((category) => (
                      <Tag key={category.category} color={getIncidentCategoryColor(category.category)} className="mb-8">
                        {`${category.label}: ${category.count} (${category.errorCount} ${t.settings.errorsLabel})`}
                      </Tag>
                    ))}
                  </div>
                ) : null}
                {incidentState.incidents.map((incident: IncidentEntry, index: number) => (
                  <div key={`${incident.timestamp}-${incident.source}-${index}`} className="mb-10">
                    <Tag color={incident.level === 'error' ? 'error' : 'warning'}>
                      {getIncidentLevelLabel(incident.level)}
                    </Tag>
                    <Tag color={getIncidentCategoryColor(incident.category)}>
                      {incident.categoryLabel}
                    </Tag>
                    <Typography.Text strong>{incident.source}</Typography.Text>{' '}
                    <Typography.Text type="secondary">
                      {new Date(incident.timestamp).toLocaleString()}
                    </Typography.Text>
                    <div>
                      <Typography.Text>{incident.message}</Typography.Text>
                    </div>
                  </div>
                ))}
                <div className="mt-12">
                  <Typography.Text strong className="d-block mb-6">
                    {t.settings.incidentTimelineLabel}
                  </Typography.Text>
                  {incidentState.timeline.slice(0, 5).map((incident: IncidentEntry, index: number) => (
                    <div key={`${incident.fingerprint}-${incident.timestamp}-${index}`} className="mb-8">
                      <Typography.Text type="secondary">
                        {new Date(incident.timestamp).toLocaleString()}
                      </Typography.Text>{' '}
                      <Tag color={getIncidentCategoryColor(incident.category)}>{incident.categoryLabel}</Tag>
                      <Typography.Text>{incident.message}</Typography.Text>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Typography.Text type="secondary">
                {incidentLoading ? t.settings.loadingIncidents : t.settings.noRecentIncidents}
              </Typography.Text>
            )}
          </div>
        </Space>
      ) : (
        <Typography.Text type="secondary">{t.settings.supportStatusLoadFailed}</Typography.Text>
      )}
    </div>
  );
};
