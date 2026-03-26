import { describe, expect, it } from 'vitest';
import {
  buildBulkApplyExtensionSuccessMessage,
  buildBulkAssignProxySuccessMessage,
  buildBulkApplyExtensionTargetProfiles,
  buildBulkCreateSuccessMessage,
  buildBulkEditPayload,
  buildBulkEditSuccessMessage,
  buildFailingProxyConfirmDetails,
  buildBulkRestartSuccessMessage,
  buildExtensionCategoryLookup,
  buildImportProfilePackagesFailureMessage,
  buildImportProfilePackagesSuccessMessage,
  buildProxyTestSummaryMessage,
  createBulkCreateResetState,
  createOpenBulkCreateState,
  createOpenBulkEditState,
  createOpenBulkExtensionsState,
  createOpenImportPackagesState,
  createImportPackagesResetState,
  getFirstFailedActionResult,
  getFailingProxyProfiles,
  getImportProfilePackageFiles,
  getSelectedProfileProxyIds,
  getSelectedProfiles,
  getUniqueTruthyValues,
  hasAvailableRuntime,
  hasBulkCreateEntries,
  hasBulkEditChanges,
  hasBulkExtensionSelection,
  importProfilePackages,
  resolveBulkAssignProxyValue,
} from './profileListAction.utils';
import type { ExtensionBundle, Profile } from './types';

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-1',
    name: 'Profile 1',
    tags: [],
    extensionIds: [],
    status: 'stopped',
    totalSessions: 0,
    schemaVersion: 1,
    ...overrides,
  };
}

