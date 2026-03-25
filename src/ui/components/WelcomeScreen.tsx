import React from 'react';
import { Button, Steps, Typography, Space, Card } from 'antd';
import { PlusOutlined, ChromeOutlined, GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from '../hooks/useTranslation';

const { Title, Paragraph } = Typography;

interface WelcomeScreenProps {
  onCreateProfile: () => void;
  onSkip: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onCreateProfile, onSkip }) => {
  const { t } = useTranslation();

  return (
    <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <ChromeOutlined style={{ fontSize: 64, color: '#1677ff', marginBottom: 24 }} />
      <Title level={2}>{t.profile.welcomeTitle}</Title>
      <Paragraph type="secondary" style={{ fontSize: 16, marginBottom: 32 }}>
        {t.profile.welcomeSubtitle}
      </Paragraph>

      <Card style={{ textAlign: 'left', marginBottom: 32 }}>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: t.profile.welcomeCreateFirstTitle,
              description: t.profile.welcomeCreateFirstDescription,
              icon: <PlusOutlined />,
            },
            {
              title: t.profile.welcomeProxyTitle,
              description: t.profile.welcomeProxyDescription,
              icon: <GlobalOutlined />,
            },
            {
              title: t.profile.welcomeLaunchTitle,
              description: t.profile.welcomeLaunchDescription,
              icon: <ChromeOutlined />,
            },
          ]}
        />
      </Card>

      <Space size="middle">
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onCreateProfile}>
          {t.profile.welcomePrimaryAction}
        </Button>
        <Button size="large" onClick={onSkip}>
          {t.profile.onboardingSkip}
        </Button>
      </Space>
    </div>
  );
};

export default WelcomeScreen;
