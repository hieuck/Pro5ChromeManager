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
import { RenderBoundary } from '../../components/RenderBoundary';

const LogsPage: React.FC = () => {
  const state = useLogsState();

  return (
    <div className="p-24">
      <Space direction="vertical" size={20} className="w-full">
        <Card>
          <Space direction="vertical" size={12} className="w-full">
            <RenderBoundary title={state.t.logs.title}>
              <LogHeader state={state} />
            </RenderBoundary>
            <RenderBoundary title="Log filters">
              <LogFilters state={state} />
            </RenderBoundary>
          </Space>
        </Card>

        <RenderBoundary title="Log stats">
          <LogStatsRow state={state} />
        </RenderBoundary>

        <RenderBoundary title="Log alerts">
          <LogAlerts state={state} />
        </RenderBoundary>

        <RenderBoundary title="Log sources">
          <LogSourcePanel state={state} />
        </RenderBoundary>

        <RenderBoundary title="Log issues">
          <LogIssuesPanel state={state} />
        </RenderBoundary>

        <RenderBoundary title="Log table">
          <LogTable state={state} />
        </RenderBoundary>
      </Space>
    </div>
  );
};

export default LogsPage;
