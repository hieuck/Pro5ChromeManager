import React from 'react';
import { Table, Tag, Button, Row, Modal, Upload, Space, Typography, Popconfirm, Empty } from 'antd';
import { ReloadOutlined, InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';
import type { BrowserCore, BrowserCoreCatalogEntry } from '../../../shared/contracts';

interface BrowserCoresTabProps {
  state: SettingsState;
}

export const BrowserCoresTab: React.FC<BrowserCoresTabProps> = ({ state }) => {
  const {
    t,
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
          {t.settings.browserCoresDescription}
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchCores()} loading={loadingCores}>
            {t.settings.refresh}
          </Button>
          <Button type="primary" icon={<InboxOutlined />} onClick={() => setImportCoresOpen(true)}>
            {t.settings.browserCoreImportAction}
          </Button>
        </Space>
      </Row>

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t.settings.browserCoresCatalogTitle}
      </Typography.Text>
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        loading={loadingCores}
        dataSource={catalog}
        columns={[
          {
            title: t.settings.browserCoreLabel,
            key: 'label',
            render: (_: unknown, item: BrowserCoreCatalogEntry) => (
              item.version ? `${item.label} ${item.version}` : item.label
            ),
          },
          { title: t.settings.channelLabel, dataIndex: 'channel', key: 'channel', width: 120 },
          { title: t.settings.platformLabel, dataIndex: 'platform', key: 'platform', width: 120 },
          {
            title: t.common.status,
            key: 'status',
            width: 160,
            render: (_: unknown, item: BrowserCoreCatalogEntry) => (
              <Tag color={item.installed ? 'success' : item.status === 'package-ready' ? 'processing' : 'default'}>
                {item.installed
                  ? t.settings.browserCoreCatalogStatusInstalled
                  : item.status === 'package-ready'
                    ? t.settings.browserCoreCatalogStatusReady
                    : t.settings.browserCoreCatalogStatusPlanned}
              </Tag>
            ),
          },
          { title: t.settings.notesLabel, dataIndex: 'notes', key: 'notes' },
          {
            title: '',
            key: 'actions',
            width: 120,
            render: (_: unknown, item: BrowserCoreCatalogEntry) => {
              if (item.installed) {
                return <Tag color="success">{t.settings.browserCoreCatalogStatusInstalled}</Tag>;
              }

              if (item.status !== 'package-ready' || !item.artifactUrl) {
                return <Tag>{t.settings.browserCoreCatalogUnavailable}</Tag>;
              }

              return (
                <Button
                  size="small"
                  type="primary"
                  loading={installingCoreKey === item.key}
                  onClick={() => void handleInstallFromCatalog(item.key)}
                >
                  {t.settings.browserCoreCatalogInstall}
                </Button>
              );
            },
          },
        ]}
      />

      <Typography.Text strong style={{ display: 'block', margin: '16px 0 8px' }}>
        {t.settings.browserCoresInstalledTitle}
      </Typography.Text>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        loading={loadingCores}
        dataSource={cores}
        locale={{ emptyText: <Empty description={t.settings.browserCoreEmpty} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          {
            title: t.settings.browserCoreLabel,
            key: 'label',
            render: (_: unknown, core: BrowserCore) => `${core.label} ${core.version}`,
          },
          {
            title: t.settings.channelLabel,
            dataIndex: 'channel',
            key: 'channel',
            width: 120,
            render: (value: string | null) => value ?? 'stable',
          },
          {
            title: t.settings.browserCoreRuntimeLabel,
            dataIndex: 'managedRuntimeKey',
            key: 'managedRuntimeKey',
            render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: t.settings.browserCoreExecutableLabel,
            dataIndex: 'executablePath',
            key: 'executablePath',
            render: (value: string) => (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {value}
              </Typography.Text>
            ),
          },
          {
            title: t.settings.browserCoreInstalledLabel,
            dataIndex: 'installedAt',
            key: 'installedAt',
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: '',
            key: 'actions',
            width: 72,
            render: (_: unknown, core: BrowserCore) => (
              <Popconfirm
                title={t.settings.browserCoreDeleteConfirm}
                onConfirm={() => void handleDeleteCore(core.id)}
                okText={t.common.delete}
                cancelText={t.common.cancel}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal
        open={importCoresOpen}
        title={t.settings.browserCoreImportModalTitle}
        okText={t.settings.browserCoreImportModalConfirm}
        cancelText={t.common.cancel}
        confirmLoading={importingCores}
        onOk={() => void handleImportCore()}
        onCancel={() => {
          if (importingCores) {
            return;
          }
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
          <p className="ant-upload-text">{t.settings.browserCoreUploadText}</p>
          <p className="ant-upload-hint">{t.settings.browserCoreUploadHint}</p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};
