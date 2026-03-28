import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleOpenCreateProfile: vi.fn(),
  handleOpenOnboarding: vi.fn(),
  handleRetestAllFailingProxies: vi.fn(),
  handleStartAllReadyProfiles: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react', () => ({
  useMemo: <T>(factory: () => T) => factory(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

function createTranslation() {
  return {
    dashboard: {
      checkProfile: 'Check profile',
      checkProfileHint: 'Create your first profile',
      checkProxy: 'Check proxy',
      checkProxyHint: 'Healthy proxy required',
      checkRuntime: 'Check runtime',
      createFirstProfile: 'Create first profile',
      fixRuntimeSetup: 'Fix runtime',
      healthyProxies: 'Healthy proxies',
      launchReadyTitle: 'Launch ready',
      nextStepLaunchTitle: 'Launch ready profiles',
      nextStepObserveTitle: 'Observe active profiles',
      nextStepProxyHint: 'Failing proxies',
      nextStepProxyTitle: 'Retest failing proxies',
      openProfiles: 'Open profiles',
      openProxies: 'Open proxies',
      readinessInitial: 'Initial',
      readinessNeedsSetup: 'Needs setup',
      readinessReady: 'Ready',
      readinessStable: 'Stable',
      retestAllFailing: 'Retest all failing',
      reviewOnboarding: 'Review onboarding',
      runtimeActionHint: 'Finish runtime setup',
      runtimeReadyCount: 'Runtime ready',
      runningNowTitle: 'Running now',
      startAllReady: 'Start all ready',
      totalProfiles: 'Total profiles',
    },
  } as never;
}

describe('useDashboardSetup', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.handleOpenCreateProfile.mockReset();
    mocks.handleOpenOnboarding.mockReset();
    mocks.handleRetestAllFailingProxies.mockReset();
    mocks.handleStartAllReadyProfiles.mockReset();
    mocks.navigate.mockReset();
  });

  it('builds a setup checklist for a workspace that still needs onboarding', async () => {
    const { useDashboardSetup } = await import('./useDashboardSetup');
    const hook = useDashboardSetup(
      [],
      [],
      [],
      0,
      [],
      [],
      [],
      [],
      { diagnosticsReady: false, warnings: [] } as never,
      createTranslation(),
      mocks.handleOpenOnboarding,
      mocks.handleOpenCreateProfile,
      mocks.handleRetestAllFailingProxies,
      mocks.handleStartAllReadyProfiles,
    );

    expect(hook.setupChecklist).toHaveLength(3);
    expect(hook.setupChecklist.every((item) => item.done === false)).toBe(true);
    expect(hook.nextStep?.title).toBe('Check runtime');
    expect(hook.readinessPercent).toBe(0);
    expect(hook.readinessStatus.label).toBe('Needs setup');

    hook.setupChecklist[0]?.onAction();
    hook.setupChecklist[1]?.onAction();
    hook.setupChecklist[2]?.onAction();

    expect(mocks.handleOpenOnboarding).toHaveBeenCalledOnce();
    expect(mocks.handleOpenCreateProfile).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/proxies');
  });

  it('prioritizes retesting failing proxies after setup is otherwise complete', async () => {
    const { useDashboardSetup } = await import('./useDashboardSetup');
    const hook = useDashboardSetup(
      [{ key: 'chrome', available: true }] as never,
      [{ key: 'chrome', available: true }] as never,
      [{ id: 'profile-1' }] as never,
      1,
      [{ id: 'proxy-1' }, { id: 'proxy-2' }] as never,
      ['proxy-2'],
      [],
      [],
      { diagnosticsReady: true, warnings: [] } as never,
      createTranslation(),
      mocks.handleOpenOnboarding,
      mocks.handleOpenCreateProfile,
      mocks.handleRetestAllFailingProxies,
      mocks.handleStartAllReadyProfiles,
    );

    expect(hook.nextStep?.title).toBe('Retest failing proxies');
    expect(hook.readinessPercent).toBe(90);
    expect(hook.readinessStatus.label).toBe('Ready');

    hook.nextStep?.onAction();

    expect(mocks.handleRetestAllFailingProxies).toHaveBeenCalledOnce();
  });

  it('moves to launch-ready work after setup and failing-proxy work are complete', async () => {
    const { useDashboardSetup } = await import('./useDashboardSetup');
    const hook = useDashboardSetup(
      [{ key: 'chrome', available: true }] as never,
      [{ key: 'chrome', available: true }] as never,
      [{ id: 'profile-1' }] as never,
      1,
      [{ id: 'proxy-1' }] as never,
      [],
      [{ id: 'profile-1' }, { id: 'profile-2' }] as never,
      [],
      { diagnosticsReady: true, warnings: ['warn-1', 'warn-2'] } as never,
      createTranslation(),
      mocks.handleOpenOnboarding,
      mocks.handleOpenCreateProfile,
      mocks.handleRetestAllFailingProxies,
      mocks.handleStartAllReadyProfiles,
    );

    expect(hook.nextStep?.title).toBe('Launch ready profiles');
    expect(hook.readinessPercent).toBe(80);
    expect(hook.readinessStatus.label).toBe('Stable');

    hook.nextStep?.onAction();

    expect(mocks.handleStartAllReadyProfiles).toHaveBeenCalledOnce();
  });

  it('falls back to observing active profiles when setup is complete and nothing else is blocked', async () => {
    const { useDashboardSetup } = await import('./useDashboardSetup');
    const hook = useDashboardSetup(
      [{ key: 'chrome', available: true }] as never,
      [{ key: 'chrome', available: true }, { key: 'edge', available: false }] as never,
      [{ id: 'profile-1' }, { id: 'profile-2' }] as never,
      1,
      [{ id: 'proxy-1' }] as never,
      [],
      [],
      [{ id: 'profile-1' }] as never,
      { diagnosticsReady: false, warnings: [] } as never,
      createTranslation(),
      mocks.handleOpenOnboarding,
      mocks.handleOpenCreateProfile,
      mocks.handleRetestAllFailingProxies,
      mocks.handleStartAllReadyProfiles,
    );

    expect(hook.nextStep?.title).toBe('Observe active profiles');
    expect(hook.readinessPercent).toBe(80);
    expect(hook.readinessStatus.label).toBe('Stable');

    hook.nextStep?.onAction();

    expect(mocks.navigate).toHaveBeenCalledWith('/profiles');
  });
});
