import React from 'react';
import { Button, Col, Input, Popconfirm, Row, Select, Space, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RedoOutlined,
  SearchOutlined,
  StopOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { useProfileListState, type ProfileListState } from '../useProfileListState';

interface ProfileToolbarProps {
  state: ProfileListState;
}

export const ProfileToolbar: React.FC<ProfileToolbarProps> = ({ state }) => {
  const {
    t,
    openCreate,
    openImportPackages,
    openBulkCreate,
    searchRef,
    search,
    setSearch,
    filterGroup,
    setFilterGroup,
    groups,
    filterStatus,
    setFilterStatus,
    filterTag,
    setFilterTag,
    tags,
    filterOwner,
    setFilterOwner,
    owners,
    filterProxyHealth,
    setFilterProxyHealth,
    fetchProfiles,
    fetchProxies,
    fetchInstances,
    setShortcutsOpen,
    showingResults,
    selectFilteredProfiles,
    filtered,
    selectFilteredRunningProfiles,
    getProfileStatus,
    clearSelection,
    selectedIds,
    bulkProxyTesting,
    handleBulkTestSelectedProxies,
    bulkProxySelection,
    setBulkProxySelection,
    proxies,
    handleBulkAssignProxy,
    openBulkExtensions,
    openBulkEdit,
    handleBulkRestart,
    handleBulkStart,
    handleBulkStop,
    handleBulkDelete,
  } = state;

  return (
    <>
      <Row gutter={[16, 16]} className="mb-16">
        <Col span={24}>
          <div className="page-header-card">
            <Row gutter={[24, 24]} align="middle">
              <Col flex="auto">
                <Typography.Title level={3} className="page-title">
                  {t.profile.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" className="page-subtitle">
                  {t.profile.workspaceSubtitle}
                </Typography.Paragraph>
              </Col>
              <Col>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t.profile.newProfile} (Ctrl+N)
                </Button>
                <Button className="ml-8" icon={<ImportOutlined />} onClick={openImportPackages}>
                  Import package
                </Button>
                <Button className="ml-8" onClick={openBulkCreate}>
                  Tạo hàng loạt
                </Button>
              </Col>
            </Row>
          </div>
        </Col>
      </Row>

      <Row gutter={[12, 12]} className="mb-16" align="middle">
        <Col flex="auto">
          <Space wrap>
            <Input
              ref={searchRef}
              placeholder={`${t.common.search} (Ctrl+F)`}
              prefix={<SearchOutlined />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              allowClear
              className="toolbar-search-input"
            />
            <Select
              placeholder={t.common.group}
              allowClear
              value={filterGroup}
              onChange={setFilterGroup}
              className="toolbar-select-small"
              options={groups.map((group) => ({ label: group, value: group }))}
            />
            <Select
              placeholder={t.common.status}
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              className="toolbar-select-small"
              options={[
                { label: t.profile.running, value: 'running' },
                { label: t.profile.stopped, value: 'stopped' },
                { label: t.profile.unreachable, value: 'unreachable' },
              ]}
            />
            <Select
              placeholder={t.profile.tagFilter}
              allowClear
              value={filterTag}
              onChange={setFilterTag}
              className="toolbar-select-medium"
              options={tags.map((tag) => ({ label: tag, value: tag }))}
            />
            <Select
              placeholder={t.profile.ownerFilter}
              allowClear
              value={filterOwner}
              onChange={setFilterOwner}
              className="toolbar-select-medium"
              options={owners.map((owner) => ({ label: owner, value: owner }))}
            />
            <Select
              placeholder="Sức khỏe proxy"
              allowClear
              value={filterProxyHealth}
              onChange={setFilterProxyHealth}
              className="toolbar-select-medium"
              options={[
                { label: 'Healthy', value: 'healthy' },
                { label: 'Needs check', value: 'failing' },
                { label: 'Không có proxy', value: 'none' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { void fetchProfiles(); void fetchProxies(); void fetchInstances(); }} />
            <Tooltip title="Phím tắt (?)">
              <Button icon={<QuestionCircleOutlined />} onClick={() => setShortcutsOpen(true)} />
            </Tooltip>
          </Space>
        </Col>
      </Row>

      <Row justify="space-between" align="middle" className="mb-12">
        <Col>
          <Space wrap>
            <Typography.Text type="secondary">{showingResults}</Typography.Text>
            <Button size="small" onClick={selectFilteredProfiles} disabled={filtered.length === 0}>
              Chọn tất cả kết quả lọc
            </Button>
            <Button size="small" onClick={selectFilteredRunningProfiles} disabled={filtered.every((profile) => getProfileStatus(profile.id) !== 'running')}>
              Chọn đang chạy
            </Button>
            <Button size="small" onClick={clearSelection} disabled={selectedIds.length === 0}>
              Bỏ chọn
            </Button>
          </Space>
        </Col>
        <Col>
          {selectedIds.length > 0 ? (
            <Space wrap>
              <Typography.Text type="secondary">Đã chọn {selectedIds.length}</Typography.Text>
              <Button
                size="small"
                loading={bulkProxyTesting}
                onClick={() => void handleBulkTestSelectedProxies()}
              >
                Test proxy đã chọn
              </Button>
              <Select
                value={bulkProxySelection}
                onChange={setBulkProxySelection}
                placeholder="Gán hoặc gỡ proxy"
                allowClear
                className="toolbar-select-large"
                options={[
                  { label: 'Gỡ proxy khỏi các hồ sơ đã chọn', value: '__NONE__' },
                  ...proxies.map((proxy) => ({
                    label: `[${proxy.type.toUpperCase()}] ${proxy.label?.trim() ? `${proxy.label} — ` : ''}${proxy.host}:${proxy.port}`,
                    value: proxy.id,
                  })),
                ]}
              />
              <Button
                size="small"
                onClick={() => void handleBulkAssignProxy()}
                disabled={bulkProxySelection === undefined}
              >
                Áp dụng proxy
              </Button>
              <Button size="small" onClick={openBulkExtensions}>
                Gán extension
              </Button>
              <Button size="small" onClick={openBulkEdit}>
                Sửa metadata
              </Button>
              <Button size="small" icon={<RedoOutlined />} onClick={() => void handleBulkRestart()}>
                Restart đã chọn
              </Button>
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => void handleBulkStart()}>
                {t.profile.bulkStart}
              </Button>
              <Button size="small" danger icon={<StopOutlined />} onClick={() => void handleBulkStop()}>
                {t.profile.bulkStop}
              </Button>
              <Popconfirm
                title={`Xóa ${selectedIds.length} hồ sơ đã chọn?`}
                onConfirm={() => void handleBulkDelete()}
                okText={t.common.yes}
                cancelText={t.common.no}
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  {t.profile.bulkDelete}
                </Button>
              </Popconfirm>
            </Space>
          ) : null}
        </Col>
      </Row>
    </>
  );
};
