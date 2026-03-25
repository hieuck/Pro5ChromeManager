import React from 'react';
import { Card, Space } from 'antd';
import { useLogsState } from './useLogsState';
import { LogHeader } from './components/LogHeader';
import { LogFilters } from './components/LogFilters';
import { LogStatsRow } from './components/LogStatsRow';
import { LogAlerts } from './components/LogAlerts';
import { LogSourcePanel } from './components/LogSourcePanel';
import { LogIssuesPanel } from './components/LogIssuesPanel';
import { LogTable } from './components/LogTable';

const LogsPage: React.FC = () => {
  const state = useLogsState();

  return (
    <div className="p-24">
      <Space direction="vertical" size={20} className="w-full">
        <Card>
          <Space direction="vertical" size={12} className="w-full">
            <LogHeader state={state} />
            <LogFilters state={state} />
          </Space>
        </Card>

        <LogStatsRow state={state} />
        
        <LogAlerts state={state} />
        
        <LogSourcePanel state={state} />
        
        <LogIssuesPanel state={state} />
        
        <LogTable state={state} />
      </Space>
    </div>
  );
};

export default LogsPage;
