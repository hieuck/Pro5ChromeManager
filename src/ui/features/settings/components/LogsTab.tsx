import React from 'react';
import { Row, Button, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';

interface LogsTabProps {
  state: SettingsState;
}

export const LogsTab: React.FC<LogsTabProps> = ({ state }) => {
  const { logLines, loadingLogs, fetchLogs } = state;

  return (
    <div>
      <Row justify="end" className="mb-8">
        <Button icon={<ReloadOutlined />} loading={loadingLogs} onClick={() => void fetchLogs()}>
          Làm mới
        </Button>
      </Row>
      <div className="terminal-box">
        {logLines.length === 0
          ? <Typography.Text type="secondary">Không có log</Typography.Text>
          : logLines.map((line, i) => <div key={i}>{line}</div>)
        }
      </div>
    </div>
  );
};
