import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  buildApiUrl: vi.fn((path: string) => `http://127.0.0.1:3210${path}`),
  feedbackForm: {
    resetFields: vi.fn(),
    validateFields: vi.fn(),
  },
  formUseForm: vi.fn(),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  stateCursor: 0,
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  windowOpen: vi.fn(),
}));

vi.mock('react', () => ({
  useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  useState: <T>(initial: T) => {
    const setter = vi.fn();
    mocks.stateSetters[mocks.stateCursor] = setter;
    mocks.stateCursor += 1;
    return [initial, setter] as const;
  },
}));

vi.mock('antd', () => ({
  Form: {
    useForm: () => {
      mocks.formUseForm();
      return [mocks.feedbackForm];
    },
  },
  message: {
    error: mocks.messageError,
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
  },
}));

vi.mock('../../api/client', () => ({
  apiClient: {
    post: mocks.apiPost,
    put: mocks.apiPut,
  },
  buildApiUrl: mocks.buildApiUrl,
}));

function createTranslation() {
  return {
    dashboard: {
      backupCreated: 'Backup created',
      bulkStartReadyResult: 'Bulk start result',
      bulkStopRunningResult: 'Bulk stop result',
      diagnosticsExportStarted: 'Diagnostics export started',
      feedbackSaved: 'Feedback saved',
      profileStarted: 'Profile started',
      profileStopped: 'Profile stopped',
      proxyRetested: 'Proxy retested',
      selfTestRan: 'Self-test ran',
    },
  } as const;
}

describe('useDashboardActions', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.buildApiUrl.mockClear();
    mocks.feedbackForm.resetFields.mockReset();
    mocks.feedbackForm.validateFields.mockReset();
    mocks.formUseForm.mockReset();
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.stateCursor = 0;
    mocks.stateSetters = [];
    mocks.windowOpen.mockReset();
    vi.stubGlobal('window', {
      open: mocks.windowOpen,
    });
  });

  it('starts and stops individual profiles, refreshing the dashboard on success', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: true, data: { id: 'profile-1' } })
      .mockResolvedValueOnce({ success: false, error: 'Stop failed' });

    const { useDashboardActions } = await import('./useDashboardActions');
    const loadDashboard = vi.fn().mockResolvedValue(undefined);
    const hook = useDashboardActions(
      loadDashboard,
      createTranslation(),
      [],
      [],
      [],
    );

    await hook.handleStartProfile('profile-1');
    await hook.handleStopProfile('profile-1');

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/profiles/profile-1/start');
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/api/profiles/profile-1/stop');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Profile started');
    expect(mocks.messageError).toHaveBeenCalledWith('Stop failed');
    expect(loadDashboard).toHaveBeenCalledTimes(1);
  });

  it('handles bulk start/stop and proxy retest flows with summary messages', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: true, data: { id: 'profile-1' } })
      .mockResolvedValueOnce({ success: false, error: 'Profile 2 failed' })
      .mockResolvedValueOnce({ success: true, data: { id: 'profile-3' } })
      .mockResolvedValueOnce({ success: true, data: { id: 'profile-4' } })
      .mockResolvedValueOnce({ success: true, data: { total: 1, healthy: 1, failing: 0 } })
      .mockResolvedValueOnce({ success: true, data: { total: 2, healthy: 1, failing: 1 } });

    const { useDashboardActions } = await import('./useDashboardActions');
    const loadDashboard = vi.fn().mockResolvedValue(undefined);
    const hook = useDashboardActions(
      loadDashboard,
      createTranslation(),
      [{ id: 'profile-1' }, { id: 'profile-2' }] as never,
      [{ id: 'profile-3' }, { id: 'profile-4' }] as never,
      ['proxy-1', 'proxy-2'],
    );

    await hook.handleStartAllReadyProfiles();
    await hook.handleStopAllRunningProfiles();
    await hook.handleRetestProxy({ id: 'profile-3', proxy: { id: 'proxy-3' } } as never);
    await hook.handleRetestAllFailingProxies();

    expect(mocks.messageWarning).toHaveBeenCalledWith('Bulk start result: 1/2');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Bulk stop result: 2/2');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Proxy retested: OK 1 · FAIL 0');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Proxy retested: OK 1 · FAIL 1');
    expect(loadDashboard).toHaveBeenCalledTimes(4);
  });

  it('runs support actions, creates backups, reopens onboarding, and submits feedback', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: true, data: { status: 'pass' } })
      .mockResolvedValueOnce({ success: true, data: { filename: 'backup-1.zip' } })
      .mockResolvedValueOnce({ success: true, data: { id: 'feedback-1' } });
    mocks.apiPut.mockResolvedValue({ success: true, data: null });
    mocks.feedbackForm.validateFields.mockResolvedValue({
      category: 'bug',
      sentiment: 'negative',
      message: 'Need more diagnostics',
      email: 'qa@example.com',
    });

    const { useDashboardActions } = await import('./useDashboardActions');
    const loadDashboard = vi.fn().mockResolvedValue(undefined);
    const hook = useDashboardActions(
      loadDashboard,
      createTranslation(),
      [],
      [],
      [],
    );

    await hook.handleRunSelfTest();
    hook.handleExportDiagnostics();
    await hook.handleCreateBackup();
    await hook.handleOpenOnboarding();
    await hook.handleSubmitFeedback();

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/support/self-test');
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/api/backups');
    expect(mocks.apiPost).toHaveBeenNthCalledWith(3, '/api/support/feedback', {
      category: 'bug',
      sentiment: 'negative',
      message: 'Need more diagnostics',
      email: 'qa@example.com',
      appVersion: '',
    });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/config', { onboardingCompleted: false });
    expect(mocks.windowOpen).toHaveBeenCalledWith('http://127.0.0.1:3210/api/support/diagnostics', '_blank');
    expect(mocks.feedbackForm.resetFields).toHaveBeenCalledOnce();
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Self-test ran');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Diagnostics export started');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Backup created: backup-1.zip');
    expect(mocks.messageSuccess).toHaveBeenCalledWith('Feedback saved');
    expect(mocks.stateSetters[9]).toHaveBeenCalledWith({ status: 'pass' });
    expect(mocks.stateSetters[10]).toHaveBeenCalledWith(true);
    expect(loadDashboard).toHaveBeenCalledTimes(2);
  });
});
