import { useRef, useState } from 'react';
import type { InputRef } from 'antd';
import { UploadFile } from 'antd/es/upload/interface';

export function useProfileListUIState() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkCreateText, setBulkCreateText] = useState('');
  const [bulkCreateRuntime, setBulkCreateRuntime] = useState<string>('auto');
  const [bulkCreateProxyId, setBulkCreateProxyId] = useState<string | undefined>();
  const [bulkCreating, setBulkCreating] = useState(false);
  
  const [importPackagesOpen, setImportPackagesOpen] = useState(false);
  const [importPackageFiles, setImportPackageFiles] = useState<UploadFile[]>([]);
  const [importingPackages, setImportingPackages] = useState(false);
  
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditGroup, setBulkEditGroup] = useState('');
  const [bulkEditClearGroup, setBulkEditClearGroup] = useState(false);
  const [bulkEditOwner, setBulkEditOwner] = useState('');
  const [bulkEditClearOwner, setBulkEditClearOwner] = useState(false);
  const [bulkEditRuntime, setBulkEditRuntime] = useState<string | undefined>();
  const [bulkEditAddTags, setBulkEditAddTags] = useState<string[]>([]);
  const [bulkEditRemoveTags, setBulkEditRemoveTags] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  
  const [bulkExtensionsOpen, setBulkExtensionsOpen] = useState(false);
  const [bulkExtensionIds, setBulkExtensionIds] = useState<string[]>([]);
  const [bulkExtensionCategories, setBulkExtensionCategories] = useState<string[]>([]);
  const [bulkApplyingExtensions, setBulkApplyingExtensions] = useState(false);
  
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkProxySelection, setBulkProxySelection] = useState<string | undefined>();
  const [bulkProxyTesting, setBulkProxyTesting] = useState(false);
  const searchRef = useRef<InputRef>(null);

  return {
    drawerOpen, setDrawerOpen,
    editingId, setEditingId,
    bulkCreateOpen, setBulkCreateOpen,
    bulkCreateText, setBulkCreateText,
    bulkCreateRuntime, setBulkCreateRuntime,
    bulkCreateProxyId, setBulkCreateProxyId,
    bulkCreating, setBulkCreating,
    importPackagesOpen, setImportPackagesOpen,
    importPackageFiles, setImportPackageFiles,
    importingPackages, setImportingPackages,
    bulkEditOpen, setBulkEditOpen,
    bulkEditGroup, setBulkEditGroup,
    bulkEditClearGroup, setBulkEditClearGroup,
    bulkEditOwner, setBulkEditOwner,
    bulkEditClearOwner, setBulkEditClearOwner,
    bulkEditRuntime, setBulkEditRuntime,
    bulkEditAddTags, setBulkEditAddTags,
    bulkEditRemoveTags, setBulkEditRemoveTags,
    bulkEditing, setBulkEditing,
    bulkExtensionsOpen, setBulkExtensionsOpen,
    bulkExtensionIds, setBulkExtensionIds,
    bulkExtensionCategories, setBulkExtensionCategories,
    bulkApplyingExtensions, setBulkApplyingExtensions,
    shortcutsOpen, setShortcutsOpen,
    wizardOpen, setWizardOpen,
    highlightedIndex, setHighlightedIndex,
    selectedIds, setSelectedIds,
    bulkProxySelection, setBulkProxySelection,
    bulkProxyTesting, setBulkProxyTesting,
    searchRef,
  };
}
