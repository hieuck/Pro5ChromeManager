import React from 'react';
import { Form, Input, InputNumber, Select, Button, Row, Col, Divider } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../api/client';

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
          Ngẫu nhiên
        </Button>
      </Row>

      <Divider orientation="left" plain>Trình duyệt</Divider>
      <Row gutter={12}>
        <Col span={24}>
          <Form.Item label="User Agent">
            <Input.TextArea
              rows={2}
              value={value.userAgent}
              onChange={(e) => update({ userAgent: e.target.value })}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="Platform">
            <Input value={value.platform} onChange={(e) => update({ platform: e.target.value })} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="Language">
            <Input value={value.language} onChange={(e) => update({ language: e.target.value })} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="Timezone">
            <Input value={value.timezone} onChange={(e) => update({ timezone: e.target.value })} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>Phần cứng</Divider>
      <Row gutter={12}>
        <Col span={6}>
          <Form.Item label="CPU cores">
            <InputNumber
              min={1} max={64} style={{ width: '100%' }}
              value={value.hardwareConcurrency}
              onChange={(v) => update({ hardwareConcurrency: v ?? 4 })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="RAM (GB)">
            <InputNumber
              min={1} max={64} style={{ width: '100%' }}
              value={value.deviceMemory}
              onChange={(v) => update({ deviceMemory: v ?? 8 })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="Màn hình W">
            <InputNumber
              min={800} style={{ width: '100%' }}
              value={value.screenWidth}
              onChange={(v) => update({ screenWidth: v ?? 1920 })}
            />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item label="Màn hình H">
            <InputNumber
              min={600} style={{ width: '100%' }}
              value={value.screenHeight}
              onChange={(v) => update({ screenHeight: v ?? 1080 })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>WebGL</Divider>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="Renderer">
            <Input value={value.webgl.renderer} onChange={(e) => update({ webgl: { ...value.webgl, renderer: e.target.value } })} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Vendor">
            <Input value={value.webgl.vendor} onChange={(e) => update({ webgl: { ...value.webgl, vendor: e.target.value } })} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>Bảo mật</Divider>
      <Form.Item label="WebRTC Policy">
        <Select
          value={value.webrtcPolicy}
          onChange={(v) => update({ webrtcPolicy: v })}
          options={[
            { label: 'Mặc định', value: 'default' },
            { label: 'Chặn non-proxied UDP', value: 'disable_non_proxied_udp' },
            { label: 'Chỉ qua proxy', value: 'proxy_only' },
          ]}
        />
      </Form.Item>
    </div>
  );
};

export default FingerprintEditor;
