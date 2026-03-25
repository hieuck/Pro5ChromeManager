import { useCallback, useMemo, useState } from 'react';
import { Profile, Instance } from '../types';

export function useProfileListFilters(profiles: Profile[], instances: Record<string, Instance>) {
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterTag, setFilterTag] = useState<string | undefined>();
  const [filterOwner, setFilterOwner] = useState<string | undefined>();
  const [filterProxyHealth, setFilterProxyHealth] = useState<string | undefined>();

  const getProfileStatus = useCallback((profileId: string): Profile['status'] => {
    return instances[profileId]?.status ?? 'stopped';
  }, [instances]);

  const getProfileProxyId = useCallback((profile: Profile): string | undefined => {
    return profile.proxyId ?? profile.proxy?.id;
  }, []);

  const filtered = useMemo(() => {
    return profiles.filter((profile) => {
      const normalizedSearch = search.trim().toLowerCase();
      const status = getProfileStatus(profile.id);
      const proxyHealth = profile.proxy?.lastCheckStatus ?? 'none';
      const joinedTags = (profile.tags ?? []).join(' ').toLowerCase();

      const matchSearch = !normalizedSearch ||
        profile.name.toLowerCase().includes(normalizedSearch) ||
        (profile.notes ?? '').toLowerCase().includes(normalizedSearch) ||
        (profile.group ?? '').toLowerCase().includes(normalizedSearch) ||
        (profile.owner ?? '').toLowerCase().includes(normalizedSearch) ||
        joinedTags.includes(normalizedSearch);

      const matchGroup = !filterGroup || profile.group === filterGroup;
      const matchStatus = !filterStatus || status === filterStatus;
      const matchTag = !filterTag || (profile.tags ?? []).includes(filterTag);
      const matchOwner = !filterOwner || profile.owner === filterOwner;
      const matchProxyHealth = !filterProxyHealth || proxyHealth === filterProxyHealth;

      return matchSearch && matchGroup && matchStatus && matchTag && matchOwner && matchProxyHealth;
    });
  }, [profiles, search, filterGroup, filterStatus, filterTag, filterOwner, filterProxyHealth, getProfileStatus]);

  const stats = useMemo(() => {
    const runningCount = profiles.filter((p) => getProfileStatus(p.id) === 'running').length;
    const groupedCount = profiles.filter((profile) => Boolean(profile.group)).length;
    const taggedCount = profiles.filter((profile) => (profile.tags ?? []).length > 0).length;
    const proxiedCount = profiles.filter((profile) => Boolean(getProfileProxyId(profile))).length;
    const healthyProxyCount = profiles.filter((p) => p.proxy?.lastCheckStatus === 'healthy').length;
    const failingProxyCount = profiles.filter((p) => p.proxy?.lastCheckStatus === 'failing').length;

    return {
      runningCount,
      groupedCount,
      taggedCount,
      proxiedCount,
      healthyProxyCount,
      failingProxyCount,
      totalCount: profiles.length,
      filteredCount: filtered.length,
    };
  }, [profiles, filtered.length, getProfileStatus, getProfileProxyId]);

  const groups = useMemo(() => Array.from(new Set(
    profiles
      .map((profile) => profile.group)
      .filter((group): group is string => Boolean(group)),
  )), [profiles]);

  const owners = useMemo(() => Array.from(new Set(
    profiles
      .map((profile) => profile.owner)
      .filter((owner): owner is string => Boolean(owner)),
  )), [profiles]);

  const tags = useMemo(() => Array.from(new Set(
    profiles.flatMap((profile) => profile.tags ?? []),
  )), [profiles]);

  return {
    search,
    filterGroup,
    filterStatus,
    filterTag,
    filterOwner,
    filterProxyHealth,
    filtered,
    stats,
    groups,
    owners,
    tags,
    setSearch,
    setFilterGroup,
    setFilterStatus,
    setFilterTag,
    setFilterOwner,
    setFilterProxyHealth,
    getProfileStatus,
    getProfileProxyId,
  };
}
