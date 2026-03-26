import React from 'react';
import { Tag, Typography } from 'antd';
import type { SettingsState } from '../useSettingsState';

interface SupportSelfTestPanelProps {
  state: Pick<SettingsState, 't' | 'selfTestResult' | 'getSelfTestStatusLabel'>;
}

function getStatusColor(status: 'pass' | 'warn' | 'fail'): 'success' | 'warning' | 'error' {
  if (status === 'pass') return 'success';
  if (status === 'warn') return 'warning';
  return 'error';
}

export const SupportSelfTestPanel: React.FC<SupportSelfTestPanelProps> = ({ state }) => {
  const { t, selfTestResult, getSelfTestStatusLabel } = state;

  if (!selfTestResult) {
    return null;
  }

  return (
    <div className="mt-8">
      <Typography.Text strong className="d-block mb-4">
        {t.settings.selfTestLabel} ({new Date(selfTestResult.checkedAt).toLocaleString()})
      </Typography.Text>
      <Tag color={getStatusColor(selfTestResult.status)}>
        {getSelfTestStatusLabel(selfTestResult.status)}
      </Tag>
      <div className="mt-8">
        {selfTestResult.checks.map((check) => (
          <div key={check.key} className="mb-8">
            <Tag color={getStatusColor(check.status)}>
              {getSelfTestStatusLabel(check.status)}
            </Tag>
            <Typography.Text strong>{check.label}:</Typography.Text>{' '}
            <Typography.Text type="secondary">{check.detail}</Typography.Text>
          </div>
        ))}
      </div>
    </div>
  );
};
