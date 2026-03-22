import React from 'react';
import { Typography } from 'antd';
import { useTranslation } from '../hooks/useTranslation';

const Logs: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={3}>{t.logs.title}</Typography.Title>
      <Typography.Text type="secondary">{t.logs.noLogs}</Typography.Text>
    </div>
  );
};

export default Logs;
