import { beforeEach, describe, expect, it, vi } from 'vitest';

const latestEntry = {
  level: 'error',
  message: 'latest activity',
  raw: 'latest raw',
  source: 'source-a',
  timestamp: '2026-03-27T12:00:00.000Z',
};

const hottestEntry = {
  level: 'warn',
  message: 'hottest issue',
  raw: 'hot raw',
  source: 'source-b',
  timestamp: '2026-03-27T11:00:00.000Z',
};

const mocks = vi.hoisted(() => ({
  buildActivityDigestText: vi.fn(() => 'activity digest'),
  buildDashboardActivityInsights: vi.fn(),
  buildHottestIssueDigestText: vi.fn(() => 'hottest digest'),
  buildLatestActivityDigestText: vi.fn(() => 'latest digest'),
  buildTopActivityIssuesText: vi.fn(() => 'top issues digest'),
  buildTopActivitySourceLatestText: vi.fn(() => 'top source latest digest'),
  buildTopActivitySourcesText: vi.fn(() => 'top sources digest'),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  navigate: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useMemo: <T>(factory: () => T) => factory(),
  useState: <T>(initial: T) => [initial, vi.fn()],
}));

vi.mock('antd', () => ({
  message: {
    error: mocks.messageError,
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('./insights', () => ({
  buildDashboardActivityInsights: mocks.buildDashboardActivityInsights,
}));

vi.mock('./dashboardActivityCopyText', () => ({
  buildActivityDigestText: mocks.buildActivityDigestText,
  buildHottestIssueDigestText: mocks.buildHottestIssueDigestText,
  buildLatestActivityDigestText: mocks.buildLatestActivityDigestText,
  buildTopActivityIssuesText: mocks.buildTopActivityIssuesText,
  buildTopActivitySourceLatestText: mocks.buildTopActivitySourceLatestText,
  buildTopActivitySourcesText: mocks.buildTopActivitySourcesText,
}));

describe('useDashboardActivity', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.buildActivityDigestText.mockClear();
    mocks.buildDashboardActivityInsights.mockReset();
    mocks.buildDashboardActivityInsights.mockReturnValue({
      activityDigest: {
        activityAction: 'source',
        activityFreshness: { label: 'fresh' },
        activitySignalMode: { label: 'spike' },
        activitySourceMode: { label: 'focused' },
        debugs: 1,
        errors: 3,
        hottestIssueFreshness: { label: 'fresh' },
        hottestIssueLevel: { label: 'warn' },
        hottestRecentIssue: { count: 2, entry: hottestEntry },
        infos: 4,
        issueRatio: 50,
        issues15: 2,
        issues60: 6,
        latestActivityLevel: { label: 'error' },
        latestEntry,
        topRecentIssues: [['issue-a', 2]],
        topSource: ['source-a', 4],
        topSourceLatestEntry: latestEntry,
        topSourceLatestFreshness: { label: 'now' },
        topSourceLatestLevel: { label: 'error' },
        topSourceShare: 60,
        topSources: [['source-a', 4], ['source-b', 2]],
        topSourcesConcentration: 80,
        total: 10,
        warnings: 2,
      },
      hottestRecentIssue: { count: 2, entry: hottestEntry },
      logHeat: { label: 'Hot' },
      topRecentIssues: [['issue-a', 2]],
    });
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.navigate.mockReset();
    mocks.writeText.mockReset();
    mocks.writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: mocks.writeText,
      },
    });
  });

  function createTranslation() {
    return {
      dashboard: new Proxy({}, {
        get: (_target, property) => String(property),
      }),
    } as never;
  }

  it('routes activity actions to the expected log destinations', async () => {
    const { useDashboardActivity } = await import('./useDashboardActivity');
    const handleOpenLogEntry = vi.fn();
    const hook = useDashboardActivity(
      [latestEntry] as never,
      createTranslation(),
      (level) => `level:${level}`,
      (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
      handleOpenLogEntry,
    );

    expect(hook.activitySuggestedActionLabel).toBe('openTopActivitySource');

    hook.handleActivitySuggestedAction();
    hook.handleOpenActivitySource('source-b');
    hook.handleOpenTopActivitySourceLatest();
    hook.handleOpenHottestIssueLogs();
    hook.handleOpenRecentLogs();
    hook.handleOpenLatestActivity();
    hook.handleOpenActivityIssue('renderer crash');

    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetSourceFilter: 'source-a' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetSourceFilter: 'source-b' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetFilter: 'issues', presetRecentWindowOnly: true, presetSortOrder: 'newest' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetQuery: 'renderer crash' }),
    }));
    expect(handleOpenLogEntry).toHaveBeenCalledWith(latestEntry);
    expect(handleOpenLogEntry).toHaveBeenCalledWith(hottestEntry);
  });

  it('copies all activity digests through the clipboard when data is available', async () => {
    const { useDashboardActivity } = await import('./useDashboardActivity');
    const hook = useDashboardActivity(
      [latestEntry] as never,
      createTranslation(),
      (level) => `level:${level}`,
      (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
      vi.fn(),
    );

    await hook.handleCopyHottestIssue();
    await hook.handleCopyActivityDigest();
    await hook.handleCopyLatestActivity();
    await hook.handleCopyTopActivityIssues();
    await hook.handleCopyTopActivitySourceLatest();
    await hook.handleCopyTopActivitySources();

    expect(mocks.writeText).toHaveBeenCalledTimes(6);
    expect(mocks.messageSuccess).toHaveBeenCalledTimes(6);
    expect(mocks.buildHottestIssueDigestText).toHaveBeenCalled();
    expect(mocks.buildActivityDigestText).toHaveBeenCalled();
    expect(mocks.buildLatestActivityDigestText).toHaveBeenCalledWith(expect.anything(), latestEntry);
    expect(mocks.buildTopActivityIssuesText).toHaveBeenCalled();
    expect(mocks.buildTopActivitySourceLatestText).toHaveBeenCalled();
    expect(mocks.buildTopActivitySourcesText).toHaveBeenCalled();
  });

  it('warns when digest data is unavailable', async () => {
    mocks.buildDashboardActivityInsights.mockReturnValue({
      activityDigest: null,
      hottestRecentIssue: null,
      logHeat: { label: 'Idle' },
      topRecentIssues: [],
    });

    const { useDashboardActivity } = await import('./useDashboardActivity');
    const hook = useDashboardActivity(
      [],
      createTranslation(),
      (level) => `level:${level}`,
      () => 'none',
      vi.fn(),
    );

    await hook.handleCopyHottestIssue();
    await hook.handleCopyActivityDigest();
    await hook.handleCopyLatestActivity();
    await hook.handleCopyTopActivityIssues();
    await hook.handleCopyTopActivitySourceLatest();
    await hook.handleCopyTopActivitySources();
    hook.handleActivitySuggestedAction();

    expect(mocks.messageWarning).toHaveBeenCalledTimes(6);
    expect(hook.activitySuggestedActionLabel).toBe('openLatestActivity');
  });

  it('shows an error toast when clipboard writes fail', async () => {
    mocks.writeText.mockRejectedValue(new Error('clipboard unavailable'));

    const { useDashboardActivity } = await import('./useDashboardActivity');
    const hook = useDashboardActivity(
      [latestEntry] as never,
      createTranslation(),
      (level) => `level:${level}`,
      (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
      vi.fn(),
    );

    await hook.handleCopyLatestActivity();

    expect(mocks.messageError).toHaveBeenCalledWith('latestActivityCopyFailed');
  });
});
