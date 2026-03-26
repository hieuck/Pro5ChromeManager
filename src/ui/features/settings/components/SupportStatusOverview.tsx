import React from 'react';
import { Space, Tag, Typography } from 'antd';
import type { SettingsState } from '../useSettingsState';
import { buildSupportOverviewPresentation } from '../settingsSupport.utils';

interface SupportStatusOverviewProps {
  state: Pick<
    SettingsState,
    | 't'
    | 'supportStatus'
    | 'formatUptime'
  >;
}

const SupportStatusRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Typography.Text>
    <strong>{label}:</strong> {value}
  </Typography.Text>
);

export const SupportStatusOverview: React.FC<SupportStatusOverviewProps> = ({ state }) => {
  const { t, supportStatus, formatUptime } = state;

  if (!supportStatus) {
    return null;
  }

  const presentation = buildSupportOverviewPresentation({
    t,
    supportStatus,
  });

  return (
    <>
      {presentation.rows.map((row) => (
        <SupportStatusRow key={row.key} label={row.label} value={row.key === 'uptime' ? formatUptime(supportStatus.uptimeSeconds) : row.value} />
      ))}

      {presentation.warnings.length > 0 ? (
        <div>
          <Typography.Text strong className="d-block mb-4">{t.settings.warningsLabel}</Typography.Text>
          <Space wrap>
            {presentation.warnings.map((warning) => (
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
