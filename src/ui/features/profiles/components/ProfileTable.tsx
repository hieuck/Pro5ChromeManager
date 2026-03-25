import React from 'react';
import { Badge, Button, Empty, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Profile, ProfileListState } from '../useProfileListState';
import { useProfileListState } from '../useProfileListState';

const STATUS_BADGE: Record<string, 'success' | 'processing' | 'error' | 'default'> = {
  running: 'success',
  unreachable: 'error',
  stopped: 'default',
  stale: 'default',
};

interface ProfileTableProps {
  state: ProfileListState;
}

export const ProfileTable: React.FC<ProfileTableProps> = ({ state }) => {
  const {
    t,
    filtered,
    loading,
    selectedIds,
    setSelectedIds,
    highlightedIndex,
    setHighlightedIndex,
    getProfileStatus,
    getProfileProxyId,
    proxyMap,
    openEdit,
    handleStop,
    confirmAndStartProfiles,
    handleRestart,
    handleClone,
    handleExport,
    handleDelete,
  } = state;

  const columns: ColumnsType<Profile> = [
    {
      title: t.common.name,
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openEdit(record.id)}>
            {name}
          </Button>
          {record.group ? <Typography.Text type="secondary">{record.group}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: t.common.status,
      key: 'status',
      width: 130,
      render: (_, record) => {
        const status = getProfileStatus(record.id);
        return (
          <Badge
            status={STATUS_BADGE[status] ?? 'default'}
            text={t.profile[status as keyof typeof t.profile] ?? status}
          />
        );
      },
    },
    {
      title: t.profile.proxy,
      key: 'proxy',
      width: 260,
      render: (_, record) => {
        const proxyId = getProfileProxyId(record);
        if (!proxyId) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }

        const proxy = record.proxy ?? proxyMap.get(proxyId);
        if (!proxy) {
          return <Tag color="orange">{proxyId.slice(0, 8)}</Tag>;
        }

        const label = proxy.label?.trim()
          ? proxy.label
          : `${proxy.host}:${proxy.port}`;

        return (
          <Space direction="vertical" size={0}>
            <Space size={4} wrap>
              <Tag color="blue">{proxy.type.toUpperCase()}</Tag>
              {proxy.lastCheckStatus === 'healthy' ? <Tag color="green">Healthy</Tag> : null}
              {proxy.lastCheckStatus === 'failing' ? <Tag color="red">Needs check</Tag> : null}
            </Space>
            <Typography.Text>{label}</Typography.Text>
            {proxy.lastCheckStatus === 'healthy' && proxy.lastCheckAt ? (
              <Typography.Text type="secondary">
                {proxy.lastCheckTimezone
                  ? `${proxy.lastCheckIp ?? '—'} · ${proxy.lastCheckTimezone}`
                  : proxy.lastCheckIp ?? '—'}
              </Typography.Text>
            ) : null}
            {proxy.lastCheckStatus === 'failing' && proxy.lastCheckError ? (
              <Typography.Text type="danger">{proxy.lastCheckError}</Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: t.common.tags,
      dataIndex: 'tags',
      key: 'tags',
      render: (profileTags: string[] | undefined) => (
        (profileTags ?? []).length > 0
          ? (profileTags ?? []).map((tag) => <Tag key={tag}>{tag}</Tag>)
          : <Typography.Text type="secondary">—</Typography.Text>
      ),
    },
    {
      title: t.common.owner,
      dataIndex: 'owner',
      key: 'owner',
      width: 140,
      render: (owner?: string | null) => (
        owner
          ? <Tag color="purple">{owner}</Tag>
          : <Typography.Text type="secondary">—</Typography.Text>
      ),
    },
    {
      title: t.profile.lastUsed,
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      width: 150,
      render: (lastUsedAt?: string | null) => (
        lastUsedAt
          ? new Date(lastUsedAt).toLocaleDateString('vi-VN')
          : <Typography.Text type="secondary">—</Typography.Text>
      ),
    },
    {
      title: t.common.actions,
      key: 'actions',
      width: 210,
      render: (_, record) => {
        const isRunning = getProfileStatus(record.id) === 'running';
        return (
          <Space size={4}>
            {isRunning ? (
              <Tooltip title={t.profile.stopProfile}>
                <Button size="small" danger icon={<StopOutlined />} onClick={() => void handleStop(record.id)} />
              </Tooltip>
            ) : (
              <Tooltip title={t.profile.startProfile}>
                <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => void confirmAndStartProfiles([record.id])} />
              </Tooltip>
            )}
            <Tooltip title="Khởi động lại">
              <Button size="small" icon={<RedoOutlined />} onClick={() => void handleRestart(record.id)} />
            </Tooltip>
            <Tooltip title={t.profile.duplicateProfile}>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void handleClone(record)} />
            </Tooltip>
            <Tooltip title={t.profile.exportProfile}>
              <Button size="small" icon={<ExportOutlined />} onClick={() => handleExport(record.id)} />
            </Tooltip>
            <Popconfirm
              title={t.profile.deleteConfirm}
              onConfirm={() => void handleDelete(record.id)}
              okText={t.common.yes}
              cancelText={t.common.no}
            >
              <Tooltip title={t.common.delete}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={filtered}
      loading={loading}
      rowSelection={{
        selectedRowKeys: selectedIds,
        onChange: (keys) => setSelectedIds(keys as string[]),
      }}
      rowClassName={(_, index) => (index === highlightedIndex ? 'ant-table-row-selected' : '')}
      onRow={(record, index) => ({
        onClick: () => setHighlightedIndex(index ?? -1),
        onDoubleClick: () => openEdit(record.id),
      })}
      locale={{
        emptyText: (
          <Empty
            description={t.profile.noProfiles}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ),
      }}
      pagination={{ pageSize: 20, showSizeChanger: false }}
      size="small"
    />
  );
};
