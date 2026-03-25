import React, { useEffect, useState } from 'react';
import { Modal, Steps, Button, Space, Select, Typography, Alert, Spin, Input, message } from 'antd';
import { ChromeOutlined, GlobalOutlined, PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';
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
  const { t, format } = useTranslation();
  const navigate = useNavigate();
  const defaultProfileName = t.profile.onboardingDefaultProfileName;
  const [step, setStep] = useState(0);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState<string | undefined>();
  const [loadingRuntimes, setLoadingRuntimes] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [profileName, setProfileName] = useState(defaultProfileName);
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
    setProfileName(defaultProfileName);
    setCreatedProfileId(undefined);
    setError(undefined);

    void syncOnboardingState({
      status: 'in_progress',
      currentStep: 0,
      draftProfileName: defaultProfileName,
      lastOpenedAt: new Date().toISOString(),
    });
    void loadRuntimes();
  }, [open, defaultProfileName]);

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
      void message.error(err instanceof Error ? err.message : t.profile.onboardingCompleteFailed);
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
    { title: t.profile.onboardingChooseBrowserTitle, icon: <ChromeOutlined /> },
    { title: t.profile.onboardingCreateProfileTitle, icon: <GlobalOutlined /> },
    { title: t.profile.onboardingCompleteTitle, icon: <CheckCircleOutlined /> },
  ];

  function renderStepContent(): React.ReactNode {
    if (step === 0) {
      return (
        <div style={{ padding: '24px 0' }}>
          <Paragraph>{t.profile.onboardingChooseBrowserDescription}</Paragraph>
          {loadingRuntimes ? (
            <Spin />
          ) : availableRuntimes.length === 0 ? (
            <Alert
              type="warning"
              message={t.profile.onboardingNoBrowserMessage}
              description={(
                <Space direction="vertical" size={12}>
                  <Typography.Text>{t.profile.onboardingNoBrowserHint}</Typography.Text>
                  <Button onClick={handleOpenRuntimeSettings}>{t.profile.onboardingOpenSettings}</Button>
                </Space>
              )}
            />
          ) : (
            <Select
              style={{ width: '100%' }}
              value={selectedRuntime}
              onChange={setSelectedRuntime}
              options={runtimes.map((runtime) => ({
                label: `${runtime.label}${runtime.available ? '' : ` (${t.profile.onboardingUnavailableRuntime})`}`,
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
          <Paragraph>{t.profile.onboardingProfileNameDescription}</Paragraph>
          <Input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder={t.profile.onboardingProfileNamePlaceholder}
          />
          {error ? <Alert type="error" message={error} style={{ marginTop: 12 }} /> : null}
        </div>
      );
    }

    return (
      <div style={{ padding: '24px 0', textAlign: 'center' }}>
        <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
        <Paragraph>{format(t.profile.onboardingProfileCreated, { name: profileName })}</Paragraph>
        <Paragraph type="secondary">
          <Text strong>{t.profile.onboardingStartAction}</Text>
          {' '}
          {t.profile.onboardingStartHint}
        </Paragraph>
      </div>
    );
  }

  function renderFooter(): React.ReactNode {
    if (step === 0) {
      return (
        <Space>
          <Button onClick={() => void handleSkip()}>{t.profile.onboardingSkip}</Button>
          <Button type="primary" disabled={availableRuntimes.length === 0} onClick={() => setStep(1)}>
            {t.profile.onboardingNext}
          </Button>
        </Space>
      );
    }
    if (step === 1) {
      return (
        <Space>
          <Button onClick={() => setStep(0)}>{t.profile.onboardingBack}</Button>
          <Button
            type="primary"
            loading={creatingProfile}
            disabled={!profileName.trim()}
            onClick={() => void handleCreateProfile()}
            icon={<PlayCircleOutlined />}
          >
            {t.profile.onboardingCreateAction}
          </Button>
        </Space>
      );
    }
    return (
      <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void handleFinish()}>
        {t.profile.onboardingStartAction}
      </Button>
    );
  }

  return (
    <Modal
      open={open}
      title={t.profile.onboardingSetupTitle}
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
