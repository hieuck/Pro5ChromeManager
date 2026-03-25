import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardProfile, DashboardProxy, RuntimeEntry, SupportStatus, SetupChecklistItem, NextStepAction } from './types';

export function useDashboardSetup(
  availableRuntimes: RuntimeEntry[],
  runtimes: RuntimeEntry[],
  profiles: DashboardProfile[],
  healthyProxies: number,
  proxies: DashboardProxy[],
  failingProxyIds: string[],
  launchReadyProfiles: DashboardProfile[],
  activeProfiles: DashboardProfile[],
  support: SupportStatus | null,
  t: any,
  handleOpenOnboarding: () => void,
  handleOpenCreateProfile: () => void,
  handleRetestAllFailingProxies: () => void,
  handleStartAllReadyProfiles: () => void
) {
  const navigate = useNavigate();

  const setupChecklist = useMemo<SetupChecklistItem[]>(() => [
    {
      key: 'runtime',
      label: t.dashboard.checkRuntime,
      done: availableRuntimes.length > 0,
      detail: availableRuntimes.length
        ? `${t.dashboard.runtimeReadyCount}: ${availableRuntimes.length}/${runtimes.length}`
        : t.dashboard.runtimeActionHint,
      actionLabel: availableRuntimes.length ? t.dashboard.reviewOnboarding : t.dashboard.fixRuntimeSetup,
      onAction: handleOpenOnboarding,
    },
    {
      key: 'profile',
      label: t.dashboard.checkProfile,
      done: profiles.length > 0,
      detail: profiles.length
        ? `${t.dashboard.totalProfiles}: ${profiles.length}`
        : t.dashboard.checkProfileHint,
      actionLabel: profiles.length ? t.dashboard.openProfiles : t.dashboard.createFirstProfile,
      onAction: () => { profiles.length ? navigate('/profiles') : handleOpenCreateProfile(); },
    },
    {
      key: 'proxy',
      label: t.dashboard.checkProxy,
      done: healthyProxies > 0,
      detail: healthyProxies
        ? `${t.dashboard.healthyProxies}: ${healthyProxies}/${proxies.length}`
        : t.dashboard.checkProxyHint,
      actionLabel: failingProxyIds.length ? t.dashboard.retestAllFailing : t.dashboard.openProxies,
      onAction: () => {
        if (failingProxyIds.length) {
          handleRetestAllFailingProxies();
          return;
        }
        navigate('/proxies');
      },
    },
  ], [
    availableRuntimes.length,
    failingProxyIds.length,
    handleOpenCreateProfile,
    handleOpenOnboarding,
    handleRetestAllFailingProxies,
    healthyProxies,
    navigate,
    profiles.length,
    proxies.length,
    runtimes.length,
    t.dashboard
  ]);

  const nextStep = useMemo<NextStepAction | null>(() => {
    const pendingSetup = setupChecklist.find((item) => !item.done);
    if (pendingSetup) {
      return {
        title: pendingSetup.label,
        detail: pendingSetup.detail,
        actionLabel: pendingSetup.actionLabel,
        onAction: pendingSetup.onAction,
      };
    }

    if (failingProxyIds.length) {
      return {
        title: t.dashboard.nextStepProxyTitle,
        detail: `${t.dashboard.nextStepProxyHint}: ${failingProxyIds.length}`,
        actionLabel: t.dashboard.retestAllFailing,
        onAction: handleRetestAllFailingProxies,
      };
    }

    if (launchReadyProfiles.length) {
      return {
        title: t.dashboard.nextStepLaunchTitle,
        detail: `${t.dashboard.launchReadyTitle}: ${launchReadyProfiles.length}`,
        actionLabel: t.dashboard.startAllReady,
        onAction: handleStartAllReadyProfiles,
      };
    }

    if (activeProfiles.length) {
      return {
        title: t.dashboard.nextStepObserveTitle,
        detail: `${t.dashboard.runningNowTitle}: ${activeProfiles.length}`,
        actionLabel: t.dashboard.openProfiles,
        onAction: () => navigate('/profiles'),
      };
    }

    return null;
  }, [
    activeProfiles.length,
    failingProxyIds.length,
    handleRetestAllFailingProxies,
    handleStartAllReadyProfiles,
    launchReadyProfiles.length,
    navigate,
    setupChecklist,
    t.dashboard
  ]);

  const readinessPercent = useMemo(() => {
    if (!setupChecklist.length) return 0;
    const completed = setupChecklist.filter((item) => item.done).length;
    const setupWeight = (completed / setupChecklist.length) * 80;
    const diagnosticsWeight = support?.diagnosticsReady ? 10 : 0;
    const warningsPenalty = Math.min(10, (support?.warnings.length ?? 0) * 5);
    return Math.max(0, Math.min(100, Math.round(setupWeight + diagnosticsWeight - warningsPenalty)));
  }, [setupChecklist, support]);

  const readinessStatus = useMemo(() => {
    if (readinessPercent >= 90) {
      return { strokeColor: '#52c41a', label: t.dashboard.readinessReady };
    }
    if (readinessPercent >= 60) {
      return { strokeColor: '#1677ff', label: t.dashboard.readinessStable };
    }
    if (readinessPercent >= 30) {
      return { strokeColor: '#faad14', label: t.dashboard.readinessInitial };
    }
    return { strokeColor: '#ff4d4f', label: t.dashboard.readinessNeedsSetup };
  }, [readinessPercent, t.dashboard]);

  return {
    setupChecklist,
    nextStep,
    readinessPercent,
    readinessStatus
  };
}
