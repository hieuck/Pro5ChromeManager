import React from 'react';
import { Button, Steps, Typography, Space, Card } from 'antd';
import { PlusOutlined, ChromeOutlined, GlobalOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

interface WelcomeScreenProps {
  onCreateProfile: () => void;
  onSkip: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onCreateProfile, onSkip }) => (
  <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
    <ChromeOutlined style={{ fontSize: 64, color: '#1677ff', marginBottom: 24 }} />
    <Title level={2}>Chào mừng đến Pro5 Chrome Manager</Title>
    <Paragraph type="secondary" style={{ fontSize: 16, marginBottom: 32 }}>
      Quản lý nhiều profile trình duyệt độc lập với fingerprint và proxy riêng biệt.
    </Paragraph>

    <Card style={{ textAlign: 'left', marginBottom: 32 }}>
      <Steps
        direction="vertical"
        size="small"
        current={-1}
        items={[
          {
            title: 'Tạo profile đầu tiên',
            description: 'Mỗi profile có fingerprint và proxy riêng, hoàn toàn cô lập.',
            icon: <PlusOutlined />,
          },
          {
            title: 'Cấu hình proxy (tùy chọn)',
            description: 'HTTP/HTTPS/SOCKS4/SOCKS5 — mật khẩu được mã hóa AES-256.',
            icon: <GlobalOutlined />,
          },
          {
            title: 'Khởi động và sử dụng',
            description: 'Nhấn ▶ để mở trình duyệt. Kết nối CDP qua cổng debug.',
            icon: <ChromeOutlined />,
          },
        ]}
      />
    </Card>

    <Space size="middle">
      <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onCreateProfile}>
        Tạo profile đầu tiên
      </Button>
      <Button size="large" onClick={onSkip}>
        Bỏ qua
      </Button>
    </Space>
  </div>
);

export default WelcomeScreen;
