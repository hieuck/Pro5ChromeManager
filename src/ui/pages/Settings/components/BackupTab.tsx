import React from 'react';
import { Table, Button, Row, Space, Typography, Popconfirm, Empty } from 'antd';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import type { SettingsState } from '../useSettingsState';
import type { BackupEntry } from '../../../server/shared/types';

interface BackupTabProps {
  state: SettingsState;
}

export const BackupTab: React.FC<BackupTabProps> = ({ state }) => {
  const {
    backups,
    loadingBackups,
    creatingBackup,
    handleCreateBackup,
    handleRestoreBackup,
    handleExportBackup,
    fetchBackups,
  } = state;

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (v: string) => { try { return new Date(v).toLocaleString('vi-VN'); } catch { return v; } },
    },
    {
      title: 'Kích thước',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      width: 100,
      render: (v: number) => formatSize(v),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: BackupEntry) => (
        <Space size={4}>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExportBackup(record.filename)}>
            Tải về
          </Button>
          <Popconfirm
            title="Khôi phục backup này? Dữ liệu hiện tại sẽ bị ghi đè."
            onConfirm={() => void handleRestoreBackup(record.filename)}
            okText="Khôi phục"
            cancelText="Hủy"
          >
            <Button size="small">Khôi phục</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Tự động backup mỗi 24h. Giữ tối đa 7 bản.
        </Typography.Text>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchBackups()} />
          <Button type="primary" loading={creatingBackup} onClick={() => void handleCreateBackup()}>
            Backup ngay
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
        locale={{ emptyText: <Empty description="Chưa có backup nào" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </div>
  );
};
