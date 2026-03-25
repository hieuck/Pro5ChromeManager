import React from 'react';
import { Form, Input, InputNumber, Select, Button, Row, Col, Divider } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';
import { useTranslation } from '../hooks/useTranslation';

interface FingerprintConfig {
  userAgent: string;
  platform: string;
  vendor: string;
  language: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: number;
  timezone: string;
  canvas: { noise: number; seed: number };
  webgl: { renderer: string; vendor: string; noise: number };
  audio: { noise: number };
  fonts: string[];
  webrtcPolicy: 'default' | 'disable_non_proxied_udp' | 'proxy_only';
}

interface FingerprintEditorProps {
  value?: FingerprintConfig;
  onChange?: (fp: FingerprintConfig) => void;
}

const FingerprintEditor: React.FC<FingerprintEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  async function handleRandomize(): Promise<void> {
    const res = await apiClient.post<FingerprintConfig>('/api/profiles/generate-fingerprint');
    if (res.success) onChange?.(res.data);
  }

  function update(patch: Partial<FingerprintConfig>): void {
    if (!value) return;
    onChange?.({ ...value, ...patch });
  }

  if (!value) return null;

  return (
    <div>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void handleRandomize()}>
          {t.profile.fingerprintRandomize}
        </Button>
      </Row>

      <Divider orientation="left" plain>{t.profile.fingerprintBrowserSection}</Divider>
      <Row gutter={12}>
        <Col span={24}>
          <Form.Item label={t.profile.fingerprintUserAgent}>
            <Input.TextArea
              rows={2}
              value={value.userAgent}
              onChange={(event) => update({ userAgent: event.target.value })}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label={t.profile.fingerprintPlatform}>
            <Input value={value.platform} onChange={(event) => update({ platform: event.target.value })} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label={t.profile.fingerprintLanguage}>
            <Input value={value.language} onChange={(event) => update({ language: event.target.value })} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label={t.profile.fingerprintTimezone}>
            <Input value={value.timezone} onChange={(event) => update({ timezone: event.target.value })} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>{t.profile.fingerprintHardwareSection}</Divider>
      <Row gutter={12}>
        <Col span={6}>
          <Form.Item label={t.profile.fingerprintCpuCores}>
            <InputNumber
              min={1}
              max={64}
              style={{ width: '100%' }}
              value={value.hardwareConcurrency}
              onChange={(nextValue) => update({ hardwareConcurrency: nextValue ?? 4 })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label={t.profile.fingerprintRam}>
            <InputNumber
              min={1}
              max={64}
              style={{ width: '100%' }}
              value={value.deviceMemory}
              onChange={(nextValue) => update({ deviceMemory: nextValue ?? 8 })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label={t.profile.fingerprintScreenWidth}>
            <InputNumber
              min={800}
              style={{ width: '100%' }}
              value={value.screenWidth}
              onChange={(nextValue) => update({ screenWidth: nextValue ?? 1920 })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label={t.profile.fingerprintScreenHeight}>
            <InputNumber
              min={600}
              style={{ width: '100%' }}
              value={value.screenHeight}
              onChange={(nextValue) => update({ screenHeight: nextValue ?? 1080 })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>{t.profile.fingerprintWebglSection}</Divider>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label={t.profile.fingerprintRenderer}>
            <Input
              value={value.webgl.renderer}
              onChange={(event) => update({ webgl: { ...value.webgl, renderer: event.target.value } })}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label={t.profile.fingerprintVendor}>
            <Input
              value={value.webgl.vendor}
              onChange={(event) => update({ webgl: { ...value.webgl, vendor: event.target.value } })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>{t.profile.fingerprintPrivacySection}</Divider>
      <Form.Item label={t.profile.fingerprintWebrtcPolicy}>
        <Select
          value={value.webrtcPolicy}
          onChange={(nextValue) => update({ webrtcPolicy: nextValue })}
          options={[
            { label: t.profile.fingerprintWebrtcDefault, value: 'default' },
            { label: t.profile.fingerprintWebrtcDisableUdp, value: 'disable_non_proxied_udp' },
            { label: t.profile.fingerprintWebrtcProxyOnly, value: 'proxy_only' },
          ]}
        />
      </Form.Item>
    </div>
  );
};

export default FingerprintEditor;