describe('profileListAction utils', () => {
  it('finds failing proxy profiles from a selected id set', () => {
    const profiles = [
      createProfile({ id: 'a', proxy: { id: 'p1', host: '1.1.1.1', port: 80, type: 'http', lastCheckStatus: 'failing' } }),
      createProfile({ id: 'b', proxy: { id: 'p2', host: '2.2.2.2', port: 80, type: 'http', lastCheckStatus: 'healthy' } }),
      createProfile({ id: 'c', proxy: null }),
    ];

    expect(getFailingProxyProfiles(profiles, ['a', 'b', 'x']).map((profile) => profile.id)).toEqual(['a']);
  });

  it('builds compact bulk edit payloads and unique value lists', () => {
    expect(buildBulkEditPayload({ group: ' Team A ', owner: '', runtime: 'chrome' })).toEqual({
      group: 'Team A',
      runtime: 'chrome',
    });
    expect(buildBulkEditPayload({ group: ' ', owner: ' ', runtime: undefined })).toEqual({});
    expect(getUniqueTruthyValues(['p1', undefined, 'p2', 'p1', null])).toEqual(['p1', 'p2']);
  });

  it('returns selected profiles and extension bundle lookup maps', () => {
    const profiles = [
      createProfile({ id: 'a' }),
      createProfile({ id: 'b' }),
    ];
    const bundles: ExtensionBundle[] = [
      { key: 'wallet', label: 'Wallet', extensionIds: ['e1'], extensionCount: 1 },
    ];

    expect(getSelectedProfiles(profiles, ['b', 'x']).map((profile) => profile.id)).toEqual(['b']);
    expect(buildBulkApplyExtensionTargetProfiles(profiles, ['a']).map((profile) => profile.id)).toEqual(['a']);
    expect(buildExtensionCategoryLookup(bundles).get('wallet')?.label).toBe('Wallet');
  });

  it('builds failing proxy confirm details and extracts importable files', () => {
    const profiles = [
      createProfile({ id: 'a', name: 'Alpha' }),
      createProfile({ id: 'b', name: 'Beta' }),
      createProfile({ id: 'c', name: 'Gamma' }),
      createProfile({ id: 'd', name: 'Delta' }),
    ];

    const details = buildFailingProxyConfirmDetails(profiles);
    const extracted = getImportProfilePackageFiles([
      { originFileObj: { name: 'a.zip', arrayBuffer: async () => new ArrayBuffer(1) } },
      { name: 'b.zip', arrayBuffer: async () => new ArrayBuffer(1) },
      { originFileObj: null },
    ]);

    expect(details).toEqual({
      count: 4,
      previewNames: 'Alpha, Beta, Gamma',
      hasMore: true,
    });
    expect(extracted.map((file) => file.name)).toEqual(['a.zip', 'b.zip']);
  });

  it('imports profile packages via injected importer and counts failures', async () => {
    const files = [
      { name: 'ok.zip', arrayBuffer: async () => new ArrayBuffer(1) },
      { name: 'fail.zip', arrayBuffer: async () => new ArrayBuffer(1) },
      { name: 'throw.zip', arrayBuffer: async () => new ArrayBuffer(1) },
    ];

    const result = await importProfilePackages(files, async (file) => {
      if (file.name === 'throw.zip') {
        throw new Error('boom');
      }
      return file.name === 'ok.zip';
    });

    expect(result).toEqual({ successCount: 1, failCount: 2 });
  });

  it('builds proxy bulk helpers from selected profiles', () => {
    const profiles = [
      createProfile({ id: 'a', proxy: { id: 'p1', host: '1.1.1.1', port: 80, type: 'http' } }),
      createProfile({ id: 'b', proxy: { id: 'p2', host: '2.2.2.2', port: 80, type: 'http' } }),
      createProfile({ id: 'c', proxy: { id: 'p1', host: '1.1.1.1', port: 80, type: 'http' } }),
    ];

    expect(getSelectedProfileProxyIds(profiles, ['a', 'c', 'x'], (profile) => profile.proxy?.id)).toEqual(['p1']);
    expect(resolveBulkAssignProxyValue('__NONE__')).toBeNull();
    expect(resolveBulkAssignProxyValue('proxy-1')).toBe('proxy-1');
    expect(resolveBulkAssignProxyValue(undefined)).toBeUndefined();
    expect(buildBulkAssignProxySuccessMessage(2, 'proxy-1')).toBe('Đã gán proxy cho 2 hồ sơ');
    expect(buildBulkAssignProxySuccessMessage(2, null)).toBe('Đã gỡ proxy khỏi 2 hồ sơ');
    expect(buildProxyTestSummaryMessage({ total: 3, healthy: 2, failing: 1 })).toBe('Đã test 3 proxy · OK 2 · FAIL 1');
  });

  it('builds bulk action guards and success messages', () => {
    expect(hasBulkCreateEntries([])).toBe(false);
    expect(hasBulkCreateEntries([{}])).toBe(true);
    expect(hasBulkEditChanges({})).toBe(false);
    expect(hasBulkEditChanges({ group: 'Team A' })).toBe(true);
    expect(hasBulkExtensionSelection([], [])).toBe(false);
    expect(hasBulkExtensionSelection(['ext-1'], [])).toBe(true);
    expect(buildBulkCreateSuccessMessage(2)).toBe('Đã tạo 2 hồ sơ');
    expect(buildBulkRestartSuccessMessage(2)).toBe('Đã restart 2 hồ sơ');
    expect(buildBulkEditSuccessMessage(2)).toBe('Đã cập nhật 2 hồ sơ');
    expect(buildBulkApplyExtensionSuccessMessage(2)).toBe('Đã gán extension cho 2 hồ sơ');
    expect(buildImportProfilePackagesSuccessMessage(2)).toBe('Đã import 2 gói profile');
    expect(buildImportProfilePackagesFailureMessage(1)).toBe('1 gói profile import thất bại');
    expect(createBulkCreateResetState()).toEqual({
      text: '',
      runtime: 'auto',
      proxyId: undefined,
      open: false,
    });
    expect(createImportPackagesResetState()).toEqual({
      files: [],
      open: false,
    });
    expect(createOpenBulkCreateState()).toEqual({
      text: '',
      runtime: 'auto',
      proxyId: undefined,
      open: true,
    });
    expect(createOpenImportPackagesState()).toEqual({
      files: [],
      open: true,
    });
    expect(createOpenBulkEditState()).toEqual({
      group: '',
      clearGroup: false,
      owner: '',
      clearOwner: false,
      runtime: undefined,
      addTags: [],
      removeTags: [],
      open: true,
    });
    expect(createOpenBulkExtensionsState()).toEqual({
      extensionIds: [],
      extensionCategories: [],
      open: true,
    });
    expect(hasAvailableRuntime([{ key: 'chrome', available: false }])).toBe(false);
    expect(hasAvailableRuntime([{ key: 'chrome', available: false }, { key: 'edge', available: true }])).toBe(true);
    expect(getFirstFailedActionResult([{ success: true }, { success: false, error: 'boom' }])).toEqual({
      success: false,
      error: 'boom',
    });
  });
});
