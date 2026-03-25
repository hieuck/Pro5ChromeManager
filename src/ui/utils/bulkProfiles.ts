export interface BulkProfileDraft {
  name: string;
  group?: string | null;
  owner?: string | null;
  tags?: string[];
  notes?: string;
}

export function parseBulkProfileDrafts(input: string): BulkProfileDraft[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [name, group, owner, tags, notes] = line.split('|').map((part) => part.trim());
      return {
        name,
        group: group || null,
        owner: owner || null,
        tags: tags ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
        notes: notes ?? '',
      };
    })
    .filter((draft) => draft.name.length > 0);
}
