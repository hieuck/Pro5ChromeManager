import React from 'react';
import { Typography, Space, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { type LogsState } from '../useLogsState';

export const LogHeader: React.FC<{ state: LogsState }> = ({ state }) => {
  const { t } = state;
  const navigate = useNavigate();

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>{t.logs.title}</Typography.Title>
      <Typography.Text type="secondary">{t.logs.subtitle}</Typography.Text>
      <Space wrap>
        <Button onClick={() => navigate('/dashboard')}>
          {t.logs.openDashboard}
        </Button>
      </Space>
    </Space>
  );
};
