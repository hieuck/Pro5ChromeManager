import React, { useEffect, useState } from 'react';
import { Modal, Steps, Button, Space, Select, Typography, Alert, Spin, Input, message } from 'antd';
import { ChromeOutlined, GlobalOutlined, PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { finalizeOnboarding, syncOnboardingState } from '../utils/onboarding';

const { Text, Paragraph } = Typography;
const DEFAULT_PROFILE_NAME = 'Profile đầu tiên';

interface Runtime {
  key: string;
  label: string;
  executablePath: string;
  available: boolean;
}

interface OnboardingWizardProps {
  open: boolean;
  onFinish: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ open, onFinish }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<string | undefined>();
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileName, setProfileName] = useState(DEFAULT_PROFILE_NAME);
  const [createdProfileId, setCreatedProfileId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const availableRuntimes = runtimes.filter((runtime) => runtime.available);

  useEffect(() => {
    if (!open) {
      return;
    }

    setStep(0);
    setRuntimes([]);
    setSelectedRuntime(undefined);
    setCreatingProfile(false);
    setProfileName(DEFAULT_PROFILE_NAME);
    setCreatedProfileId(undefined);
    setError(undefined);

    void syncOnboardingState({
      status: 'in_progress',
      currentStep: 0,
      draftProfileName: DEFAULT_PROFILE_NAME,
      lastOpenedAt: new Date().toISOString(),
    });
    void loadRuntimes();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void syncOnboardingState({
      status: createdProfileId ? 'profile_created' : 'in_progress',
      currentStep: step,
      selectedRuntime: selectedRuntime ?? null,
      draftProfileName: profileName.trim() || null,
      createdProfileId: createdProfileId ?? null,
    });
  }, [open, step, selectedRuntime, profileName, createdProfileId]);

  async function loadRuntimes(): Promise<void> {
    setLoadingRuntimes(true);
    const res = await apiClient.get<Runtime[]>('/api/runtimes');
    if (res.success) {
      setRuntimes(res.data);
      const available = res.data.find((runtime) => runtime.available);
      if (available) setSelectedRuntime(available.key);
    }
    setLoadingRuntimes(false);
  }

  async function handleCreateProfile(): Promise<void> {
    setCreatingProfile(true);
    setError(undefined);
    const res = await apiClient.post<{ id: string }>('/api/profiles', {
      name: profileName,
      runtime: selectedRuntime ?? 'auto',
    });
    if (res.success) {
      setCreatedProfileId(res.data.id);
      await syncOnboardingState({
        status: 'profile_created',
        currentStep: 2,
        selectedRuntime: selectedRuntime ?? null,
        draftProfileName: profileName.trim() || null,
        createdProfileId: res.data.id,
        profileCreatedAt: new Date().toISOString(),
      });
      setStep(2);
    } else {
      setError(res.error);
    }
    setCreatingProfile(false);
  }

  async function handleFinish(): Promise<void> {
    onFinish();

    try {
      await finalizeOnboarding({
        status: 'completed',
        currentStep: 2,
        selectedRuntime: selectedRuntime ?? null,
        draftProfileName: profileName.trim() || null,
        createdProfileId: createdProfileId ?? null,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Không thể hoàn tất hướng dẫn thiết lập.');
    }
  }

  async function handleSkip(): Promise<void> {
    await finalizeOnboarding({
      status: 'skipped',
      currentStep: step,
      selectedRuntime: selectedRuntime ?? null,
      draftProfileName: profileName.trim() || null,
      skippedAt: new Date().toISOString(),
    });
    onFinish();
  }

  function handleOpenRuntimeSettings(): void {
    onFinish();
    navigate('/settings');
  }

  const steps = [
    { title: 'Chọn trình duyệt', icon: <ChromeOutlined /> },
    { title: 'Tạo profile', icon: <GlobalOutlined /> },
    { title: 'Hoàn thành', icon: <CheckCircleOutlined /> },
  ];

  function renderStepContent(): React.ReactNode {
    if (step === 0) {
      return (
        <div style={{ padding: '24px 0' }}>
          <Paragraph>Chọn trình duyệt Chromium để sử dụng. Pro5 hỗ trợ Chrome, Edge, CentBrowser và Chromium.</Paragraph>
          {loadingRuntimes ? (
            <Spin />
          ) : availableRuntimes.length === 0 ? (
            <Alert
              type="warning"
              message="Không tìm thấy trình duyệt nào"
              description={(
                <Space direction="vertical" size={12}>
                  <Typography.Text>
                    Hãy cài đặt Google Chrome hoặc Microsoft Edge, sau đó thêm đường dẫn trong Settings -&gt; Browsers.
                  </Typography.Text>
                  <Button onClick={handleOpenRuntimeSettings}>Mở cài đặt</Button>
                </Space>
              )}
            />
          ) : (
            <Select
              style={{ width: '100%' }}
              value={selectedRuntime}
              onChange={setSelectedRuntime}
              options={runtimes.map((runtime) => ({
                label: `${runtime.label}${runtime.available ? '' : ' (không khả dụng)'}`,
                value: runtime.key,
                disabled: !runtime.available,
              }))}
            />
          )}
        </div>
      );
    }

    if (step === 1) {
      return (
        <div style={{ padding: '24px 0' }}>
          <Paragraph>Đặt tên cho profile đầu tiên của bạn.</Paragraph>
          <Input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Tên profile"
          />
          {error ? <Alert type="error" message={error} style={{ marginTop: 12 }} /> : null}
        </div>
      );
    }

    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
        <Paragraph>
          Profile <Text strong>{profileName}</Text> đã được tạo thành công.
        </Paragraph>
        <Paragraph type="secondary">
          Nhấn <Text strong>Bắt đầu</Text> để mở danh sách profile và khởi động trình duyệt.
        </Paragraph>
      </div>
    );
  }

  function renderFooter(): React.ReactNode {
    if (step === 0) {
      return (
        <Space>
          <Button onClick={() => void handleSkip()}>Bỏ qua</Button>
          <Button type="primary" disabled={availableRuntimes.length === 0} onClick={() => setStep(1)}>
            Tiếp theo
          </Button>
        </Space>
      );
    }
    if (step === 1) {
      return (
        <Space>
          <Button onClick={() => setStep(0)}>Quay lại</Button>
          <Button
            type="primary"
            loading={creatingProfile}
            disabled={!profileName.trim()}
            onClick={() => void handleCreateProfile()}
            icon={<PlayCircleOutlined />}
          >
            Tạo profile
          </Button>
        </Space>
      );
    }
    return (
      <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void handleFinish()}>
        Bắt đầu
      </Button>
    );
  }

  return (
    <Modal
      open={open}
      title="Thiết lập ban đầu"
      footer={renderFooter()}
      closable={false}
      width={520}
      maskClosable={false}
    >
      <Steps current={step} items={steps} style={{ marginBottom: 24 }} />
      {renderStepContent()}
    </Modal>
  );
};

export default OnboardingWizard;
