import React from 'react';
import { Table, Button, Row, Space, Typography, Popconfirm, Empty } from 'antd';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';
import type { BackupEntry } from '../../../shared/contracts';

interface BackupTabProps {
  state: SettingsState;
}

export const BackupTab: React.FC<BackupTabProps> = ({ state }) => {
  const {
    t,
    backups,
    loadingBackups,
    creatingBackup,
    handleCreateBackup,
    handleRestoreBackup,
    handleExportBackup,
    fetchBackups,
  } = state;

  function formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const columns = [
    {
      title: t.settings.backupTimeLabel,
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (value: string) => {
        try {
          return new Date(value).toLocaleString();
        } catch {
          return value;
        }
      },
    },
    {
      title: t.settings.backupSizeLabel,
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      width: 100,
      render: (value: number) => formatSize(value),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: BackupEntry) => (
        <Space size={4}>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExportBackup(record.filename)}>
            {t.settings.backupExportAction}
          </Button>
          <Popconfirm
            title={t.settings.backupRestoreConfirm}
            onConfirm={() => void handleRestoreBackup(record.filename)}
            okText={t.settings.backupRestoreAction}
            cancelText={t.common.cancel}
          >
            <Button size="small">{t.settings.backupRestoreAction}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">
          {t.settings.backupRetentionHint}
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchBackups()}>
            {t.settings.refresh}
          </Button>
          <Button type="primary" loading={creatingBackup} onClick={() => void handleCreateBackup()}>
            {t.settings.backupCreateNow}
          </Button>
        </Space>
      </Row>
      <Table
        rowKey="filename"
        columns={columns}
        dataSource={backups}
        loading={loadingBackups}
        size="small"
        pagination={false}
        locale={{ emptyText: <Empty description={t.settings.backupEmpty} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </div>
  );
};
