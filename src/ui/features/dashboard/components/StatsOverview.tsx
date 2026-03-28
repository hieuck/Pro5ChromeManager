import React from 'react';
import { Card, Col, Progress, Row, Space, Statistic, Tag, Typography } from 'antd';
import type { TranslationKeys } from '../../../i18n';
import type { DashboardState } from '../useDashboardState';

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
};

interface StatsOverviewProps {
  state: DashboardState;
  t: TranslationKeys;
}

const readinessTagColorByStroke: Record<string, string> = {
  '#52c41a': 'green',
  '#1677ff': 'blue',
};

export const StatsOverview: React.FC<StatsOverviewProps> = ({ state, t }) => {
  const {
    loading,
    profiles,
    proxies,
    support,
    runningProfiles,
    healthyProxies,
    readinessPercent,
    readinessStatus,
    setupChecklist,
  } = state;

  const readinessTagColor = readinessTagColorByStroke[readinessStatus.strokeColor] ?? 'gold';
  const completedChecklistCount = setupChecklist.filter((item) => item.done).length;

  return (
    <>
      <Card style={cardStyle} title={t.dashboard.readinessTitle}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={10}>
            <Progress
              type="circle"
              percent={readinessPercent}
              strokeColor={readinessStatus.strokeColor}
              format={(percent) => `${percent ?? 0}%`}
            />
          </Col>
          <Col xs={24} md={14}>
            <Space direction="vertical" size={8}>
              <Tag color={readinessTagColor}>
                {readinessStatus.label}
              </Tag>
              <Typography.Text type="secondary">
                {`${t.dashboard.readinessChecklist}: ${completedChecklistCount}/${setupChecklist.length}`}
              </Typography.Text>
              <Typography.Text type="secondary">
                {`${t.dashboard.readinessDiagnostics}: ${support?.diagnosticsReady ? t.dashboard.checkDone : t.dashboard.checkPending}`}
              </Typography.Text>
              <Typography.Text type="secondary">
                {`${t.dashboard.opsWarnings}: ${support?.warnings.length ?? 0}`}
              </Typography.Text>
              <Typography.Text type="secondary">
                {`${t.dashboard.healthyProxies}: ${healthyProxies}/${support?.proxyCount ?? proxies.length}`}
              </Typography.Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card style={cardStyle} loading={loading}>
            <Statistic title={t.dashboard.totalProfiles} value={support?.profileCount ?? profiles.length} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card style={cardStyle} loading={loading}>
            <Statistic title={t.dashboard.runningProfiles} value={runningProfiles} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card style={cardStyle} loading={loading}>
            <Statistic title={t.dashboard.healthyProxies} value={healthyProxies} suffix={`/ ${support?.proxyCount ?? proxies.length}`} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card style={cardStyle} loading={loading}>
            <Statistic title={t.dashboard.incidents} value={support?.recentIncidentCount ?? 0} suffix={`${support?.recentErrorCount ?? 0} err`} />
          </Card>
        </Col>
      </Row>
    </>
  );
};
