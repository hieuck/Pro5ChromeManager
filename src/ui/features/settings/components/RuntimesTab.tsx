import React from 'react';
import { Table, Tag, Button, Row, Form, Input, Popconfirm, Typography, Empty } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';

interface RuntimesTabProps {
  state: SettingsState;
}

export const RuntimesTab: React.FC<RuntimesTabProps> = ({ state }) => {
  const {
    t,
    runtimes,
    loadingRuntimes,
    addRuntimeForm,
    addingRuntime,
    handleAddRuntime,
    handleDeleteRuntime,
    fetchRuntimes,
  } = state;

  const columns = [
    {
      title: t.common.name,
      key: 'name',
      render: (_: unknown, runtime: { label?: string; name?: string; key: string }) => runtime.label ?? runtime.name ?? runtime.key,
    },
    {
      title: t.settings.runtimeKeyLabel,
      dataIndex: 'key',
      key: 'key',
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: t.settings.runtimePathLabel,
      dataIndex: 'executablePath',
      key: 'executablePath',
      render: (value: string) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: t.common.status,
      dataIndex: 'available',
      key: 'available',
      width: 120,
      render: (value: boolean) => value
        ? <Tag icon={<CheckCircleOutlined />} color="success">{t.settings.runtimeStatusAvailable}</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">{t.settings.runtimeStatusMissing}</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: { key: string }) => (
        <Popconfirm
          title={t.settings.runtimeDeleteConfirm}
          onConfirm={() => void handleDeleteRuntime(record.key)}
          okText={t.common.delete}
          cancelText={t.common.cancel}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchRuntimes()}>
          {t.settings.refresh}
        </Button>
      </Row>
      <Table
        rowKey="key"
        columns={columns}
        dataSource={runtimes}
        loading={loadingRuntimes}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description={t.settings.runtimeEmpty} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      <Typography.Text strong style={{ display: 'block', margin: '16px 0 8px' }}>
        {t.settings.runtimeAddTitle}
      </Typography.Text>
      <Form form={addRuntimeForm} layout="inline">
        <Form.Item name="key" rules={[{ required: true, message: t.settings.runtimeKeyRequired }]}>
          <Input placeholder={t.settings.runtimeKeyPlaceholder} style={{ width: 120 }} />
        </Form.Item>
        <Form.Item name="label" rules={[{ required: true, message: t.settings.runtimeLabelRequired }]}>
          <Input placeholder={t.settings.runtimeLabelPlaceholder} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="executablePath" rules={[{ required: true, message: t.settings.runtimePathRequired }]}>
          <Input placeholder={t.settings.runtimePathPlaceholder} style={{ width: 300 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<PlusOutlined />} loading={addingRuntime} onClick={() => void handleAddRuntime()}>
            {t.settings.runtimeAddAction}
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};
