import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Typography, notification } from 'antd';
import {
  ApiOutlined,
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  FileTextOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from './hooks/useTranslation';
import ProfileList from './pages/ProfileList';
import Proxies from './pages/Proxies';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Dashboard from './pages/Dashboard';

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
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = location.pathname.startsWith('/settings')
    ? 'settings'
    : location.pathname.startsWith('/proxies')
      ? 'proxies'
    : location.pathname.startsWith('/logs')
      ? 'logs'
    : location.pathname.startsWith('/dashboard')
      ? 'dashboard'
      : 'profiles';

  // ─── Auto-update notification (Electron only) ─────────────────────────────

  useEffect(() => {
    function onUpdateReady(e: Event): void {
      const version = (e as CustomEvent<{ version: string }>).detail.version;
      notification.info({
        message: `Phiên bản mới ${version} sẵn sàng`,
        description: 'Cập nhật sẽ được áp dụng khi bạn thoát ứng dụng.',
        duration: 0,
        btn: (
          <Button
            type="primary"
            size="small"
            onClick={() => { void window.__pro5__?.installUpdate(); }}
          >
            Cập nhật ngay
          </Button>
        ),
      });
    }
    window.addEventListener('pro5:update-ready', onUpdateReady);
    return () => window.removeEventListener('pro5:update-ready', onUpdateReady);
  }, []);

  function toggleLanguage(): void {
    const next = lang === 'vi' ? 'en' : 'vi';
    localStorage.setItem('uiLanguage', next);
    window.location.reload();
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={200}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: collapsed ? 12 : 14,
            padding: '0 8px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
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
          {/* Language toggle */}
          <Button type="text" icon={<GlobalOutlined />} onClick={toggleLanguage} size="small">
            <Typography.Text style={{ fontSize: 12 }}>
              {lang === 'vi' ? 'VI' : 'EN'}
            </Typography.Text>
          </Button>
        </Header>

        <Content style={{ background: '#f5f5f5', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profiles" element={<ProfileList />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
