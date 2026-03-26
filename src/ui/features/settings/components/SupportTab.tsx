import React from 'react';
import { Space, Typography } from 'antd';
import type { SettingsState } from '../useSettingsState';
import { SupportActionsBar } from './SupportActionsBar';
import { SupportFeedbackPanel } from './SupportFeedbackPanel';
import { SupportIncidentsPanel } from './SupportIncidentsPanel';
import { SupportSelfTestPanel } from './SupportSelfTestPanel';
import { SupportStatusOverview } from './SupportStatusOverview';

interface SupportTabProps {
  state: SettingsState;
}

export const SupportTab: React.FC<SupportTabProps> = ({ state }) => {
  const { t, supportStatus } = state;

  return (
    <div>
      <SupportActionsBar state={state} />
      
      {supportStatus ? (
        <Space direction="vertical" size={12} className="w-full">
          <SupportStatusOverview state={state} />
          <SupportSelfTestPanel state={state} />
          <SupportFeedbackPanel state={state} />
          <SupportIncidentsPanel state={state} />
        </Space>
      ) : (
        <Typography.Text type="secondary">{t.settings.supportStatusLoadFailed}</Typography.Text>
      )}
    </div>
  );
};
