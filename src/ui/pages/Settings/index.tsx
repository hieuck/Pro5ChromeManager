import React from 'react';
import { Tabs, Typography } from 'antd';
import { useSettingsState } from './useSettingsState';
import { GeneralTab } from './components/GeneralTab';
import { RuntimesTab } from './components/RuntimesTab';
import { BrowserCoresTab } from './components/BrowserCoresTab';
import { BackupTab } from './components/BackupTab';
import { LogsTab } from './components/LogsTab';
import { SupportTab } from './components/SupportTab';

const SettingsIndex: React.FC = () => {
  const state = useSettingsState();
  const { t } = state;

  const tabItems = [
    { key: 'general', label: t.settings.general, children: <GeneralTab state={state} /> },
    { key: 'runtimes', label: t.settings.runtimes, children: <RuntimesTab state={state} /> },
    { key: 'browser-cores', label: 'Browser Cores', children: <BrowserCoresTab state={state} /> },
    { key: 'backup', label: t.settings.backup, children: <BackupTab state={state} /> },
    { key: 'logs', label: t.settings.logs, children: <LogsTab state={state} /> },
    { key: 'support', label: t.settings.support, children: <SupportTab state={state} /> },
  ];

  return (
    <div className="p-24">
      <Typography.Title level={3} className="mb-24">{t.settings.title}</Typography.Title>
      <Tabs items={tabItems} />
    </div>
  );
};

export default SettingsIndex;
