import React from 'react';
import { Tag, Typography } from 'antd';
import type { SettingsState } from '../useSettingsState';

interface SupportIncidentsPanelProps {
  state: Pick<
    SettingsState,
    | 't'
    | 'incidentState'
    | 'incidentLoading'
    | 'getIncidentLevelLabel'
    | 'getIncidentCategoryColor'
  >;
}

export const SupportIncidentsPanel: React.FC<SupportIncidentsPanelProps> = ({ state }) => {
  const { t, incidentState, incidentLoading, getIncidentLevelLabel, getIncidentCategoryColor } = state;

  return (
    <div className="mt-8">
      <Typography.Text strong className="d-block mb-4">
        {t.settings.recentIncidents}
      </Typography.Text>
      {incidentState && incidentState.incidents.length > 0 ? (
        <div>
          {incidentState.summary.categories.length > 0 ? (
            <div className="mb-12">
              <Typography.Text strong className="d-block mb-6">
                {t.settings.incidentCategoriesLabel}
              </Typography.Text>
              {incidentState.summary.categories.map((category) => (
                <Tag key={category.category} color={getIncidentCategoryColor(category.category)} className="mb-8">
                  {`${category.label}: ${category.count} (${category.errorCount} ${t.settings.errorsLabel})`}
                </Tag>
              ))}
            </div>
          ) : null}
          {incidentState.incidents.map((incident, index) => (
            <div key={`${incident.timestamp}-${incident.source}-${index}`} className="mb-10">
              <Tag color={incident.level === 'error' ? 'error' : 'warning'}>
                {getIncidentLevelLabel(incident.level)}
              </Tag>
              <Tag color={getIncidentCategoryColor(incident.category)}>
                {incident.categoryLabel}
              </Tag>
              <Typography.Text strong>{incident.source}</Typography.Text>{' '}
              <Typography.Text type="secondary">
                {new Date(incident.timestamp).toLocaleString()}
              </Typography.Text>
              <div>
                <Typography.Text>{incident.message}</Typography.Text>
              </div>
            </div>
          ))}
          <div className="mt-12">
            <Typography.Text strong className="d-block mb-6">
              {t.settings.incidentTimelineLabel}
            </Typography.Text>
            {incidentState.timeline.slice(0, 5).map((incident, index) => (
              <div key={`${incident.fingerprint}-${incident.timestamp}-${index}`} className="mb-8">
                <Typography.Text type="secondary">
                  {new Date(incident.timestamp).toLocaleString()}
                </Typography.Text>{' '}
                <Tag color={getIncidentCategoryColor(incident.category)}>{incident.categoryLabel}</Tag>
                <Typography.Text>{incident.message}</Typography.Text>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Typography.Text type="secondary">
          {incidentLoading ? t.settings.loadingIncidents : t.settings.noRecentIncidents}
        </Typography.Text>
      )}
    </div>
  );
};
