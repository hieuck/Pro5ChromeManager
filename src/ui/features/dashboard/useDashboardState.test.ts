import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  incidentPanel: { incidentDigest: { total: 1 } },
  activityPanel: { activityDigest: { total: 2 } },
  dashboardData: {} as Record<string, unknown>,
  navigate: vi.fn(),
  setOnboardingOpen: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useEffect: (effect: () => void) => effect(),
  useMemo: <T>(factory: () => T) => factory(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../shared/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: {
      logs: {
        filterDebug: 'Debug',
        filterError: 'Error',
        filterInfo: 'Info',
        filterWarn: 'Warn',
      },
      settings: {
        feedbackCategoryBug: 'Bug',
        feedbackCategoryFeedback: 'Feedback',
        feedbackCategoryQuestion: 'Question',
        feedbackSentimentNegative: 'Negative',
        feedbackSentimentNeutral: 'Neutral',
        feedbackSentimentPositive: 'Positive',
        incidentLevelError: 'Error',
        incidentLevelWarn: 'Warn',
        noneValue: 'None',
        onboardingStateCompleted: 'Completed',
        onboardingStateInProgress: 'In progress',
        onboardingStateNotStarted: 'Not started',
        onboardingStateProfileCreated: 'Profile created',
        onboardingStateSkipped: 'Skipped',
        statusFail: 'Fail',
        statusPass: 'Pass',
        statusWarn: 'Warn',
      },
    },
  }),
}));

vi.mock('./useDashboardData', () => ({
  useDashboardData: () => mocks.dashboardData,
}));

vi.mock('./useDashboardActions', () => ({
  useDashboardActions: () => ({
    handleOpenOnboarding: vi.fn(),
    handleRetestAllFailingProxies: vi.fn(),
    handleStartAllReadyProfiles: vi.fn(),
    loadDashboard: vi.fn(),
    onboardingOpen: false,
    setOnboardingOpen: mocks.setOnboardingOpen,
  }),
}));

vi.mock('./useDashboardSetup', () => ({
  useDashboardSetup: () => ({ setupReady: true }),
}));

vi.mock('./useDashboardIncidents', () => ({
  useDashboardIncidents: () => mocks.incidentPanel,
}));

vi.mock('./useDashboardActivity', () => ({
  useDashboardActivity: () => mocks.activityPanel,
}));

describe('useDashboardState', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.activityPanel = { activityDigest: { total: 2 } };
    mocks.incidentPanel = { incidentDigest: { total: 1 } };
    mocks.navigate.mockReset();
    mocks.setOnboardingOpen.mockReset();
    mocks.dashboardData = {
      incidents: [],
      instances: {
        'profile-1': { status: 'running' },
        'profile-2': { status: 'stopped' },
        'profile-3': { status: 'unreachable' },
      },
      loadDashboard: vi.fn(),
      loading: false,
      logs: [],
      profiles: [
        { id: 'profile-1', lastUsedAt: '2026-03-27T12:00:00.000Z', proxy: null },
        { id: 'profile-2', lastUsedAt: '2026-03-27T11:00:00.000Z', proxy: { id: 'proxy-1', lastCheckStatus: 'healthy' } },
        { id: 'profile-3', lastUsedAt: '2026-03-27T10:00:00.000Z', proxy: { id: 'proxy-2', lastCheckStatus: 'failing' } },
      ],
      proxies: [
        { id: 'proxy-1', lastCheckStatus: 'healthy' },
        { id: 'proxy-2', lastCheckStatus: 'failing' },
      ],
      runtimes: [
        { key: 'runtime-a', available: true },
        { key: 'runtime-b', available: false },
      ],
      support: {
        onboardingCompleted: false,
      },
    };
  });

  it('derives dashboard counts, lists, and labels from the composed hook state', async () => {
    const { useDashboardState } = await import('./useDashboardState');
    const state = useDashboardState();

    expect(state.runningProfiles).toBe(1);
    expect(state.healthyProxies).toBe(1);
    expect(state.availableRuntimes).toEqual([{ key: 'runtime-a', available: true }]);
    expect(state.failingProxyIds).toEqual(['proxy-2']);
    expect(state.recentProfiles.map((profile) => profile.id)).toEqual(['profile-1', 'profile-2', 'profile-3']);
    expect(state.activeProfiles.map((profile) => profile.id)).toEqual(['profile-1']);
    expect(state.launchReadyProfiles.map((profile) => profile.id)).toEqual(['profile-2']);
    expect(state.profilesNeedingAttention.map((profile) => profile.id)).toEqual(['profile-3']);
    expect(state.getLogLevelLabel('error')).toBe('Error');
    expect(state.getIncidentLevelLabel('warn')).toBe('Warn');
    expect(state.getFeedbackCategoryLabel('bug')).toBe('Bug');
    expect(state.getFeedbackSentimentLabel('positive')).toBe('Positive');
    expect(state.getOnboardingStatusLabel('profile_created')).toBe('Profile created');
    expect(state.getSelfTestStatusLabel('pass')).toBe('Pass');
    expect(state.formatMaybeValue(null)).toBe('None');
    expect(state.formatIncidentSummary()).toBe('None');
    expect(state.formatActivitySummary()).toBe('None');
    expect(state.setupReady).toBe(true);
    expect(state.incidentDigest.total).toBe(1);
    expect(state.activityDigest.total).toBe(2);
  });

  it('opens onboarding instead of profile creation when no runtime is available', async () => {
    mocks.dashboardData = {
      ...mocks.dashboardData,
      profiles: [],
      runtimes: [],
      support: {
        onboardingCompleted: false,
      },
    };

    const { useDashboardState } = await import('./useDashboardState');
    const state = useDashboardState();

    state.handleOpenCreateProfile();

    expect(mocks.setOnboardingOpen).toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('navigates to profile creation when at least one runtime is available', async () => {
    const { useDashboardState } = await import('./useDashboardState');
    const state = useDashboardState();

    state.handleOpenCreateProfile();

    expect(mocks.navigate).toHaveBeenCalledWith('/profiles', { state: { openCreate: true } });
  });

  it('auto-opens onboarding after loading when the workspace has no profiles yet', async () => {
    mocks.dashboardData = {
      ...mocks.dashboardData,
      profiles: [],
      support: {
        onboardingCompleted: false,
      },
    };

    const { useDashboardState } = await import('./useDashboardState');
    useDashboardState();

    expect(mocks.setOnboardingOpen).toHaveBeenCalledWith(true);
  });

  it('opens the logs page with severity-aware defaults for a selected log entry', async () => {
    const { useDashboardState } = await import('./useDashboardState');
    const state = useDashboardState();

    state.handleOpenLogEntry({
      level: 'error',
      message: 'renderer crashed',
      timestamp: '2026-03-27T12:00:00.000Z',
    });

    expect(mocks.navigate).toHaveBeenCalledWith('/logs', {
      state: {
        presetFilter: 'issues',
        presetQuery: 'renderer crashed',
        presetRecentWindowOnly: true,
      },
    });
  });
});
