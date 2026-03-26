import type { ExtensionBundle, Profile } from './types';

export interface BulkEditInput {
  group: string;
  owner: string;
  runtime?: string;
}

export function getFailingProxyProfiles(
  profiles: Profile[],
  ids: string[],
): Profile[] {
  return ids
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is Profile => Boolean(profile))
    .filter((profile) => profile.proxy?.lastCheckStatus === 'failing');
}

export function getUniqueTruthyValues(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function buildBulkEditPayload(input: BulkEditInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.group.trim()) {
    payload['group'] = input.group.trim();
  }
  if (input.owner.trim()) {
    payload['owner'] = input.owner.trim();
  }
  if (input.runtime) {
    payload['runtime'] = input.runtime;
  }

  return payload;
}

export function getSelectedProfiles(
  profiles: Profile[],
  ids: string[],
): Profile[] {
  return ids
    .map((id) => profiles.find((profile) => profile.id === id))
    .filter((profile): profile is Profile => Boolean(profile));
}

export function buildBulkApplyExtensionTargetProfiles(
  profiles: Profile[],
  selectedIds: string[],
): Profile[] {
  return getSelectedProfiles(profiles, selectedIds);
}

export function buildExtensionCategoryLookup(
  bundles: ExtensionBundle[],
): Map<string, ExtensionBundle> {
  return new Map(bundles.map((bundle) => [bundle.key, bundle]));
}

export interface ImportProfilePackageFile {
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface ImportProfilePackageFileLike {
  originFileObj?: ImportProfilePackageFile | null;
}

export interface ImportProfilePackageResult {
  successCount: number;
  failCount: number;
}

export interface ProxyTestSummary {
  total: number;
  healthy: number;
  failing: number;
}

export interface ApiActionResultLike {
  success: boolean;
  error?: string;
}

export interface FailingProxyConfirmDetails {
  count: number;
  previewNames: string;
  hasMore: boolean;
}

export function buildFailingProxyConfirmDetails(
  profiles: Profile[],
  previewLimit = 3,
): FailingProxyConfirmDetails {
  const previewProfiles = profiles.slice(0, previewLimit);
  return {
    count: profiles.length,
    previewNames: previewProfiles.map((profile) => profile.name).join(', '),
    hasMore: profiles.length > previewLimit,
  };
}

export function getImportProfilePackageFiles(
  files: Array<ImportProfilePackageFileLike | ImportProfilePackageFile>,
): ImportProfilePackageFile[] {
  return files
    .map((file) => ('originFileObj' in file ? file.originFileObj ?? null : file))
    .filter((file): file is ImportProfilePackageFile => Boolean(file));
}

export async function importProfilePackages(
  files: ImportProfilePackageFile[],
  importer: (file: ImportProfilePackageFile) => Promise<boolean>,
): Promise<ImportProfilePackageResult> {
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      if (await importer(file)) {
        successCount += 1;
      } else {
        failCount += 1;
      }
    } catch {
      failCount += 1;
    }
  }

  return { successCount, failCount };
}

export function getSelectedProfileProxyIds(
  profiles: Profile[],
  selectedIds: string[],
  getProfileProxyId: (profile: Profile) => string | undefined | null,
): string[] {
  return getUniqueTruthyValues(
    getSelectedProfiles(profiles, selectedIds).map((profile) => getProfileProxyId(profile)),
  );
}

export function resolveBulkAssignProxyValue(
  selection: string | undefined,
): string | null | undefined {
  if (selection === undefined) {
    return undefined;
  }

  return selection === '__NONE__' ? null : selection;
}

export function buildBulkAssignProxySuccessMessage(
  profileCount: number,
  proxyId: string | null,
): string {
  return proxyId
    ? `Đã gán proxy cho ${profileCount} hồ sơ`
    : `Đã gỡ proxy khỏi ${profileCount} hồ sơ`;
}

export function buildProxyTestSummaryMessage(summary: ProxyTestSummary): string {
  return `Đã test ${summary.total} proxy · OK ${summary.healthy} · FAIL ${summary.failing}`;
}

export function getFirstFailedActionResult<Result extends ApiActionResultLike>(
  results: Result[],
): Result | undefined {
  return results.find((result) => !result.success);
}

export function hasBulkEditChanges(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).length > 0;
}

export function hasBulkExtensionSelection(
  extensionIds: string[],
  extensionCategories: string[],
): boolean {
  return extensionIds.length > 0 || extensionCategories.length > 0;
}

export function buildBulkRestartSuccessMessage(profileCount: number): string {
  return `Đã restart ${profileCount} hồ sơ`;
}

export function buildBulkEditSuccessMessage(profileCount: number): string {
  return `Đã cập nhật ${profileCount} hồ sơ`;
}

export function buildBulkApplyExtensionSuccessMessage(profileCount: number): string {
  return `Đã gán extension cho ${profileCount} hồ sơ`;
}
