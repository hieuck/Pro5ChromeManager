import { describe, expect, it } from 'vitest';
import {
  buildBulkApplyExtensionTargetProfiles,
  buildBulkEditPayload,
  buildFailingProxyConfirmDetails,
  buildExtensionCategoryLookup,
  getFailingProxyProfiles,
  getImportProfilePackageFiles,
  getSelectedProfiles,
  getUniqueTruthyValues,
  importProfilePackages,
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
});
