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
