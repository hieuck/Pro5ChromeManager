import React, { useEffect, useState } from 'react';
import { Modal, Steps, Button, Space, Select, Typography, Alert, Spin, Input } from 'antd';
import { ChromeOutlined, GlobalOutlined, PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';
import { finalizeOnboarding, syncOnboardingState } from '../utils/onboarding';

const { Text, Paragraph } = Typography;

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
  const [step, setStep] = useState(0);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<string | undefined>();
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileName, setProfileName] = useState('Profile đầu tiên');
  const [createdProfileId, setCreatedProfileId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (open && step === 0) {
      void syncOnboardingState({
        status: 'in_progress',
        currentStep: 0,
        draftProfileName: profileName.trim() || null,
        lastOpenedAt: new Date().toISOString(),
      });
      void loadRuntimes();
    }
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
    await finalizeOnboarding({
      status: 'completed',
      currentStep: 2,
      selectedRuntime: selectedRuntime ?? null,
      draftProfileName: profileName.trim() || null,
      createdProfileId: createdProfileId ?? null,
      completedAt: new Date().toISOString(),
    });
    onFinish();
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
          ) : runtimes.length === 0 ? (
            <Alert
              type="warning"
              message="Không tìm thấy trình duyệt nào"
              description="Hãy cài đặt Google Chrome hoặc Microsoft Edge, sau đó thêm đường dẫn trong Settings -> Runtimes."
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
          <Button type="primary" onClick={() => setStep(1)}>
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
