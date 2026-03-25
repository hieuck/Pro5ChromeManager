import React from 'react';
import { Table, Tag, Button, Row, Form, Input, Popconfirm, Typography, Empty } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';

interface RuntimesTabProps {
  state: SettingsState;
}

export const RuntimesTab: React.FC<RuntimesTabProps> = ({ state }) => {
  const {
    runtimes,
    loadingRuntimes,
    addRuntimeForm,
    addingRuntime,
    handleAddRuntime,
    handleDeleteRuntime,
    fetchRuntimes,
  } = state;

  const columns = [
    { title: 'Tên', key: 'name', render: (_: unknown, runtime: any) => runtime.label ?? runtime.name ?? runtime.key },
    { title: 'Key', dataIndex: 'key', key: 'key', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    {
      title: 'Đường dẫn',
      dataIndex: 'executablePath',
      key: 'executablePath',
      render: (v: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'available',
      key: 'available',
      width: 120,
      render: (v: boolean) => v
        ? <Tag icon={<CheckCircleOutlined />} color="success">Khả dụng</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">Không tìm thấy</Tag>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: any) => (
        <Popconfirm title="Xóa runtime này?" onConfirm={() => void handleDeleteRuntime(record.key)} okText="Xóa" cancelText="Hủy">
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Row justify="end" style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void fetchRuntimes()}>Làm mới</Button>
      </Row>
      <Table
        rowKey="key"
        columns={columns}
        dataSource={runtimes}
        loading={loadingRuntimes}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description="Chưa có runtime nào" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      <Typography.Text strong style={{ display: 'block', margin: '16px 0 8px' }}>Thêm runtime mới</Typography.Text>
      <Form form={addRuntimeForm} layout="inline">
        <Form.Item name="key" rules={[{ required: true, message: 'Nhập key' }]}>
          <Input placeholder="key (vd: chrome)" style={{ width: 120 }} />
        </Form.Item>
        <Form.Item name="label" rules={[{ required: true, message: 'Nhập tên' }]}>
          <Input placeholder="Tên hiển thị" style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="executablePath" rules={[{ required: true, message: 'Nhập đường dẫn' }]}>
          <Input placeholder="C:\...\chrome.exe" style={{ width: 300 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<PlusOutlined />} loading={addingRuntime} onClick={() => void handleAddRuntime()}>
            Thêm
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};
