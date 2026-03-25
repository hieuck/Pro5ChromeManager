export interface ExtensionBundleSelection {
  key: string;
  label: string;
  extensionIds: string[];
  extensionCount: number;
}

interface MergeBulkExtensionSelectionInput {
  currentExtensionIds: string[];
  selectedExtensionIds: string[];
  selectedCategories: string[];
  bundles: ExtensionBundleSelection[];
}

export function mergeBulkExtensionSelection(input: MergeBulkExtensionSelectionInput): string[] {
  const merged = new Set(input.currentExtensionIds);
  const normalizedCategories = new Set(
    input.selectedCategories
      .map((category) => category.trim().toLowerCase())
      .filter(Boolean),
  );

  for (const extensionId of input.selectedExtensionIds) {
    if (extensionId.trim()) {
      merged.add(extensionId);
    }
  }

  for (const bundle of input.bundles) {
    if (!normalizedCategories.has(bundle.key.trim().toLowerCase())) {
      continue;
    }

    for (const extensionId of bundle.extensionIds) {
      if (extensionId.trim()) {
        merged.add(extensionId);
      }
    }
  }

  return Array.from(merged);
}
