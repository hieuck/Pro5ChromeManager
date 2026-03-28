import { beforeEach, describe, expect, it, vi } from 'vitest';

const latestIncident = {
  level: 'error',
  message: 'latest incident',
  source: 'renderer',
  timestamp: '2026-03-27T12:00:00.000Z',
};

const topSourceLatestIncident = {
  level: 'warn',
  message: 'top source incident',
  source: 'proxy',
  timestamp: '2026-03-27T11:00:00.000Z',
};

const mocks = vi.hoisted(() => ({
  buildDashboardIncidentDigest: vi.fn(),
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
  buildDashboardIncidentDigest: mocks.buildDashboardIncidentDigest,
}));

describe('useDashboardIncidents', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.buildDashboardIncidentDigest.mockReset();
    mocks.buildDashboardIncidentDigest.mockReturnValue({
      errorRatio: 60,
      errors: 3,
      freshness: { label: 'fresh' },
      heat: { label: 'high' },
      incidentAction: 'focused',
      incidentActionHint: 'Drill into top source',
      incidents15: 2,
      incidents60: 5,
      latestIncident,
      sourceMode: { label: 'focused' },
      sourceModeHint: 'Top source dominates',
      topSource: ['renderer', 4],
      topSourceFreshness: { label: 'now' },
      topSourceLatestIncident,
      topSourceRatio: 66,
      topSources: [['renderer', 4], ['proxy', 2]],
      topSourcesConcentration: 80,
      total: 6,
      trend: { label: 'up' },
      warnings: 3,
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
      settings: {
        noneValue: 'None',
      },
    } as never;
  }

  it('routes incident actions to focused, recent, and latest log views', async () => {
    const { useDashboardIncidents } = await import('./useDashboardIncidents');
    const hook = useDashboardIncidents(
      [latestIncident] as never,
      [],
      createTranslation(),
      (level) => `level:${level}`,
      (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
    );

    expect(hook.incidentSuggestedActionLabel).toBe('openTopSource');

    hook.handleIncidentSuggestedAction();
    hook.handleOpenIncidentSource('proxy');
    hook.handleOpenTopIncidentSource();
    hook.handleOpenLatestIncident();
    hook.handleOpenTopSourceLatestIncident();
    hook.handleOpenRecentLogs();

    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetSourceFilter: 'renderer' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetSourceFilter: 'proxy' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetQuery: 'latest incident' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetQuery: 'top source incident' }),
    }));
    expect(mocks.navigate).toHaveBeenCalledWith('/logs', expect.objectContaining({
      state: expect.objectContaining({ presetFilter: 'issues', presetRecentWindowOnly: true, presetSortOrder: 'newest' }),
    }));
  });

  it('copies incident summaries through the clipboard when digest data is available', async () => {
    const { useDashboardIncidents } = await import('./useDashboardIncidents');
    const hook = useDashboardIncidents(
      [latestIncident] as never,
      [],
      createTranslation(),
      (level) => `level:${level}`,
      (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
    );

    await hook.handleCopyIncidentDigest();
    await hook.handleCopyLatestIncident();
    await hook.handleCopyTopIncidentSource();
    await hook.handleCopyTopIncidentSources();
    await hook.handleCopyTopSourceLatestIncident();

    expect(mocks.writeText).toHaveBeenCalledTimes(5);
    expect(mocks.messageSuccess).toHaveBeenCalledTimes(5);
  });

  it('warns when incident digest data is unavailable', async () => {
    mocks.buildDashboardIncidentDigest.mockReturnValue(null);

    const { useDashboardIncidents } = await import('./useDashboardIncidents');
    const hook = useDashboardIncidents(
      [],
      [],
      createTranslation(),
      (level) => `level:${level}`,
      () => 'none',
    );

    await hook.handleCopyIncidentDigest();
    await hook.handleCopyLatestIncident();
    await hook.handleCopyTopIncidentSource();
    await hook.handleCopyTopIncidentSources();
    await hook.handleCopyTopSourceLatestIncident();
    hook.handleIncidentSuggestedAction();

    expect(mocks.messageWarning).toHaveBeenCalledTimes(5);
    expect(hook.incidentSuggestedActionLabel).toBe('openLatestIncident');
  });

  it('shows an error toast when clipboard writes fail', async () => {
    mocks.writeText.mockRejectedValue(new Error('clipboard unavailable'));

    const { useDashboardIncidents } = await import('./useDashboardIncidents');
    const hook = useDashboardIncidents(
      [latestIncident] as never,
      [],
      createTranslation(),
      (level) => `level:${level}`,
      (entry) => entry ? `${entry.level}:${entry.message}` : 'none',
    );

    await hook.handleCopyLatestIncident();

    expect(mocks.messageError).toHaveBeenCalledWith('latestIncidentCopyFailed');
  });
});
