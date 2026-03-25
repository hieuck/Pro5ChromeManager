import React from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { type LogsState } from '../useLogsState';

export const LogStatsRow: React.FC<{ state: LogsState }> = ({ state }) => {
  const { t, counts, setFilter } = state;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={6}>
        <Card hoverable onClick={() => setFilter('debug')}>
          <Statistic title="Debug" value={counts.debug} />
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card hoverable onClick={() => setFilter('info')}>
          <Statistic title={t.logs.filterInfo} value={counts.info} />
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card hoverable onClick={() => setFilter('warn')}>
          <Statistic title={t.logs.filterWarn} value={counts.warn} />
        </Card>
      </Col>
      <Col xs={24} md={6}>
        <Card hoverable onClick={() => setFilter('error')}>
          <Statistic title={t.logs.filterError} value={counts.error} />
        </Card>
      </Col>
    </Row>
  );
};
