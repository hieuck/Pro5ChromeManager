import React, { useEffect, useState } from 'react';
import { Modal, Steps, Button, Space, Select, Typography, Alert, Spin, Input } from 'antd';
import { ChromeOutlined, GlobalOutlined, PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';

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

interface OnboardingStatePayload {
  status?: 'not_started' | 'in_progress' | 'profile_created' | 'completed' | 'skipped';
  currentStep?: number;
  selectedRuntime?: string | null;
  draftProfileName?: string | null;
  createdProfileId?: string | null;
  lastOpenedAt?: string | null;
  profileCreatedAt?: string | null;
  completedAt?: string | null;
  skippedAt?: string | null;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ open, onFinish }) => {
  const [step, setStep] = useState(0);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<string | undefined>();
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileName, setProfileName] = useState('Profile dau tien');
  const [createdProfileId, setCreatedProfileId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function syncOnboardingState(payload: OnboardingStatePayload): Promise<void> {
    await apiClient.post('/api/support/onboarding-state', payload);
  }

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
    await apiClient.put('/api/config', { onboardingCompleted: true });
    await syncOnboardingState({
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
    await syncOnboardingState({
      status: 'skipped',
      currentStep: step,
      selectedRuntime: selectedRuntime ?? null,
      draftProfileName: profileName.trim() || null,
      skippedAt: new Date().toISOString(),
    });
    await handleFinish();
  }

  const steps = [
    { title: 'Chon trinh duyet', icon: <ChromeOutlined /> },
    { title: 'Tao profile', icon: <GlobalOutlined /> },
    { title: 'Hoan thanh', icon: <CheckCircleOutlined /> },
  ];

  function renderStepContent(): React.ReactNode {
    if (step === 0) {
      return (
        <div style={{ padding: '24px 0' }}>
          <Paragraph>Chon trinh duyet Chromium de su dung. Pro5 ho tro Chrome, Edge, CentBrowser va Chromium.</Paragraph>
          {loadingRuntimes ? (
            <Spin />
          ) : runtimes.length === 0 ? (
            <Alert
              type="warning"
              message="Khong tim thay trinh duyet nao"
              description="Hay cai dat Google Chrome hoac Microsoft Edge, sau do them duong dan trong Settings -> Runtimes."
            />
          ) : (
            <Select
              style={{ width: '100%' }}
              value={selectedRuntime}
              onChange={setSelectedRuntime}
              options={runtimes.map((runtime) => ({
                label: `${runtime.label}${runtime.available ? '' : ' (khong kha dung)'}`,
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
          <Paragraph>Dat ten cho profile dau tien cua ban.</Paragraph>
          <Input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Ten profile"
          />
          {error ? <Alert type="error" message={error} style={{ marginTop: 12 }} /> : null}
        </div>
      );
    }

    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
        <Paragraph>
          Profile <Text strong>{profileName}</Text> da duoc tao thanh cong.
        </Paragraph>
        <Paragraph type="secondary">
          Nhan <Text strong>Bat dau</Text> de mo danh sach profile va khoi dong trinh duyet.
        </Paragraph>
      </div>
    );
  }

  function renderFooter(): React.ReactNode {
    if (step === 0) {
      return (
        <Space>
          <Button onClick={() => void handleSkip()}>Bo qua</Button>
          <Button type="primary" onClick={() => setStep(1)}>
            Tiep theo
          </Button>
        </Space>
      );
    }
    if (step === 1) {
      return (
        <Space>
          <Button onClick={() => setStep(0)}>Quay lai</Button>
          <Button
            type="primary"
            loading={creatingProfile}
            disabled={!profileName.trim()}
            onClick={() => void handleCreateProfile()}
            icon={<PlayCircleOutlined />}
          >
            Tao profile
          </Button>
        </Space>
      );
    }
    return (
      <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void handleFinish()}>
        Bat dau
      </Button>
    );
  }

  return (
    <Modal
      open={open}
      title="Thiet lap ban dau"
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
