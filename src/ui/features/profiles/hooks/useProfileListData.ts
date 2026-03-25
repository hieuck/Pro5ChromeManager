import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../api/client';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';
import { Profile, ProxyOption, RuntimeOption, ExtensionRecord, ExtensionBundle, Instance } from '../types';

export function useProfileListData() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [proxies, setProxies] = useState<ProxyOption[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeOption[]>([]);
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [extensionBundles, setExtensionBundles] = useState<ExtensionBundle[]>([]);
  const [instances, setInstances] = useState<Record<string, Instance>>({});
  const [loading, setLoading] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<Profile[]>('/api/profiles');
    if (res.success) {
      setProfiles(res.data);
    }
    setLoading(false);
  }, []);

  const fetchProxies = useCallback(async () => {
    const res = await apiClient.get<ProxyOption[]>('/api/proxies');
    if (res.success) {
      setProxies(res.data);
    }
  }, []);

  const fetchInstances = useCallback(async () => {
    const res = await apiClient.get<Instance[]>('/api/instances');
    if (res.success) {
      const nextInstances: Record<string, Instance> = {};
      for (const instance of res.data) {
        nextInstances[instance.profileId] = instance;
      }
      setInstances(nextInstances);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await apiClient.get<{ onboardingCompleted: boolean }>('/api/config');
    if (res.success) {
      setOnboardingCompleted(res.data.onboardingCompleted);
    }
  }, []);

  const fetchExtensions = useCallback(async () => {
    const [extensionRes, bundleRes] = await Promise.all([
      apiClient.get<ExtensionRecord[]>('/api/extensions'),
      apiClient.get<ExtensionBundle[]>('/api/extensions/bundles'),
    ]);

    if (extensionRes.success) {
      setExtensions(extensionRes.data);
    }

    if (bundleRes.success) {
      setExtensionBundles(bundleRes.data);
    }
  }, []);

  const fetchRuntimes = useCallback(async (): Promise<RuntimeOption[]> => {
    const res = await apiClient.get<RuntimeOption[]>('/api/runtimes');
    if (!res.success) {
      return [];
    }
    setRuntimes(res.data);
    return res.data;
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchProfiles(),
      fetchProxies(),
      fetchInstances(),
      fetchConfig(),
      fetchRuntimes(),
      fetchExtensions(),
    ]);
  }, [fetchConfig, fetchExtensions, fetchInstances, fetchProfiles, fetchProxies, fetchRuntimes]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useWebSocket((event) => {
    if (
      event.type === 'instance:started' ||
      event.type === 'instance:stopped' ||
      event.type === 'instance:status-changed'
    ) {
      void fetchInstances();
      void fetchProfiles();
    }
  });

  return {
    profiles,
    proxies,
    runtimes,
    extensions,
    extensionBundles,
    instances,
    loading,
    onboardingCompleted,
    setProfiles,
    setProxies,
    setOnboardingCompleted,
    fetchProfiles,
    fetchProxies,
    fetchInstances,
    fetchRuntimes,
    refreshAll,
  };
}
