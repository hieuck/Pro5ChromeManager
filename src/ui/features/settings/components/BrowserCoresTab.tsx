import React from 'react';
import { Table, Tag, Button, Row, Modal, Upload, Space, Typography, Popconfirm, Empty } from 'antd';
import { ReloadOutlined, InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';
import type { BrowserCore, BrowserCoreCatalogEntry } from '../../../server/shared/types';

interface BrowserCoresTabProps {
  state: SettingsState;
}

export const BrowserCoresTab: React.FC<BrowserCoresTabProps> = ({ state }) => {
  const {
    cores,
    catalog,
    loadingCores,
    importCoresOpen,
    setImportCoresOpen,
    importingCores,
    installingCoreKey,
    corePackageFiles,
    setCorePackageFiles,
    handleImportCore,
    handleDeleteCore,
    handleInstallFromCatalog,
    fetchCores,
  } = state;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Quản lý browser runtime riêng của Pro5. Core đã cài sẽ tự xuất hiện như runtime cho profile.
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchCores()} loading={loadingCores}>Làm mới</Button>
          <Button type="primary" icon={<InboxOutlined />} onClick={() => setImportCoresOpen(true)}>Import core package</Button>
        </Space>
      </Row>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>Catalog</Typography.Text>
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        loading={loadingCores}
        dataSource={catalog}
        columns={[
          { title: 'Core', key: 'label', render: (_: unknown, item: BrowserCoreCatalogEntry) => item.version ? `${item.label} ${item.version}` : item.label },
          { title: 'Channel', dataIndex: 'channel', key: 'channel', width: 120 },
          { title: 'Platform', dataIndex: 'platform', key: 'platform', width: 120 },
          {
            title: 'Status',
            key: 'status',
            width: 160,
            render: (_: unknown, item: BrowserCoreCatalogEntry) => (
              <Tag color={item.installed ? 'success' : item.status === 'package-ready' ? 'processing' : 'default'}>
                {item.installed ? 'Installed' : item.status === 'package-ready' ? 'Package ready' : 'Planned'}
              </Tag>
            ),
          },
          { title: 'Notes', dataIndex: 'notes', key: 'notes' },
          {
            title: '',
            key: 'actions',
            width: 120,
            render: (_: unknown, item: BrowserCoreCatalogEntry) => {
              if (item.installed) {
                return <Tag color="success">Installed</Tag>;
              }
              if (item.status !== 'package-ready' || !item.artifactUrl) {
                return <Tag>Unavailable</Tag>;
              }
              return (
                <Button
                  size="small"
                  type="primary"
                  loading={installingCoreKey === item.key}
                  onClick={() => void handleInstallFromCatalog(item.key)}
                >
                  Install
                </Button>
              );
            },
          },
        ]}
      />

      <Typography.Text strong style={{ display: 'block', margin: '16px 0 8px' }}>Installed cores</Typography.Text>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        loading={loadingCores}
        dataSource={cores}
        locale={{ emptyText: <Empty description="Chưa có browser core nào" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          { title: 'Core', key: 'label', render: (_: unknown, core: BrowserCore) => `${core.label} ${core.version}` },
          { title: 'Channel', dataIndex: 'channel', key: 'channel', width: 120, render: (v: string | null) => v ?? 'stable' },
          { title: 'Runtime', dataIndex: 'managedRuntimeKey', key: 'managedRuntimeKey', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
          { title: 'Executable', dataIndex: 'executablePath', key: 'executablePath', render: (v: string) => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text> },
          { title: 'Installed', dataIndex: 'installedAt', key: 'installedAt', width: 180, render: (v: string) => new Date(v).toLocaleString('vi-VN') },
          {
            title: '',
            key: 'actions',
            width: 72,
            render: (_: unknown, core: BrowserCore) => (
              <Popconfirm title="Gỡ browser core này?" onConfirm={() => void handleDeleteCore(core.id)} okText="Gỡ" cancelText="Hủy">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal
        open={importCoresOpen}
        title="Import browser core package"
        okText="Cài browser core"
        cancelText="Hủy"
        confirmLoading={importingCores}
        onOk={() => void handleImportCore()}
        onCancel={() => {
          if (importingCores) return;
          setImportCoresOpen(false);
          setCorePackageFiles([]);
        }}
      >
        <Upload.Dragger
          multiple={false}
          accept=".zip"
          beforeUpload={() => false}
          fileList={corePackageFiles as any[]}
          onChange={({ fileList }) => setCorePackageFiles(fileList as any[])}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Thả gói `.zip` của browser core vào đây</p>
          <p className="ant-upload-hint">
            Archive cần có `browser-core.json` và binary runtime bên trong.
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};
