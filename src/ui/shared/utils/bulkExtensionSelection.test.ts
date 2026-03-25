import { describe, expect, it } from 'vitest';
import { mergeBulkExtensionSelection } from './bulkExtensionSelection';

describe('mergeBulkExtensionSelection', () => {
  it('keeps existing extensions and adds selected bundle categories and ids', () => {
    expect(mergeBulkExtensionSelection({
      currentExtensionIds: ['existing-1'],
      selectedExtensionIds: ['manual-1'],
      selectedCategories: ['wallet'],
      bundles: [
        {
          key: 'wallet',
          label: 'wallet',
          extensionIds: ['bundle-1', 'bundle-2'],
          extensionCount: 2,
        },
      ],
    })).toEqual(['existing-1', 'manual-1', 'bundle-1', 'bundle-2']);
  });

  it('ignores duplicate ids and unknown categories', () => {
    expect(mergeBulkExtensionSelection({
      currentExtensionIds: ['same-id'],
      selectedExtensionIds: ['same-id', 'manual-2'],
      selectedCategories: ['wallet', 'missing'],
      bundles: [
        {
          key: 'wallet',
          label: 'wallet',
          extensionIds: ['same-id', 'bundle-3'],
          extensionCount: 2,
        },
      ],
    })).toEqual(['same-id', 'manual-2', 'bundle-3']);
  });
});
