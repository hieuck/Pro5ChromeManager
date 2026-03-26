import React from 'react';
import { Space, Tag, Typography } from 'antd';
import type { SettingsState } from '../useSettingsState';

interface SupportStatusOverviewProps {
  state: Pick<
    SettingsState,
    | 't'
    | 'supportStatus'
    | 'formatUptime'
    | 'getOnboardingStateLabel'
  >;
}

const SupportStatusRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Typography.Text>
    <strong>{label}:</strong> {value}
  </Typography.Text>
);

export const SupportStatusOverview: React.FC<SupportStatusOverviewProps> = ({ state }) => {
  const { t, supportStatus, formatUptime, getOnboardingStateLabel } = state;

  if (!supportStatus) {
    return null;
  }

  const lastUsageLabel = supportStatus.usageMetrics.lastProfileLaunchAt
    ? `${t.settings.lastUsageLaunch} ${new Date(supportStatus.usageMetrics.lastProfileLaunchAt).toLocaleString()}`
    : supportStatus.usageMetrics.lastProfileCreatedAt
      ? `${t.settings.lastUsageCreate} ${new Date(supportStatus.usageMetrics.lastProfileCreatedAt).toLocaleString()}`
      : supportStatus.usageMetrics.lastProfileImportedAt
        ? `${t.settings.lastUsageImport} ${new Date(supportStatus.usageMetrics.lastProfileImportedAt).toLocaleString()}`
        : supportStatus.usageMetrics.lastSessionCheckAt
          ? `${t.settings.lastUsageSessionCheck} ${new Date(supportStatus.usageMetrics.lastSessionCheckAt).toLocaleString()}`
          : t.settings.noneValue;

  return (
    <>
      <SupportStatusRow label={t.settings.appVersionLabel} value={supportStatus.appVersion} />
      <SupportStatusRow label={t.settings.nodeVersionLabel} value={supportStatus.nodeVersion} />
      <SupportStatusRow label={t.settings.platformLabel} value={`${supportStatus.platform} / ${supportStatus.arch}`} />
      <SupportStatusRow label={t.settings.uptimeLabel} value={formatUptime(supportStatus.uptimeSeconds)} />
      <SupportStatusRow label={t.settings.dataDirLabel} value={supportStatus.dataDir} />
      <SupportStatusRow label={t.settings.logFilesLabel} value={supportStatus.logFileCount} />
      <SupportStatusRow label={t.settings.onboardingLabel} value={supportStatus.onboardingCompleted ? t.settings.statusCompleted : t.settings.statusPending} />
      <SupportStatusRow
        label={t.settings.onboardingStateLabel}
        value={`${getOnboardingStateLabel(supportStatus.onboardingState.status)} / ${t.settings.stepLabel} ${supportStatus.onboardingState.currentStep}`}
      />
      <SupportStatusRow label={t.settings.onboardingRuntimeLabel} value={supportStatus.onboardingState.selectedRuntime ?? t.settings.noneValue} />
      <SupportStatusRow label={t.settings.onboardingDraftProfileLabel} value={supportStatus.onboardingState.draftProfileName ?? t.settings.noneValue} />
      <SupportStatusRow
        label={t.settings.lastOnboardingOpenLabel}
        value={supportStatus.onboardingState.lastOpenedAt ? new Date(supportStatus.onboardingState.lastOpenedAt).toLocaleString() : t.settings.noneValue}
      />
      <SupportStatusRow label={t.settings.profilesLabel} value={supportStatus.profileCount} />
      <SupportStatusRow label={t.settings.proxiesLabel} value={supportStatus.proxyCount} />
      <SupportStatusRow label={t.settings.backupsLabel} value={supportStatus.backupCount} />
      <SupportStatusRow label={t.settings.feedbackInboxLabel} value={supportStatus.feedbackCount} />
      <SupportStatusRow
        label={t.settings.lastFeedbackLabel}
        value={supportStatus.lastFeedbackAt ? new Date(supportStatus.lastFeedbackAt).toLocaleString() : t.settings.noneValue}
      />
      <SupportStatusRow
        label={t.settings.usageLabel}
        value={`${supportStatus.usageMetrics.profileCreates} ${t.settings.createdLabel} / ${supportStatus.usageMetrics.profileImports} ${t.settings.importedLabel} / ${supportStatus.usageMetrics.profileLaunches} ${t.settings.launchesLabel}`}
      />
      <SupportStatusRow
        label={t.settings.sessionChecksLabel}
        value={`${supportStatus.usageMetrics.sessionChecks} ${t.settings.totalLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedIn} ${t.settings.loggedInLabel} / ${supportStatus.usageMetrics.sessionCheckLoggedOut} ${t.settings.loggedOutLabel} / ${supportStatus.usageMetrics.sessionCheckErrors} ${t.settings.errorsLabel}`}
      />
      <SupportStatusRow label={t.settings.lastUsageLabel} value={lastUsageLabel} />
      <SupportStatusRow
        label={t.settings.recentIncidentsLabel}
        value={`${supportStatus.recentIncidentCount} ${t.settings.totalLabel} / ${supportStatus.recentErrorCount} ${t.settings.errorsLabel}`}
      />
      <SupportStatusRow
        label={t.settings.lastIncidentLabel}
        value={supportStatus.lastIncidentAt ? new Date(supportStatus.lastIncidentAt).toLocaleString() : t.settings.noneValue}
      />
      <SupportStatusRow label={t.settings.topIncidentCategoryLabel} value={supportStatus.recentIncidentCategories[0]?.label ?? t.settings.noneValue} />
      <SupportStatusRow
        label={t.settings.diagnosticsLabel}
        value={supportStatus.diagnosticsReady ? t.settings.diagnosticsReadyState : t.settings.diagnosticsMissingState}
      />
      <SupportStatusRow
        label={t.settings.offlineSecretLabel}
        value={supportStatus.offlineSecretConfigured ? t.settings.configuredState : t.settings.missingState}
      />
      <SupportStatusRow
        label={t.settings.codeSigningLabel}
        value={supportStatus.codeSigningConfigured ? t.settings.configuredState : t.settings.missingState}
      />
      <SupportStatusRow
        label={t.settings.supportPagesLabel}
        value={supportStatus.supportPagesReady ? t.settings.readyState : t.settings.missingPagesState}
      />
      <SupportStatusRow
        label={t.settings.releaseReadinessLabel}
        value={supportStatus.releaseReady ? t.settings.readyState : t.settings.needsAttentionState}
      />

      {supportStatus.warnings.length > 0 ? (
        <div>
          <Typography.Text strong className="d-block mb-4">{t.settings.warningsLabel}</Typography.Text>
          <Space wrap>
            {supportStatus.warnings.map((warning) => (
              <Tag key={warning} color="warning" className="mb-8">
                {warning}
              </Tag>
            ))}
          </Space>
        </div>
      ) : (
        <Tag color="success">{t.settings.operationallyReady}</Tag>
      )}
    </>
  );
};
