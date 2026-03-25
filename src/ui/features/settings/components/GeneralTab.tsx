import React from 'react';
import { Form, Input, InputNumber, Select, Switch, Button, Row, Col, Typography } from 'antd';
import { SaveOutlined, QuestionCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { supportedLanguages, languageMeta } from '../../../i18n';
import OnboardingWizard from '../../onboarding/components/OnboardingWizard';
import type { SettingsState } from '../useSettingsState';

interface GeneralTabProps {
  state: SettingsState;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ state }) => {
  const {
    t,
    generalForm,
    savingGeneral,
    wizardOpen,
    setWizardOpen,
    handleSaveGeneral,
    handleResetOnboarding,
  } = state;

  const handleExportDiagnostics = (): void => {
    // This is a simple window.open, can be handled here or in hook
    // Given the previous implementation, let's keep it consistent
    window.open('/api/support/diagnostics', '_blank');
  };

  return (
    <Form form={generalForm} layout="vertical" style={{ maxWidth: 560 }}>
      <Form.Item name="uiLanguage" label={t.settings.uiLanguage}>
        <Select
          options={supportedLanguages.map((language) => ({
            label: languageMeta[language].nativeLabel,
            value: language,
          }))}
        />
      </Form.Item>
      <Form.Item name="profilesDir" label={t.settings.profilesDir} rules={[{ required: true }]}>
        <Input placeholder="./data/profiles" />
      </Form.Item>
      <Form.Item name="headless" label={t.settings.defaultHeadless} valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="windowTitleSuffixEnabled" label={t.settings.windowTitleSuffix} valuePropName="checked">
        <Switch />
      </Form.Item>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>{t.settings.apiServer}</Typography.Text>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item name="apiHost" label="Host">
            <Input placeholder="127.0.0.1" />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item name="apiPort" label="Port">
            <InputNumber min={1024} max={65535} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>{t.settings.sessionCheck}</Typography.Text>
      <Row gutter={12}>
        <Col span={14}>
          <Form.Item name="sessionCheckTimeout" label={t.settings.sessionCheckTimeout}>
            <InputNumber min={5000} max={120000} step={1000} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item name="sessionCheckHeadless" label={t.settings.sessionCheckHeadless} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <Button type="primary" icon={<SaveOutlined />} loading={savingGeneral} onClick={() => void handleSaveGeneral()}>
        {t.settings.saveSettings}
      </Button>
      <Button
        style={{ marginLeft: 12 }}
        icon={<QuestionCircleOutlined />}
        onClick={() => void handleResetOnboarding()}
      >
        {t.settings.reviewOnboarding}
      </Button>

      <Button
        style={{ marginLeft: 12 }}
        icon={<DownloadOutlined />}
        onClick={handleExportDiagnostics}
      >
        {t.settings.exportDiagnostics}
      </Button>

      <OnboardingWizard open={wizardOpen} onFinish={() => setWizardOpen(false)} />
    </Form>
  );
};
