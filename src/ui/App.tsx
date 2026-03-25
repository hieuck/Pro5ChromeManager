import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Typography, notification } from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  FileTextOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from './hooks/useTranslation';
import { languageMeta, supportedLanguages } from './i18n';
import ProfileList from './pages/ProfileList';
import Proxies from './pages/Proxies';
import Extensions from './pages/Extensions';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Dashboard from './pages/Dashboard';
import './App.css';

const { Sider, Header, Content } = Layout;

declare global {
  interface Window {
    __pro5__?: {
      version: string;
      installUpdate: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

const App: React.FC = () => {
  const { t, lang, format } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = location.pathname.startsWith('/settings')
    ? 'settings'
    : location.pathname.startsWith('/proxies')
      ? 'proxies'
    : location.pathname.startsWith('/extensions')
      ? 'extensions'
    : location.pathname.startsWith('/logs')
      ? 'logs'
    : location.pathname.startsWith('/dashboard')
      ? 'dashboard'
      : 'profiles';

  useEffect(() => {
    function onUpdateReady(event: Event): void {
      const version = (event as CustomEvent<{ version: string }>).detail.version;
      notification.info({
        message: format(t.common.updateReadyTitle, { version }),
        description: t.common.updateReadyDescription,
        duration: 0,
        btn: (
          <Button
            type="primary"
            size="small"
            onClick={() => { void window.__pro5__?.installUpdate(); }}
          >
            {t.common.updateNow}
          </Button>
        ),
      });
    }

    window.addEventListener('pro5:update-ready', onUpdateReady);
    return () => window.removeEventListener('pro5:update-ready', onUpdateReady);
  }, [format, t.common.updateNow, t.common.updateReadyDescription, t.common.updateReadyTitle]);

  function toggleLanguage(): void {
    const currentIndex = supportedLanguages.indexOf(lang);
    const next = supportedLanguages[(currentIndex + 1) % supportedLanguages.length];
    localStorage.setItem('uiLanguage', next);
    window.location.reload();
  }

  return (
    <Layout className="layout-min-h-100">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={200}
      >
        <div className={`sidebar-header ${collapsed ? 'sidebar-header-collapsed' : 'sidebar-header-expanded'}`}>
          {collapsed ? 'P5' : 'Pro5 Chrome'}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(`/${key}`)}
          items={[
            { key: 'dashboard', icon: <DashboardOutlined />, label: t.nav.dashboard },
            { key: 'profiles', icon: <UserOutlined />, label: t.nav.profiles },
            { key: 'proxies', icon: <ApiOutlined />, label: t.nav.proxies },
            { key: 'extensions', icon: <AppstoreOutlined />, label: t.nav.extensions },
            { key: 'settings', icon: <SettingOutlined />, label: t.nav.settings },
            { key: 'logs', icon: <FileTextOutlined />, label: t.nav.logs },
          ]}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Button type="text" icon={<GlobalOutlined />} onClick={toggleLanguage} size="small">
            <Typography.Text style={{ fontSize: 12 }}>
              {languageMeta[lang].shortLabel}
            </Typography.Text>
          </Button>
        </Header>

        <Content style={{ background: '#f5f5f5', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profiles" element={<ProfileList />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route path="/extensions" element={<Extensions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
