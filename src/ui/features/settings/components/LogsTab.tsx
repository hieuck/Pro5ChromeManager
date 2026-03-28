import React from 'react';
import { Row, Button, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';

interface LogsTabProps {
  state: SettingsState;
}

export const LogsTab: React.FC<LogsTabProps> = ({ state }) => {
  const { t, logLines, loadingLogs, fetchLogs } = state;

  return (
    <div>
      <Row justify="end" className="mb-8">
        <Button icon={<ReloadOutlined />} loading={loadingLogs} onClick={() => void fetchLogs()}>
          {t.settings.refresh}
        </Button>
      </Row>
      <div className="terminal-box">
        {logLines.length === 0
          ? <Typography.Text type="secondary">{t.settings.logsEmpty}</Typography.Text>
          : logLines.map((line, index) => <div key={index}>{line}</div>)}
      </div>
    </div>
  );
};
