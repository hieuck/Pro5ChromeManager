import { describe, expect, it } from 'vitest';
import { parseBulkProfileDrafts } from './bulkProfiles';

describe('parseBulkProfileDrafts', () => {
  it('parses one profile per line with optional pipe-delimited fields', () => {
    expect(parseBulkProfileDrafts([
      'Alpha',
      'Beta | Growth | owner-1 | vip, warm | Main account',
    ].join('\n'))).toEqual([
      {
        name: 'Alpha',
        group: null,
        owner: null,
        tags: [],
        notes: '',
      },
      {
        name: 'Beta',
        group: 'Growth',
        owner: 'owner-1',
        tags: ['vip', 'warm'],
        notes: 'Main account',
      },
    ]);
  });

  it('ignores empty and comment lines', () => {
    expect(parseBulkProfileDrafts([
      '',
      '   ',
      '# comment',
      'Gamma | Ops',
    ].join('\n'))).toEqual([
      {
        name: 'Gamma',
        group: 'Ops',
        owner: null,
        tags: [],
        notes: '',
      },
    ]);
  });
});
