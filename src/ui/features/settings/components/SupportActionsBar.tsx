import React from 'react';
import { Button, Row, Space } from 'antd';
import { CopyOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';

interface SupportActionsBarProps {
  state: Pick<
    SettingsState,
    | 't'
    | 'loadingSupport'
    | 'selfTesting'
    | 'incidentLoading'
    | 'runSelfTest'
    | 'handleCopySupportSummary'
    | 'fetchSupportStatus'
    | 'fetchIncidents'
  >;
}

export const SupportActionsBar: React.FC<SupportActionsBarProps> = ({ state }) => {
  const {
    t,
    loadingSupport,
    selfTesting,
    incidentLoading,
    runSelfTest,
    handleCopySupportSummary,
    fetchSupportStatus,
    fetchIncidents,
  } = state;

  return (
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
  );
};
