import React, { useState } from 'react';
import { Button, Input, Modal, Select, Space, Tag, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import ProfileForm from '../../../components/ProfileForm';
import { buildApiUrl } from '../../../api/client';
import { SHORTCUTS, type ProfileListState, useProfileListState } from '../useProfileListState';

interface ProfileModalsProps {
  state: ProfileListState;
}

export const ProfileModals: React.FC<ProfileModalsProps> = ({ state }) => {
  const [bundleSelectOpen, setBundleSelectOpen] = useState(false);
  const [extensionSelectOpen, setExtensionSelectOpen] = useState(false);
  const {
    t,
    drawerOpen,
    setDrawerOpen,
    editingId,
    fetchProfiles,
    importPackagesOpen,
    setImportPackagesOpen,
    handleImportProfilePackages,
    importPackageFiles,
    setImportPackageFiles,
    importingPackages,
    bulkEditOpen,
    setBulkEditOpen,
    handleBulkEditProfiles,
    bulkEditing,
    selectedIds,
    bulkEditGroup,
    setBulkEditGroup,
    bulkEditOwner,
    setBulkEditOwner,
    bulkEditRuntime,
    setBulkEditRuntime,
    runtimes,
    bulkExtensionsOpen,
    setBulkExtensionsOpen,
    handleBulkApplyExtensions,
    bulkApplyingExtensions,
    bulkExtensionCategories,
    setBulkExtensionCategories,
    extensionBundles,
    bulkExtensionIds,
    setBulkExtensionIds,
    enabledExtensions,
    shortcutsOpen,
    setShortcutsOpen,
    bulkCreateOpen,
    setBulkCreateOpen,
    handleBulkCreateProfiles,
    bulkCreateEntries,
    bulkCreating,
    bulkCreateText,
    setBulkCreateText,
    bulkCreateRuntime,
    setBulkCreateRuntime,
    bulkCreateProxyId,
    setBulkCreateProxyId,
    proxies,
  } = state;

  return (
    <>
      <ProfileForm
        open={drawerOpen}
        profileId={editingId}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          void fetchProfiles();
        }}
      />

      <Modal
        title="Import profile package"
        open={importPackagesOpen}
        onCancel={() => setImportPackagesOpen(false)}
        onOk={() => void handleImportProfilePackages()}
        okText={importPackageFiles.length > 0 ? `Import ${importPackageFiles.length}` : 'Import'}
        cancelText="Hủy"
        confirmLoading={importingPackages}
      >
        <Space direction="vertical" size={12} className="w-full">
          <Typography.Paragraph type="secondary" className="mb-0">
            Chọn các gói profile đã export từ Pro5 ở dạng <Typography.Text code>.zip</Typography.Text>.
            Hệ thống sẽ tạo profile mới với metadata, bookmarks, cookie jar và user data đi kèm.
          </Typography.Paragraph>
          <Upload.Dragger
            multiple
            accept=".zip"
            fileList={importPackageFiles}
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              setImportPackageFiles(fileList);
            }}
            onRemove={(file) => {
              setImportPackageFiles((current) => current.filter((item) => item.uid !== file.uid));
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Kéo thả hoặc chọn gói profile để import</p>
            <p className="ant-upload-hint">Có thể chọn nhiều file trong một lượt để tạo nhiều profile mới.</p>
          </Upload.Dragger>
        </Space>
      </Modal>

      <Modal
        title="Sửa metadata hàng loạt"
        open={bulkEditOpen}
        onCancel={() => setBulkEditOpen(false)}
        onOk={() => void handleBulkEditProfiles()}
        okText="Áp dụng"
        cancelText="Hủy"
        confirmLoading={bulkEditing}
      >
        <Space direction="vertical" size={12} className="w-full">
          <Typography.Text type="secondary">
            Các trường để trống sẽ được giữ nguyên cho {selectedIds.length} hồ sơ đã chọn.
          </Typography.Text>
          <Input
            value={bulkEditGroup}
            onChange={(event) => setBulkEditGroup(event.target.value)}
            placeholder="Nhóm mới"
          />
          <Input
            value={bulkEditOwner}
            onChange={(event) => setBulkEditOwner(event.target.value)}
            placeholder="Owner mới"
          />
          <Select
            value={bulkEditRuntime}
            onChange={setBulkEditRuntime}
            placeholder="Đổi runtime cho cả batch"
            allowClear
            className="w-full"
            options={[
              { label: 'Tự động', value: 'auto' },
              ...runtimes.map((runtime) => ({
                label: `${runtime.label ?? runtime.name ?? runtime.key}${runtime.available ? '' : ' (không khả dụng)'}`,
                value: runtime.key,
                disabled: !runtime.available,
              })),
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="Gán extension cho nhiều profile"
        open={bulkExtensionsOpen}
        onCancel={() => {
          setBundleSelectOpen(false);
          setExtensionSelectOpen(false);
          setBulkExtensionsOpen(false);
        }}
        onOk={() => void handleBulkApplyExtensions()}
        okText="Áp dụng"
        cancelText="Hủy"
        confirmLoading={bulkApplyingExtensions}
      >
        <Space direction="vertical" size={12} className="w-full">
          <Typography.Text type="secondary">
            Bundle và extension sẽ được thêm vào stack hiện có của {selectedIds.length} hồ sơ đã chọn.
          </Typography.Text>
          <Select
            mode="multiple"
            value={bulkExtensionCategories}
            open={bundleSelectOpen}
            onDropdownVisibleChange={(open) => {
              setBundleSelectOpen(open);
              if (open) {
                setExtensionSelectOpen(false);
              }
            }}
            onChange={(value) => {
              setBulkExtensionCategories(value);
              setBundleSelectOpen(false);
            }}
            placeholder="Chọn bundle extension theo use case"
            className="w-full"
            options={extensionBundles.map((bundle) => ({
              label: `${bundle.label} · ${bundle.extensionCount} extension`,
              value: bundle.key,
            }))}
          />
          <Select
            mode="multiple"
            value={bulkExtensionIds}
            open={extensionSelectOpen}
            onDropdownVisibleChange={(open) => {
              setExtensionSelectOpen(open);
              if (open) {
                setBundleSelectOpen(false);
              }
            }}
            onChange={(value) => {
              setBulkExtensionIds(value);
              setExtensionSelectOpen(false);
            }}
            placeholder="Chọn extension bổ sung cho batch"
            className="w-full"
            options={enabledExtensions.map((extension) => ({
              label: `${extension.name}${extension.version ? ` · v${extension.version}` : ''}`,
              value: extension.id,
            }))}
          />
          <Typography.Text type="secondary">
            Không ghi đè stack cũ. Hệ thống sẽ tự gộp thêm extension mới và loại bỏ id trùng.
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        title="Phím tắt"
        open={shortcutsOpen}
        onCancel={() => setShortcutsOpen(false)}
        footer={null}
        width={400}
      >
        <table className="modal-table">
          <tbody>
            {SHORTCUTS.map(({ key, desc }) => (
              <tr key={key} className="modal-table-row">
                <td className="modal-table-key-col">
                  <Tag className="font-mono">{key}</Tag>
                </td>
                <td className="modal-table-desc-col">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      <Modal
        title="Tạo profile hàng loạt"
        open={bulkCreateOpen}
        onCancel={() => setBulkCreateOpen(false)}
        onOk={() => void handleBulkCreateProfiles()}
        okText={bulkCreateEntries.length > 0 ? `Tạo ${bulkCreateEntries.length}` : 'Tạo'}
        cancelText="Hủy"
        confirmLoading={bulkCreating}
      >
        <Space direction="vertical" size={12} className="w-full">
          <Typography.Paragraph type="secondary" className="mb-0">
            Mỗi dòng là một profile. Định dạng:
            {' '}
            <Typography.Text code>name | group | owner | tag1,tag2 | notes</Typography.Text>
          </Typography.Paragraph>
          <Input.TextArea
            value={bulkCreateText}
            onChange={(event) => setBulkCreateText(event.target.value)}
            rows={8}
            placeholder={[
              'Facebook Warm 01 | Growth | owner-a | warm,fb | Main account',
              'Facebook Warm 02 | Growth | owner-a | warm,fb | Backup account',
              'TikTok Shop 01',
            ].join('\n')}
          />
          <Select
            value={bulkCreateRuntime}
            onChange={setBulkCreateRuntime}
            className="w-full"
            options={[
              { label: 'Tự động', value: 'auto' },
              ...runtimes.map((runtime) => ({
                label: `${runtime.label ?? runtime.name ?? runtime.key}${runtime.available ? '' : ' (không khả dụng)'}`,
                value: runtime.key,
                disabled: !runtime.available,
              })),
            ]}
          />
          <Select
            value={bulkCreateProxyId}
            onChange={setBulkCreateProxyId}
            placeholder="Gắn một proxy chung cho cả batch (tùy chọn)"
            allowClear
            className="w-full"
            options={proxies.map((proxy) => ({
              label: `[${proxy.type.toUpperCase()}] ${proxy.label?.trim() ? `${proxy.label} — ` : ''}${proxy.host}:${proxy.port}`,
              value: proxy.id,
            }))}
          />
          <Typography.Text type="secondary">Preview hợp lệ: {bulkCreateEntries.length} profile</Typography.Text>
        </Space>
      </Modal>
    </>
  );
};
