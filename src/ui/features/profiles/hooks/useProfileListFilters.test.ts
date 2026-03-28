import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, Instance } from '../types';

const mocks = vi.hoisted(() => ({
  stateCursor: 0,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  stateValues: [] as unknown[],
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useMemo: <T>(factory: () => T) => factory(),
  useState: <T>(initial: T) => {
    const setter = vi.fn();
    const value = (mocks.stateValues[mocks.stateCursor] as T | undefined) ?? initial;
    mocks.stateSetters[mocks.stateCursor] = setter;
    mocks.stateCursor += 1;
    return [value, setter] as const;
  },
}));

const profiles: Profile[] = [
  {
    id: 'profile-1',
    name: 'Alpha',
    notes: 'Launch-ready account',
    group: 'Growth',
    owner: 'Alice',
    tags: ['team-a'],
    proxy: {
      id: 'proxy-1',
      type: 'http',
      host: '1.1.1.1',
      port: 8080,
      lastCheckStatus: 'healthy',
    },
    extensionIds: [],
    status: 'stopped',
    totalSessions: 3,
    schemaVersion: 1,
  },
  {
    id: 'profile-2',
    name: 'Beta',
    notes: 'Fallback operator',
    group: null,
    owner: null,
    tags: ['team-b'],
    proxyId: 'proxy-2',
    extensionIds: [],
    status: 'stopped',
    totalSessions: 1,
    schemaVersion: 1,
  },
];

const instances: Record<string, Instance> = {
  'profile-1': {
    profileId: 'profile-1',
    status: 'running',
  },
};

describe('useProfileListFilters', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.stateCursor = 0;
    mocks.stateSetters = [];
    mocks.stateValues = [];
  });

  it('derives default filtered lists, stats, and lookup helpers from the full profile collection', async () => {
    const { useProfileListFilters } = await import('./useProfileListFilters');
    const hook = useProfileListFilters(profiles, instances);

    expect(hook.filtered).toHaveLength(2);
    expect(hook.stats).toEqual({
      runningCount: 1,
      groupedCount: 1,
      taggedCount: 2,
      proxiedCount: 2,
      healthyProxyCount: 1,
      failingProxyCount: 0,
      totalCount: 2,
      filteredCount: 2,
    });
    expect(hook.groups).toEqual(['Growth']);
    expect(hook.owners).toEqual(['Alice']);
    expect(hook.tags).toEqual(['team-a', 'team-b']);
    expect(hook.getProfileStatus('profile-1')).toBe('running');
    expect(hook.getProfileStatus('missing')).toBe('stopped');
    expect(hook.getProfileProxyId(profiles[1]!)).toBe('proxy-2');
  });

  it('applies search, group, status, tag, owner, and proxy-health filters together', async () => {
    mocks.stateValues = ['alpha', 'Growth', 'running', 'team-a', 'Alice', 'healthy'];

    const { useProfileListFilters } = await import('./useProfileListFilters');
    const hook = useProfileListFilters(profiles, instances);

    expect(hook.filtered).toEqual([profiles[0]]);
    expect(hook.stats.filteredCount).toBe(1);
  });
});
